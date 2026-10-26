// lib/format/grant-sheet.ts

/**
 * Dashboard grants as a flat sheet — Admin → Dashboard Access export /
 * import. Pure (no Firebase): the page reads/writes Sheets and Firestore.
 *
 * One row per person per dashboard: Email, Name, Dashboard Name, Agencies,
 * Regions, Clients. Agencies / Regions are "All" or a comma-separated list;
 * Clients (a specific-client grant — Agencies / Regions then left blank) lists
 * client names or IDs separated by ";" (names may contain commas). Older
 * exports still import: "Tab" is read as Dashboard Name, Clients is optional,
 * and a "Can edit" column (Yes / No, Forecaster only) is honoured when
 * present. Without it, each Forecaster grant keeps its current edit flag. The sheet is the FULL list of grants:
 * importing it makes every person's grants exactly their rows — someone
 * with no row loses all their grants. Defaults (client teams, email domains)
 * aren't grants and aren't in the sheet.
 */

import { CLIENT_AGENCIES, CLIENT_REGIONS } from "../constants/client.constants";
import {
  CLIENT_GRANT_TABS,
  DASHBOARD_TABS,
  type DashboardGrantDoc,
  type DashboardTabId,
  type GrantScope,
} from "../types/access.types";
import type { Client } from "../types/client.types";
import { isValidEmail, nameFromEmail, normalizeEmail } from "./email";
import { grantScopeLabel, isClientGrant, normalizeGrantTabs } from "./access";

export const GRANT_SHEET_HEADERS = ["Email", "Name", "Dashboard Name", "Agencies", "Regions", "Clients"] as const;

/** The columns the import reads, each with the header texts it accepts. */
const IMPORT_COLUMNS = {
  Email: ["email"],
  Dashboard: ["dashboard name", "dashboard", "tab"],
  Agencies: ["agencies"],
  Regions: ["regions"],
  Clients: ["clients"],
  "Can edit": ["can edit"],
} as const;
type ImportColumn = keyof typeof IMPORT_COLUMNS;

/** The client fields the sheet needs (name ↔ id). */
export type GrantSheetClient = Pick<Client, "cl_id" | "CL_Name">;

const AGENCIES: string[] = CLIENT_AGENCIES.map((a) => a.value);
const REGIONS: string[] = CLIENT_REGIONS.map((r) => r.value);

const norm = (v: string | undefined | null) => (v ?? "").trim().toLowerCase();

function listCell(all: boolean, values: string[]): string {
  return all ? "All" : values.join(", ");
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** Header + one row per (person, tab), sorted by name then tab order. */
export function buildGrantSheet(
  grants: DashboardGrantDoc[],
  names: ReadonlyMap<string, string | null>,
  tabLabels: Record<DashboardTabId, string>,
  clients: GrantSheetClient[] = []
): string[][] {
  const nameOf = (e: string) => names.get(e) || nameFromEmail(e);
  const clientName = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
  const rows: string[][] = [];
  for (const g of [...grants].sort((a, b) => nameOf(a.email).localeCompare(nameOf(b.email)))) {
    for (const tab of DASHBOARD_TABS) {
      const s = g.tabs[tab];
      if (!s) continue;
      const byClient = isClientGrant(s);
      rows.push([
        g.email,
        nameOf(g.email),
        tabLabels[tab],
        byClient ? "" : listCell(s.allAgencies, s.agencies),
        byClient ? "" : listCell(s.allRegions, s.regions),
        byClient
          ? s.clients!
              .map((id) => clientName.get(id) ?? id)
              .sort((a, b) => a.localeCompare(b))
              .join("; ")
          : "",
      ]);
    }
  }
  return [[...GRANT_SHEET_HEADERS], ...rows];
}

// ─── Import ───────────────────────────────────────────────────────────────────

/** Thrown when the table isn't shaped like an export (nothing to review). */
export class GrantSheetStructureError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

export interface GrantSheetIssue {
  /** 1-based sheet row (header = row 1); null for a person-level issue. */
  row: number | null;
  message: string;
}

/** One person's change, with readable lines for the review. */
export interface GrantSheetChange {
  email: string;
  /** Their grants after the import ({} = all removed). */
  tabs: DashboardGrantDoc["tabs"];
  lines: { kind: "add" | "change" | "remove"; text: string }[];
}

export interface GrantSheetPlan {
  changes: GrantSheetChange[];
  errors: GrantSheetIssue[];
  warnings: GrantSheetIssue[];
  /** People in the sheet / rows read. */
  people: number;
  rows: number;
}

/** "All" / blank → all; else the listed values, validated against `allowed`. */
function parseList(
  raw: string,
  allowed: string[],
  what: string
): { all: boolean; values: string[]; error?: string } {
  const text = (raw ?? "").trim();
  if (!text || norm(text) === "all") return { all: true, values: [] };
  const byLower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  const values: string[] = [];
  for (const part of text.split(/[,;|]/).map((p) => p.trim()).filter(Boolean)) {
    const hit = byLower.get(part.toLowerCase());
    if (!hit) return { all: false, values: [], error: `Unknown ${what} "${part}" — use All or ${allowed.join(", ")}.` };
    values.push(hit);
  }
  return { all: false, values: [...new Set(values)].sort() };
}

/**
 * A Clients cell → client ids. Each ";"-separated entry is a client ID or an
 * exact name (case-insensitive); a name shared by two clients must be given
 * by ID.
 */
function parseClients(raw: string, clients: GrantSheetClient[]): { ids: string[]; error?: string } {
  const byId = new Map(clients.map((c) => [c.cl_id.toLowerCase(), c.cl_id]));
  const byName = new Map<string, string[]>();
  for (const c of clients) {
    const k = c.CL_Name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), c.cl_id]);
  }
  const ids: string[] = [];
  for (const part of raw.split(/[;\n|]/).map((x) => x.trim()).filter(Boolean)) {
    const key = part.toLowerCase();
    const id = byId.get(key);
    if (id) {
      ids.push(id);
      continue;
    }
    const named = byName.get(key) ?? [];
    if (named.length === 1) ids.push(named[0]);
    else if (named.length > 1) return { ids: [], error: `Two clients are named "${part}" — use the client ID instead (${named.join(", ")}).` };
    else return { ids: [], error: `Unknown client "${part}" — use a client name or ID, separated by ";".` };
  }
  return { ids: [...new Set(ids)].sort() };
}

