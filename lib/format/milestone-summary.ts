// lib/format/milestone-summary.ts

/**
 * Milestones page — Section 1 (milestone tracking) roll-ups for one checkpoint
 * (milestone step): the status counts, the breakdown by GM Pod and the clients
 * still to validate. Pure and Firebase-free; the page passes in the per-client
 * rows it already loaded.
 */

import type { RfqValidationStatus } from "../types/forecast-flags.types";

/** One client as the summary needs it. */
export interface MilestoneClientRow {
  clientId: string;
  clientName: string;
  /** GM Pod label ("" when none). */
  gm: string;
  /** Business Lead display name. */
  bl: string;
  statusByStep: Record<string, RfqValidationStatus>;
}

export type StatusCounts = Record<RfqValidationStatus, number> & { total: number };

/** Display order everywhere: done → needs attention → untouched. */
export const MILESTONE_STATUS_ORDER: RfqValidationStatus[] = ["validated", "failed", "not_validated"];

/** A client's status at a checkpoint (no record = not validated). */
export function statusAt(row: MilestoneClientRow, stepId: string): RfqValidationStatus {
  return row.statusByStep[stepId] ?? "not_validated";
}

function emptyCounts(): StatusCounts {
  return { validated: 0, failed: 0, not_validated: 0, total: 0 };
}

/** Status counts over a set of clients at one checkpoint. */
export function countStatuses(rows: MilestoneClientRow[], stepId: string): StatusCounts {
  const c = emptyCounts();
  for (const r of rows) {
    c[statusAt(r, stepId)] += 1;
    c.total += 1;
  }
  return c;
}

export interface GmBreakdownRow extends StatusCounts {
  gm: string;
}

/**
 * Status counts per GM Pod at one checkpoint, most clients left to validate
 * first (then by name). Clients without a GM Pod are grouped as "No GM".
 */
export function breakdownByGm(rows: MilestoneClientRow[], stepId: string): GmBreakdownRow[] {
  const byGm = new Map<string, MilestoneClientRow[]>();
  for (const r of rows) {
    const key = r.gm || "No GM";
    const list = byGm.get(key);
    if (list) list.push(r);
    else byGm.set(key, [r]);
  }
  return [...byGm.entries()]
    .map(([gm, list]) => ({ gm, ...countStatuses(list, stepId) }))
    .sort(
      (a, b) =>
        b.not_validated + b.failed - (a.not_validated + a.failed) || a.gm.localeCompare(b.gm)
    );
}

/**
 * Clients whose status at the checkpoint is one of `statuses` (none = every
 * client), by GM then name — the Milestones by client table.
 */
export function clientsByStatus(
  rows: MilestoneClientRow[],
  stepId: string,
  statuses: RfqValidationStatus[]
): MilestoneClientRow[] {
  return rows
    .filter((r) => statuses.length === 0 || statuses.includes(statusAt(r, stepId)))
    .sort((a, b) => a.gm.localeCompare(b.gm) || a.clientName.localeCompare(b.clientName));
}

/** Share as a whole percent ("0%" for an empty set). */
export function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}
