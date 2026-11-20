// filepath: lib/finance-toolkit/insights.ts

/**
 * Finance Toolkit — the "at a glance" reading of Account Profitability: the
 * likely reason an account needs review, and the comparison period. Pure functions over ProfitRow (no React, no data download), so every
 * label on the page traces back to one rule here.
 */

import type { ProfitRow } from "./model";

// ─── Why an account needs a conversation ─────────────────────────────────────

export type ReasonId = "time-over-fee" | "little-billed" | "new" | "cause" | "low-return";

export interface ReasonDef {
  id: ReasonId;
  title: string;
  /** What it likely means and what to ask — the next step for the reader. */
  explain: string;
  /** Tailwind class for the group's left accent. */
  accent: string;
}

export const REASONS: ReasonDef[] = [
  {
    id: "time-over-fee",
    title: "Time is costing more than the fee",
    explain: "Established accounts where the team’s time costs more than we bill. Worth checking the scope against the fee.",
    accent: "border-red-500",
  },
  {
    id: "little-billed",
    title: "Hours logged, very little billed",
    explain: "Billed less than a fifth of the staffing cost. Often billing that is late, missing or booked under another account.",
    accent: "border-red-500",
  },
  {
    id: "new",
    title: "New accounts still ramping up",
    explain: "First hours logged in the last six months. Onboarding time usually comes before the revenue does.",
    accent: "border-blue-400",
  },
  {
    id: "cause",
    title: "Foundations & charities",
    explain: "The name suggests a foundation or charity, so this may be agreed pro bono or reduced-fee work. Confirm with the account lead.",
    accent: "border-gray-400",
  },
  {
    id: "low-return",
    title: "Profitable, but a low return on time",
    explain: "Still above cost, but earning less than half our average revenue per hour.",
    accent: "border-yellow-400",
  },
];

/** Name patterns for foundations and charities (English + French). Heuristic: the UI says "name suggests". */
const CAUSE_NAME =
  /\b(foundation|fondation|conservancy|charit(y|ies|able)|hospital|h[oô]pital|chu|cancer|soci[eé]t[eé] canadienne|canadian society|heart and stroke|united way|centraide|croix-rouge|red cross)\b/i;

/** A client counts as new when its first client hour falls in the last NEW_WINDOW months of the period. */
const NEW_WINDOW = 6;
/** "Very little billed" = revenue under this share of staffing cost. */
const LITTLE_BILLED_RATIO = 0.2;

/**
 * The most helpful explanation for a flagged account (first rule that fits),
 * or null for an account that is not flagged. `dataStart` is the month the
 * account's agency export becomes populated: a client already there in the
 * first months may simply predate the data, so it is never called new.
 */
export function reviewReason(row: ProfitRow, to: number, dataStart: number): ReasonId | null {
  if (row.flag !== "loss" && row.flag !== "over-serviced") return null;
  if (CAUSE_NAME.test(row.client.name)) return "cause";
  if (row.flag === "over-serviced") return "low-return";
  if (row.client.firstMonth > dataStart + 1 && row.client.firstMonth > to - NEW_WINDOW) return "new";
  if (row.revenue! < row.cost! * LITTLE_BILLED_RATIO) return "little-billed";
  return "time-over-fee";
}

export interface ReasonGroup extends ReasonDef {
  rows: ProfitRow[];
  /** Sum of the group's margins (negative for loss-making groups). */
  margin: number;
}

/** Flagged accounts grouped by reason, biggest dollar impact first (lowest total margin), accounts worst margin first. */
export function groupByReason(rows: ProfitRow[], to: number, dataStartOf: (agencyId: string) => number): ReasonGroup[] {
  const by = new Map<ReasonId, ProfitRow[]>();
  for (const r of rows) {
    const reason = reviewReason(r, to, dataStartOf(r.client.agencyId));
    if (!reason) continue;
    const list = by.get(reason) ?? [];
    list.push(r);
    by.set(reason, list);
  }
  return REASONS.filter((d) => by.has(d.id))
    .map((d) => {
      const list = by.get(d.id)!.sort((a, b) => a.margin! - b.margin!);
      return { ...d, rows: list, margin: list.reduce((a, r) => a + r.margin!, 0) };
    })
    .sort((a, b) => a.margin - b.margin);
}

// ─── Comparison period ───────────────────────────────────────────────────────

/** The equally long period just before [from, to], when it fits inside [windowFrom, …]; else null. */
export function previousPeriod(from: number, to: number, windowFrom: number): [number, number] | null {
  const len = to - from + 1;
  const pf = from - len;
  return pf >= windowFrom ? [pf, from - 1] : null;
}
