// lib/format/grant-sheet.ts

/**
 * Dashboard grants as a flat sheet — Admin → Dashboard Access export /
 * import. Pure (no Firebase): the page reads/writes Sheets and Firestore.
 *
 * One row per person per tab: Email, Name, Tab, Agencies, Regions, Can edit.
 * Agencies / Regions are "All" or a comma-separated list; "Can edit" (Yes /
 * No) only applies to Forecaster. The sheet is the FULL list of grants:
 * importing it makes every person's grants exactly their rows — someone
 * with no row loses all their grants. Defaults (client teams, email domains)
 * aren't grants and aren't in the sheet.
 */

import { CLIENT_AGENCIES, CLIENT_REGIONS } from "../constants/client.constants";
import { DASHBOARD_TABS, type DashboardGrantDoc, type DashboardTabId, type GrantScope } from "../types/access.types";
import { isValidEmail, nameFromEmail, normalizeEmail } from "./email";
import { grantScopeLabel, normalizeGrantTabs } from "./access";

export const GRANT_SHEET_HEADERS = ["Email", "Name", "Tab", "Agencies", "Regions", "Can edit"] as const;

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
  tabLabels: Record<DashboardTabId, string>
): string[][] {
  const nameOf = (e: string) => names.get(e) || nameFromEmail(e);
  const rows: string[][] = [];
  for (const g of [...grants].sort((a, b) => nameOf(a.email).localeCompare(nameOf(b.email)))) {
    for (const tab of DASHBOARD_TABS) {
      const s = g.tabs[tab];
      if (!s) continue;
      rows.push([
        g.email,
        nameOf(g.email),
        tabLabels[tab],
        listCell(s.allAgencies, s.agencies),
        listCell(s.allRegions, s.regions),
        tab === "forecaster" ? (s.edit ? "Yes" : "No") : "",
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
  tabLabels: Record<DashboardTabId, string>
): GrantSheetPlan {
  const header = (table[0] ?? []).map(norm);
  const col = Object.fromEntries(GRANT_SHEET_HEADERS.map((h) => [h, header.indexOf(h.toLowerCase())])) as Record<
    (typeof GRANT_SHEET_HEADERS)[number],
    number
  >;
  const required = ["Email", "Tab", "Agencies", "Regions"] as const;
  const missing = required.filter((h) => col[h] < 0);
  if (missing.length) {
    throw new GrantSheetStructureError([
      `Row 1 must hold the headers ${GRANT_SHEET_HEADERS.join(", ")} — missing: ${missing.join(", ")}.`,
      "Start from Export so the columns match.",
    ]);
  }
  const cell = (raw: string[], h: (typeof GRANT_SHEET_HEADERS)[number]) => (col[h] >= 0 ? raw[col[h]] ?? "" : "");

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
    const tabText = cell(raw, "Tab");
    if (!emailText.trim() && !tabText.trim() && !cell(raw, "Agencies").trim()) return; // blank row
    rows++;
    const email = normalizeEmail(emailText);
    if (!isValidEmail(email)) return void errors.push({ row, message: `"${emailText}" is not an email.` });
    const tab = tabByText.get(norm(tabText));
    if (!tab) {
      return void errors.push({ row, message: `Unknown tab "${tabText}" — use one of: ${DASHBOARD_TABS.map((t) => tabLabels[t]).join("; ")}.` });
    }
    const ag = parseList(cell(raw, "Agencies"), AGENCIES, "agency");
    if (ag.error) return void errors.push({ row, message: ag.error });
    const rg = parseList(cell(raw, "Regions"), REGIONS, "region");
    if (rg.error) return void errors.push({ row, message: rg.error });
    const editText = norm(cell(raw, "Can edit"));
    const edit = ["yes", "y", "true", "1"].includes(editText);
    if (edit && tab !== "forecaster") {
      warnings.push({ row, message: `"Can edit" only applies to Forecaster — ignored for ${tabLabels[tab]}.` });
    }
    const scope: GrantScope = {
      allAgencies: ag.all,
      agencies: ag.values,
      allRegions: rg.all,
      regions: rg.values,
      ...(tab === "forecaster" && edit ? { edit: true } : {}),
    };
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
      if (!b && a) lines.push({ kind: "add", text: `${tabLabels[tab]}: ${grantScopeLabel(a)}` });
      else if (b && !a) lines.push({ kind: "remove", text: `${tabLabels[tab]} (was ${grantScopeLabel(b)})` });
      else if (a && b) lines.push({ kind: "change", text: `${tabLabels[tab]}: ${grantScopeLabel(b)} → ${grantScopeLabel(a)}` });
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