function sameScope(a: GrantScope | undefined, b: GrantScope | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Dry run: compares the sheet with the current grants. `userEmails` only
 * feeds a warning (a grant works once the person signs in).
 */
export function planGrantSheetImport(
  table: string[][],
  current: DashboardGrantDoc[],
  userEmails: ReadonlySet<string>,
  tabLabels: Record<DashboardTabId, string>,
  clients: GrantSheetClient[] = []
): GrantSheetPlan {
  const clientName = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
  const label = (s: GrantScope) => grantScopeLabel(s, (id) => clientName.get(id));
  const header = (table[0] ?? []).map(norm);
  const col = Object.fromEntries(
    (Object.entries(IMPORT_COLUMNS) as [ImportColumn, readonly string[]][]).map(([k, names]) => [
      k,
      header.findIndex((h) => names.includes(h)),
    ])
  ) as Record<ImportColumn, number>;
  // The read-only Dashboard Access report has the same columns plus "Access
  // Granted Via": importing it would turn every team / admin row into a grant.
  if (header.includes("access granted via")) {
    throw new GrantSheetStructureError([
      "This is the read-only Dashboard Access report, not the grants list.",
      "Import reads the \"Grants (edit & import)\" tab — link that tab or the whole exported workbook.",
    ]);
  }
  const required: ImportColumn[] = ["Email", "Dashboard", "Agencies", "Regions"];
  const missing = required.filter((h) => col[h] < 0);
  if (missing.length) {
    throw new GrantSheetStructureError([
      `Row 1 must hold the headers ${GRANT_SHEET_HEADERS.join(", ")} — missing: ${missing
        .map((h) => (h === "Dashboard" ? "Dashboard Name" : h))
        .join(", ")}.`,
      "Start from Export so the columns match.",
    ]);
  }
  const cell = (raw: string[], h: ImportColumn) => (col[h] >= 0 ? raw[col[h]] ?? "" : "");
  // Without a "Can edit" column, a Forecaster grant keeps its current flag.
  const currentEdit = new Set(
    current.filter((g) => g.tabs.forecaster?.edit).map((g) => normalizeEmail(g.email))
  );

  const tabByText = new Map<string, DashboardTabId>();
  for (const t of DASHBOARD_TABS) {
    tabByText.set(t, t);
    tabByText.set(norm(tabLabels[t]), t);
  }

  const errors: GrantSheetIssue[] = [];
  const warnings: GrantSheetIssue[] = [];
  const next = new Map<string, DashboardGrantDoc["tabs"]>();
  const seenAt = new Map<string, number>(); // `${email}|${tab}` → first row
  const unknownUsers = new Set<string>();
  let rows = 0;

  table.slice(1).forEach((raw, i) => {
    const row = i + 2;
    const emailText = cell(raw, "Email");
    const tabText = cell(raw, "Dashboard");
    if (!emailText.trim() && !tabText.trim() && !cell(raw, "Agencies").trim() && !cell(raw, "Clients").trim()) return; // blank row
    rows++;
    const email = normalizeEmail(emailText);
    if (!isValidEmail(email)) return void errors.push({ row, message: `"${emailText}" is not an email.` });
    const tab = tabByText.get(norm(tabText));
    if (!tab) {
      return void errors.push({ row, message: `Unknown tab "${tabText}" — use one of: ${DASHBOARD_TABS.map((t) => tabLabels[t]).join("; ")}.` });
    }
    const edit =
      col["Can edit"] >= 0
        ? ["yes", "y", "true", "1"].includes(norm(cell(raw, "Can edit")))
        : tab === "forecaster" && currentEdit.has(email);
    if (edit && tab !== "forecaster") {
      warnings.push({ row, message: `"Can edit" only applies to Forecaster — ignored for ${tabLabels[tab]}.` });
    }
    const editFlag = tab === "forecaster" && edit ? { edit: true } : {};
    let scope: GrantScope;
    const clientsText = cell(raw, "Clients").trim();
    if (clientsText) {
      // A specific-client grant.
      if (!CLIENT_GRANT_TABS.includes(tab)) {
        return void errors.push({
          row,
          message: `${tabLabels[tab]} can't be given by client (its data is split by agency) — use Agencies / Regions.`,
        });
      }
      const cl = parseClients(clientsText, clients);
      if (cl.error) return void errors.push({ row, message: cl.error });
      if (cell(raw, "Agencies").trim() || cell(raw, "Regions").trim()) {
        warnings.push({ row, message: "Clients is filled, so Agencies / Regions are ignored for this row." });
      }
      scope = { allAgencies: false, agencies: [], allRegions: false, regions: [], clients: cl.ids, ...editFlag };
    } else {
      const ag = parseList(cell(raw, "Agencies"), AGENCIES, "agency");
      if (ag.error) return void errors.push({ row, message: ag.error });
      const rg = parseList(cell(raw, "Regions"), REGIONS, "region");
      if (rg.error) return void errors.push({ row, message: rg.error });
      scope = { allAgencies: ag.all, agencies: ag.values, allRegions: rg.all, regions: rg.values, ...editFlag };
    }
    const key = `${email}|${tab}`;
    const tabs = next.get(email) ?? {};
    if (seenAt.has(key)) {
      if (!sameScope(tabs[tab], scope)) {
        errors.push({ row, message: `${email} has two different rows for ${tabLabels[tab]} (also row ${seenAt.get(key)}) — keep one.` });
      }
      return;
    }
    seenAt.set(key, row);
    tabs[tab] = scope;
    next.set(email, tabs);
    if (!userEmails.has(email)) unknownUsers.add(email);
  });

  // Diff against the current grants (everyone, so people dropped from the sheet show as removals).
  const currentBy = new Map(current.map((g) => [g.email, normalizeGrantTabs(g.tabs)]));
  const emails = new Set([...currentBy.keys(), ...next.keys()]);
  const changes: GrantSheetChange[] = [];
  for (const email of [...emails].sort()) {
    const before = currentBy.get(email) ?? {};
    const after = normalizeGrantTabs(next.get(email) ?? {});
    const lines: GrantSheetChange["lines"] = [];
    for (const tab of DASHBOARD_TABS) {
      const b = before[tab];
      const a = after[tab];
      if (sameScope(b, a)) continue;
      if (!b && a) lines.push({ kind: "add", text: `${tabLabels[tab]}: ${label(a)}` });
      else if (b && !a) lines.push({ kind: "remove", text: `${tabLabels[tab]} (was ${label(b)})` });
      else if (a && b) lines.push({ kind: "change", text: `${tabLabels[tab]}: ${label(b)} → ${label(a)}` });
    }
    if (lines.length) changes.push({ email, tabs: after, lines });
  }

  // A sheet with no rows would remove everyone's access — far more likely the
  // wrong tab or an emptied export than intended.
  if (rows === 0 && current.length > 0) {
    errors.push({
      row: null,
      message: "The sheet has no rows — importing it would remove everyone's access. Check the link points at the right tab.",
    });
  }

  if (unknownUsers.size) {
    warnings.push({
      row: null,
      message: `${unknownUsers.size} email(s) have no user yet (${[...unknownUsers].sort().join(", ")}) — their access starts on their first sign-in.`,
    });
  }
  return { changes, errors, warnings, people: next.size, rows };
}
