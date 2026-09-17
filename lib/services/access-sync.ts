// filepath: lib/services/access-sync.ts
/**
 * Access sync-plan engine (pure logic — no React, no Firestore, no network).
 *
 * The Client_Access sheet is the source of truth for BUSINESS-LEAD per-client
 * access. Given the sheet rows, the current users, and the set of real client
 * ids, this computes exactly what an import WOULD do — the plan the preview
 * shows and the apply step executes. Keeping it pure means it is fully
 * unit-testable and shared by both the preview and the apply.
 *
 * Scope rules (locked with the team):
 *  - Manages the client SCOPE of ACTIVE BUSINESS_LEAD and VIEWER users. It never
 *    changes anyone's ROLE — access level is a manual admin decision. A VIEWER
 *    stays a VIEWER (dashboard access to their sheet clients, no editing); a
 *    BUSINESS_LEAD stays a BL. Promotion, if ever needed, is done by an admin.
 *  - NEVER touches ADMIN or EXEC users (assigned manually), disabled/revoked
 *    accounts, or emails that aren't a user yet (invite-first gate).
 *  - Full sync: for a managed user, assignedClients becomes EXACTLY their sheet
 *    rows — additions AND removals. A managed BL who is absent from the sheet
 *    entirely has all their client access removed (the "person left / was
 *    reassigned — delete their rows" case).
 *  - Clears any assignedAgencies blanket on a managed user (the Kevin fix), so a
 *    synced person's access is exactly their sheet clients, never agency-wide.
 *  - Client ids are matched on the client DOCUMENT id (not CL_ID, which is
 *    sometimes missing). Unknown ids are flagged, never silently granted.
 *
 * This module computes; it does not write. The apply step consumes `writes`.
 */

export type UserRole = "ADMIN" | "EXEC" | "BUSINESS_LEAD" | "VIEWER";

export interface AccessUser {
  uid: string;
  email: string;
  role: UserRole;
  assignedClients: string[];
  assignedAgencies?: string[];
  disabled?: boolean;
}

export interface SheetRow {
  clientId: string; // client DOCUMENT id
  email: string;
  // client_name is display-only in the sheet and intentionally ignored here.
}

export type SkipReason =
  | "not-a-user" // email has never signed in / no profile — invite first
  | "pending-invite" // invited, awaiting first sign-in — grant applies after
  | "revoked" // account disabled — restore in admin first
  | "admin-exec"; // ADMIN/EXEC — managed manually, never changed by the sheet

export interface UserChange {
  uid: string;
  email: string;
  role: UserRole; // current role
  clearAgencies: boolean; // had an agency blanket that will be cleared
  addClientIds: string[]; // gained
  removeClientIds: string[]; // lost
  finalClientIds: string[]; // assignedClients after the sync
}

export interface SkippedEmail {
  email: string;
  reason: SkipReason;
  clientIdsInSheet: string[]; // what the sheet asked for (for the preview)
}

/** One concrete write for the apply step. Only the listed fields change. */
export interface AccessWrite {
  uid: string;
  email: string;
  assignedClients: string[];
  clearAgencies?: boolean; // when true, set assignedAgencies = []
}

export interface AccessSyncPlan {
  changes: UserChange[]; // managed users whose access changes
  skipped: SkippedEmail[]; // emails in the sheet the sync won't act on
  unknownClientIds: string[]; // ids in the sheet not matching any client
  writes: AccessWrite[]; // exact writes the apply step performs
  summary: {
    usersChanged: number;
    clientsAdded: number; // total (client,user) grants added
    clientsRemoved: number; // total (client,user) grants removed
    usersEmptied: number; // managed BLs removed from ALL clients
    agenciesCleared: number;
    skippedCount: number;
    unknownClientCount: number;
  };
}

export interface AccessSyncInput {
  sheetRows: SheetRow[];
  users: AccessUser[];
  validClientIds: Iterable<string>; // all real client document ids
  pendingInviteEmails?: Iterable<string>; // emails with a pending invite
}

const norm = (email: string): string => email.trim().toLowerCase();

