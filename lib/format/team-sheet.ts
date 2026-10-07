// lib/format/team-sheet.ts

/**
 * Client teams as a flat sheet — Admin → Forecast Access export / import. Pure
 * (no Firebase): the service layer reads/writes Sheets and Firestore.
 *
 * One row per person per client: Client ID, Client Name, Role, Email. Role is
 * GM, Business Lead, Digital Lead or Collaborator. Import treats the sheet as
 * the full list FOR EACH CLIENT IT MENTIONS: that client's BL / DL /
 * collaborators become exactly the sheet's rows (missing rows remove people).
 * Clients with no row at all are left untouched, so a filtered or partial
 * sheet can't wipe access. GM rows are read-only — the GM comes from the
 * client's GM Pod (GM_POD_EMAILS) — and are only checked.
 */

import type { Client } from "../types/client.types";
import { isValidEmail, normalizeEmail, normalizeEmailList } from "./email";
import { computeTeamEmails, teamSeats, TEAM_ROLE_LABELS, type TeamRole } from "./client-team";

export const TEAM_SHEET_HEADERS = ["Client ID", "Client Name", "Role", "Email"] as const;

/** Role labels as written in the sheet (the dropdown values). */
export const TEAM_SHEET_ROLES: string[] = (["GM", "BL", "DL", "COLLABORATOR"] as TeamRole[]).map(
  (r) => TEAM_ROLE_LABELS[r]
);

const ROLE_BY_LABEL = new Map<string, TeamRole>([
  ["gm", "GM"],
  ["business lead", "BL"],
  ["bl", "BL"],
  ["digital lead", "DL"],
  ["dl", "DL"],
  ["collaborator", "COLLABORATOR"],
  ["collab", "COLLABORATOR"],
  ["collab.", "COLLABORATOR"],
]);

type TeamClient = Pick<
  Client,
  "cl_id" | "CL_Name" | "CL_Business_Lead" | "CL_Digital_Lead" | "GM_Pod" | "CL_Collaborators"
>;

// ─── Export ───────────────────────────────────────────────────────────────────

/** Header + one row per (client, seat), sorted by client name then role. */
export function buildTeamSheet(clients: TeamClient[]): string[][] {
  const order: Record<TeamRole, number> = { GM: 0, BL: 1, DL: 2, COLLABORATOR: 3 };
  const rows: string[][] = [];
  for (const c of [...clients].sort((a, b) => a.CL_Name.localeCompare(b.CL_Name))) {
    const seats = teamSeats(c).sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
    for (const s of seats) rows.push([c.cl_id, c.CL_Name, TEAM_ROLE_LABELS[s.role], s.email]);
  }
  return [[...TEAM_SHEET_HEADERS], ...rows];
}

// ─── Import ───────────────────────────────────────────────────────────────────

/** Thrown when the table isn't shaped like an export (nothing to review). */
export class TeamSheetStructureError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

export interface TeamSheetIssue {
  /** 1-based sheet row (header = row 1); null for a client-level issue. */
  row: number | null;
  message: string;
}

/** The new team fields for one client, plus what changed (for the review). */
export interface TeamSheetChange {
  cl_id: string;
  name: string;
  CL_Business_Lead: string;
  CL_Digital_Lead: string;
  CL_Collaborators: string[];
  CL_Team_Emails: string[];
  bl: { before: string; after: string } | null;
  dl: { before: string; after: string } | null;
  added: string[];
  removed: string[];
}

export interface TeamSheetPlan {
  /** Clients whose team would change. */
  changes: TeamSheetChange[];
  /** Block the import until fixed. */
  errors: TeamSheetIssue[];
  /** Shown, never blocking. */
  warnings: TeamSheetIssue[];
  /** Clients the sheet mentions (changed or not). */
  clientsInSheet: number;
  /** Clients with no row at all — left unchanged. */
  clientsNotInSheet: number;
}

const norm = (v: string | undefined | null) => (v ?? "").trim().toLowerCase();

/**
 * Dry run: compares the sheet with the current teams. `userEmails` only feeds
 * a warning (a team email with no users row still works — the row is created
 * on first sign-in).
 */
