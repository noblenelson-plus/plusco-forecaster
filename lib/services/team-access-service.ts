// lib/services/team-access-service.ts

/**
 * Applies client-team access (lib/format/client-team.ts) to Firestore: the
 * `users` docs (assignedClients, Viewer → Business Lead) and pending `invites`
 * for team members who haven't signed in yet. Admin-only writes, allowed by
 * the existing users/invites rules.
 *
 * Called after a client save, after a CSV import, and by the Clients page's
 * one-time "Sync team access" backfill.
 */

import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { createInvite } from "./invite-service";
import {
  planTeamAccess,
  type TeamAccessPlan,
  type TeamChange,
  type TeamInvite,
  type TeamUser,
} from "../format/client-team";
import type { UserRole } from "../types/user.types";

const BATCH_SIZE = 500;

/** Loads users + pending invites and plans the writes (does not write). */
export async function planTeamAccessChanges(changes: TeamChange[]): Promise<TeamAccessPlan> {
  if (changes.length === 0) return { users: [], invites: [] };
  const [userSnap, inviteSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "invites")),
  ]);
  const users: TeamUser[] = userSnap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      email: String(u.email ?? ""),
      role: (u.role ?? "VIEWER") as UserRole,
      assignedClients: Array.isArray(u.assignedClients) ? u.assignedClients : [],
      disabled: u.disabled === true,
    };
  });
  const invites: TeamInvite[] = inviteSnap.docs.map((d) => {
    const v = d.data();
    return {
      email: d.id,
      role: (v.role ?? "VIEWER") as UserRole,
      assignedClients: Array.isArray(v.assignedClients) ? v.assignedClients : [],
    };
  });
  return planTeamAccess({ changes, users, invites });
}

/** Writes a plan: user docs in batches, then invites. */
export async function applyTeamAccessPlan(
  plan: TeamAccessPlan,
  createdBy?: string | null
): Promise<void> {
  for (let start = 0; start < plan.users.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const w of plan.users.slice(start, start + BATCH_SIZE)) {
      batch.update(doc(db, "users", w.uid), {
        assignedClients: w.assignedClients,
        ...(w.role ? { role: w.role } : {}),
      });
    }
    await batch.commit();
  }
  for (const inv of plan.invites) {
    await createInvite(inv.email, inv.role, inv.assignedClients, createdBy);
  }
}

/** Plans and applies in one go; returns what changed (for feedback). */
export async function syncTeamAccess(
  changes: TeamChange[],
  createdBy?: string | null
): Promise<TeamAccessPlan> {
  const plan = await planTeamAccessChanges(changes);
  await applyTeamAccessPlan(plan, createdBy);
  return plan;
}