function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export function computeAccessSync(input: AccessSyncInput): AccessSyncPlan {
  const validIds = new Set(input.validClientIds);
  const pending = new Set([...(input.pendingInviteEmails ?? [])].map(norm));

  // Index users by normalized email. A disabled user is tracked separately so
  // we can give a precise "restore first" message instead of "not a user".
  const activeByEmail = new Map<string, AccessUser>();
  const disabledEmails = new Set<string>();
  for (const u of input.users) {
    const e = norm(u.email);
    if (u.disabled) disabledEmails.add(e);
    else activeByEmail.set(e, u);
  }

  // Group sheet rows by email -> set of client ids (deduped). Collect unknown ids.
  const sheetByEmail = new Map<string, Set<string>>();
  const unknown = new Set<string>();
  for (const row of input.sheetRows) {
    const e = norm(row.email);
    const id = row.clientId.trim();
    if (!e || !id) continue;
    if (!validIds.has(id)) {
      unknown.add(id);
      continue; // never grant an id that matches no client
    }
    let set = sheetByEmail.get(e);
    if (!set) {
      set = new Set<string>();
      sheetByEmail.set(e, set);
    }
    set.add(id);
  }

  const changes: UserChange[] = [];
  const skipped: SkippedEmail[] = [];
  const writes: AccessWrite[] = [];

  // 1. Walk every email named in the sheet.
  for (const [email, desiredSet] of sheetByEmail) {
    const desired = sortedUnique(desiredSet);
    const user = activeByEmail.get(email);

    if (!user) {
      const reason: SkipReason = disabledEmails.has(email)
        ? "revoked"
        : pending.has(email)
        ? "pending-invite"
        : "not-a-user";
      skipped.push({ email, reason, clientIdsInSheet: desired });
      continue;
    }

    if (user.role === "ADMIN" || user.role === "EXEC") {
      skipped.push({ email, reason: "admin-exec", clientIdsInSheet: desired });
      continue;
    }

    // Managed: BUSINESS_LEAD or VIEWER.
    const current = new Set(user.assignedClients);
    const desiredKeep = new Set(desired);
    const add = desired.filter((id) => !current.has(id));
    const remove = [...current].filter((id) => !desiredKeep.has(id)).sort();
    const clearAgencies = (user.assignedAgencies?.length ?? 0) > 0;

    if (add.length || remove.length || clearAgencies) {
      changes.push({
        uid: user.uid,
        email: user.email,
        role: user.role,
        clearAgencies,
        addClientIds: add,
        removeClientIds: remove,
        finalClientIds: desired,
      });
      writes.push({
        uid: user.uid,
        email: user.email,
        assignedClients: desired,
        ...(clearAgencies ? { clearAgencies: true } : {}),
      });
    }
  }

  // 2. Full-sync removals: active managed users (VIEWER or BUSINESS_LEAD) NOT in
  //    the sheet at all lose their client access (row deleted = access removed).
  //    Role and disabled stay as-is (level is a manual admin decision); we empty
  //    their clients and clear any agency blanket so the revoke is complete.
  for (const user of input.users) {
    if (user.disabled) continue;
    if (user.role !== "BUSINESS_LEAD" && user.role !== "VIEWER") continue;
    const e = norm(user.email);
    if (sheetByEmail.has(e)) continue; // handled above

    const hadClients = user.assignedClients.length > 0;
    const hadAgencies = (user.assignedAgencies?.length ?? 0) > 0;
    if (!hadClients && !hadAgencies) continue; // already empty — nothing to do

    changes.push({
      uid: user.uid,
      email: user.email,
      role: user.role,
      clearAgencies: hadAgencies,
      addClientIds: [],
      removeClientIds: [...user.assignedClients].sort(),
      finalClientIds: [],
    });
    writes.push({
      uid: user.uid,
      email: user.email,
      assignedClients: [],
      ...(hadAgencies ? { clearAgencies: true } : {}),
    });
  }

  const clientsAdded = changes.reduce((n, c) => n + c.addClientIds.length, 0);
  const clientsRemoved = changes.reduce((n, c) => n + c.removeClientIds.length, 0);
  const usersEmptied = changes.filter(
    (c) => c.finalClientIds.length === 0 && c.removeClientIds.length > 0
  ).length;
  const agenciesCleared = changes.filter((c) => c.clearAgencies).length;

  return {
    changes,
    skipped,
    unknownClientIds: sortedUnique(unknown),
    writes,
    summary: {
      usersChanged: changes.length,
      clientsAdded,
      clientsRemoved,
      usersEmptied,
      agenciesCleared,
      skippedCount: skipped.length,
      unknownClientCount: unknown.size,
    },
  };
}

/** Build export rows (one per grant) from current managed users. Sheet order:
 *  client_doc_id, client_name (display only), email. */
export function buildExportRows(
  users: AccessUser[],
  clientNameById: Map<string, string>
): { clientId: string; clientName: string; email: string }[] {
  const rows: { clientId: string; clientName: string; email: string }[] = [];
  for (const u of users) {
    if (u.disabled) continue;
    // Export every tier the sheet governs (VIEWER + BUSINESS_LEAD) so an
    // export -> edit -> import round-trip never silently drops a managed grant.
    if (u.role !== "BUSINESS_LEAD" && u.role !== "VIEWER") continue;
    for (const clientId of sortedUnique(u.assignedClients)) {
      rows.push({
        clientId,
        clientName: clientNameById.get(clientId) ?? "",
        email: u.email,
      });
    }
  }
  // Stable, human-friendly order: by email, then client name.
  rows.sort(
    (a, b) =>
      a.email.localeCompare(b.email) || a.clientName.localeCompare(b.clientName)
  );
  return rows;
}