export function planTeamSheetImport(
  table: string[][],
  clients: TeamClient[],
  userEmails: ReadonlySet<string>
): TeamSheetPlan {
  const header = (table[0] ?? []).map(norm);
  const col = Object.fromEntries(TEAM_SHEET_HEADERS.map((h) => [h, header.indexOf(h.toLowerCase())])) as Record<
    (typeof TEAM_SHEET_HEADERS)[number],
    number
  >;
  const missingCols = TEAM_SHEET_HEADERS.filter((h) => col[h] < 0);
  if (missingCols.length) {
    throw new TeamSheetStructureError([
      `Row 1 must hold the headers ${TEAM_SHEET_HEADERS.join(", ")} — missing: ${missingCols.join(", ")}.`,
      "Start from Export so the columns match.",
    ]);
  }

  const byId = new Map(clients.map((c) => [c.cl_id, c]));
  const errors: TeamSheetIssue[] = [];
  const warnings: TeamSheetIssue[] = [];
  // cl_id → role → emails (deduped), with the sheet row of each for messages.
  const sheet = new Map<string, Map<TeamRole, Map<string, number>>>();
  const unknownUsers = new Set<string>();

  table.slice(1).forEach((raw, i) => {
    const row = i + 2;
    const id = (raw[col["Client ID"]] ?? "").trim();
    const roleText = norm(raw[col["Role"]]);
    const email = normalizeEmail(raw[col["Email"]]);
    if (!id && !roleText && !email) return; // blank row
    const client = byId.get(id);
    if (!client) {
      errors.push({ row, message: id ? `Unknown client ID "${id}".` : "Missing client ID." });
      return;
    }
    const role = ROLE_BY_LABEL.get(roleText);
    if (!role) {
      errors.push({ row, message: `Unknown role "${raw[col["Role"]] ?? ""}" — use ${TEAM_SHEET_ROLES.join(", ")}.` });
      return;
    }
    if (!isValidEmail(email)) {
      errors.push({ row, message: `"${raw[col["Email"]] ?? ""}" is not an email.` });
      return;
    }
    const name = (raw[col["Client Name"]] ?? "").trim();
    if (name && name !== client.CL_Name) {
      warnings.push({ row, message: `Client name "${name}" differs from "${client.CL_Name}" — matched by ID.` });
    }
    if (!sheet.has(id)) sheet.set(id, new Map());
    const roles = sheet.get(id)!;
    if (!roles.has(role)) roles.set(role, new Map());
    if (!roles.get(role)!.has(email)) roles.get(role)!.set(email, row);
    if (!userEmails.has(email)) unknownUsers.add(email);
  });

  const changes: TeamSheetChange[] = [];
  for (const [id, roles] of sheet) {
    const c = byId.get(id)!;
    const single = (role: TeamRole, label: string): string | null => {
      const emails = [...(roles.get(role)?.keys() ?? [])];
      if (emails.length > 1) {
        errors.push({ row: null, message: `${c.CL_Name} (${id}) has ${emails.length} ${label} rows — keep one.` });
        return null;
      }
      return emails[0] ?? "";
    };
    const bl = single("BL", "Business Lead");
    const dl = single("DL", "Digital Lead");

    // GM rows are checked against the GM Pod, never written.
    const podGms = new Set(teamSeats(c).filter((s) => s.role === "GM").map((s) => s.email));
    const sheetGms = [...(roles.get("GM")?.entries() ?? [])];
    for (const [email, row] of sheetGms) {
      if (!podGms.has(email)) {
        warnings.push({
          row,
          message: `${email} isn't a GM of ${c.CL_Name}'s GM Pod (${c.GM_Pod || "none"}) — GM rows are ignored; change the GM Pod on the client.`,
        });
      }
    }
    if (bl === null || dl === null) continue;

    const collaborators = normalizeEmailList([...(roles.get("COLLABORATOR")?.keys() ?? [])]);
    const before = {
      bl: norm(c.CL_Business_Lead),
      dl: norm(c.CL_Digital_Lead),
      collabs: normalizeEmailList(c.CL_Collaborators ?? []),
    };
    const added = collaborators.filter((e) => !before.collabs.includes(e));
    const removed = before.collabs.filter((e) => !collaborators.includes(e));
    const blChanged = bl !== before.bl;
    const dlChanged = dl !== before.dl;
    if (!blChanged && !dlChanged && !added.length && !removed.length) continue;

    const next = { CL_Business_Lead: bl, CL_Digital_Lead: dl, CL_Collaborators: collaborators };
    changes.push({
      cl_id: id,
      name: c.CL_Name,
      ...next,
      CL_Team_Emails: computeTeamEmails({ ...next, GM_Pod: c.GM_Pod }),
      bl: blChanged ? { before: before.bl, after: bl } : null,
      dl: dlChanged ? { before: before.dl, after: dl } : null,
      added,
      removed,
    });
  }

  if (unknownUsers.size) {
    warnings.push({
      row: null,
      message: `${unknownUsers.size} email(s) have no user yet (${[...unknownUsers].sort().join(", ")}) — they get access on their first sign-in.`,
    });
  }

  changes.sort((a, b) => a.name.localeCompare(b.name));
  return {
    changes,
    errors,
    warnings,
    clientsInSheet: sheet.size,
    clientsNotInSheet: clients.filter((c) => !sheet.has(c.cl_id)).length,
  };
}
