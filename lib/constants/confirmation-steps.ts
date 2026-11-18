// lib/constants/confirmation-steps.ts

/**
 * The fixed milestones a user validates in "Milestones" (formerly "BL Forecast
 * Validation") on the forecast page. Ordered; `id` is the stable value persisted
 * per {client, year} in the forecast_validations collection (kept historical —
 * the `mqv-*` ids now back "Prelim" milestones).
 *
 * Each milestone validates a `targetRfq`. The four RFQ steps validate their own
 * RFQ. The four "Prelim" steps are **preliminary** checks that come BEFORE an
 * RFQ and validate that upcoming RFQ (the January prelim targets RFQ1, …, the
 * November prelim targets FINAL) — not a review of the previous one.
 *
 * Order matters — the "Prelim" steps are distinguished by their position
 * relative to the RFQ deadlines, not by any displayed date.
 */
import type { RFQType } from "../types/rfq.types";

export interface ConfirmationStep {
  id: string;
  /** Full label — used in the dropdown and the CSV export. */
  label: string;
  /** Compact label — used for the recap table's column headers. */
  short: string;
  /**
   * The RFQ this milestone validates. The four RFQ steps validate their own
   * RFQ; the four "Prelim" steps are preliminary checks that come BEFORE an RFQ
   * and validate that upcoming RFQ (Jan → RFQ1, May → RFQ2, Aug → RFQ3,
   * Nov → FINAL).
   */
  targetRfq: RFQType;
  /** Month (1–12) the milestone is due — the one in `label`. */
  dueMonth: number;
  /** Year of the due month relative to the forecast year (RFQ0 is due the September before: -1). */
  dueYearOffset: number;
}

export const CONFIRMATION_STEPS: ConfirmationStep[] = [
  { id: "rfq0",       label: "RFQ0 (Sept)",         short: "RFQ0",         targetRfq: "RFQ0",  dueMonth: 9,  dueYearOffset: -1 },
  { id: "mqv-2027q1", label: "Prelim RFQ1 (Jan)",   short: "Prelim RFQ1",  targetRfq: "RFQ1",  dueMonth: 1,  dueYearOffset: 0 },
  { id: "rfq1",       label: "RFQ1 (March)",        short: "RFQ1",         targetRfq: "RFQ1",  dueMonth: 3,  dueYearOffset: 0 },
  { id: "mqv-2027q2", label: "Prelim RFQ2 (May)",   short: "Prelim RFQ2",  targetRfq: "RFQ2",  dueMonth: 5,  dueYearOffset: 0 },
  { id: "rfq2",       label: "RFQ2 (June)",         short: "RFQ2",         targetRfq: "RFQ2",  dueMonth: 6,  dueYearOffset: 0 },
  { id: "mqv-2027q3", label: "Prelim RFQ3 (Aug)",   short: "Prelim RFQ3",  targetRfq: "RFQ3",  dueMonth: 8,  dueYearOffset: 0 },
  { id: "rfq3",       label: "RFQ3 (Sept)",         short: "RFQ3",         targetRfq: "RFQ3",  dueMonth: 9,  dueYearOffset: 0 },
  { id: "mqv-2027q4", label: "Prelim FINAL (Nov)",  short: "Prelim FINAL", targetRfq: "FINAL", dueMonth: 11, dueYearOffset: 0 },
];

/**
 * The checkpoint the Milestones page opens on for a forecast year: the latest
 * milestone already due (its due month has started), else the first one (a
 * future year), never past the last.
 */
export function defaultCheckpointStep(year: number, now: Date = new Date()): ConfirmationStep {
  const nowKey = now.getFullYear() * 12 + now.getMonth(); // month 0-based
  let pick = CONFIRMATION_STEPS[0];
  for (const s of CONFIRMATION_STEPS) {
    const dueKey = (year + s.dueYearOffset) * 12 + (s.dueMonth - 1);
    if (dueKey <= nowKey) pick = s;
  }
  return pick;
}

/** All step ids in order — used for the "All" shortcut. */
export const CONFIRMATION_STEP_IDS: string[] = CONFIRMATION_STEPS.map((s) => s.id);

/** Look up a step by id. */
export function stepById(id: string): ConfirmationStep | undefined {
  return CONFIRMATION_STEPS.find((s) => s.id === id);
}

/** The milestone steps that validate a given RFQ (its Prelim step + its own step). */
export function stepsForRfq(rfq: RFQType): ConfirmationStep[] {
  return CONFIRMATION_STEPS.filter((s) => s.targetRfq === rfq);
}

/**
 * The full label of the "last checked" step among a set of confirmed ids —
 * i.e. the furthest-along one in CONFIRMATION_STEPS order (no per-step
 * timestamp is stored, so "last" means highest position, not most recently
 * clicked). Returns "" when nothing is confirmed.
 */
export function lastCheckedStepLabel(confirmed: Iterable<string>): string {
  const ids = new Set(confirmed);
  for (let i = CONFIRMATION_STEPS.length - 1; i >= 0; i--) {
    if (ids.has(CONFIRMATION_STEPS[i].id)) return CONFIRMATION_STEPS[i].label;
  }
  return "";
}
