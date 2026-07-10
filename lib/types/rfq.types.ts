// lib/types/rfq.types.ts

import type { AxisId } from "./forecaster.types";

// ─── RFQ Types ────────────────────────────────────────────────────────────────

export const RFQ_TYPES = [
  { value: "RFQ0",  label: "RFQ0" },
  { value: "RFQ1",  label: "RFQ1" },
  { value: "RFQ2",  label: "RFQ2" },
  { value: "RFQ3",  label: "RFQ3" },
  { value: "FINAL", label: "Final" },
] as const;

export type RFQType = (typeof RFQ_TYPES)[number]["value"];

// ─── RFQ Status ───────────────────────────────────────────────────────────────

export const RFQ_STATUSES = [
  { value: "UNLOCKED", label: "Unlocked" },
  { value: "LOCKED",   label: "Locked" },
] as const;

export type RFQStatus = (typeof RFQ_STATUSES)[number]["value"];

// ─── RFQ Timeline period (échéancier) ─────────────────────────────────────────

/**
 * A scheduling milestone within an RFQ's timeline (échéancier). Admins define
 * an ordered set of these per RFQ; the forecast page renders them as a sticky
 * step bar that highlights which one is currently active. Dates are stored as
 * local calendar strings ("YYYY-MM-DD"), so a plain lexicographic comparison
 * against today's date yields the status.
 */
export interface RFQPeriod {
  id: string;            // stable id (random) — survives reordering/edits
  name: string;
  description?: string;
  startDate: string;     // "YYYY-MM-DD"
  endDate: string;       // "YYYY-MM-DD"
}

export type PeriodStatus = "completed" | "active" | "future";

// ─── RFQ Document ─────────────────────────────────────────────────────────────

/**
 * Document Firestore — collection "rfqs"
 * Document ID : `{year}_{type}` (ex. "2026_RFQ1") — garantit l'unicité.
 */
export interface RFQ {
  rfq_id: string;        // ex. "2026_RFQ1"
  year: number;          // ex. 2026
  type: RFQType;
  status: RFQStatus;
  /**
   * Per-axis closed months (1–12), set by admins from the RFQ admin page.
   * When an axis key is absent, no month is closed for that axis — months are
   * never locked automatically.
   */
  closedMonths?: Partial<Record<AxisId, number[]>>;
  /**
   * Timeline periods (échéancier) for this RFQ, admin-edited. Absent on
   * pre-existing docs — treat as an empty list. Render order comes from
   * `sortPeriods` (by start date), not the stored array order.
   */
  periods?: RFQPeriod[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RFQFormData {
  year: number;
  type: RFQType;
  status: RFQStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construit l'ID du document à partir de l'année et du type */
export function buildRFQId(year: number, type: RFQType): string {
  return `${year}_${type}`;
}

/** Ordre d'affichage des types dans l'année (RFQ0 → FINAL) */
export const RFQ_TYPE_ORDER: Record<RFQType, number> = {
  RFQ0: 0,
  RFQ1: 1,
  RFQ2: 2,
  RFQ3: 3,
  FINAL: 4,
};

/** Trie les RFQs : année décroissante, puis ordre des types */
export function sortRFQs(rfqs: RFQ[]): RFQ[] {
  return [...rfqs].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return RFQ_TYPE_ORDER[a.type] - RFQ_TYPE_ORDER[b.type];
  });
}

// ─── Closed periods ─────────────────────────────────────────────────────────

/**
 * Effective closed months (1–12) for one axis of an RFQ. A closed period is
 * shown locked (greyed + padlock) and cannot be edited by Business Leads;
 * admins are never restricted by it.
 *
 * Months are NEVER closed automatically: only the admin-set per-axis list on
 * the RFQ doc (`rfq.closedMonths[axisId]`, edited from the RFQ admin page)
 * closes a month. An absent axis key means nothing is closed. (There used to
 * be a per-RFQ-type default table — RFQ1 closed Q1, FINAL the whole year —
 * removed on request: it locked months without any admin action.)
 */
export function resolveClosedMonths(
  rfq: Pick<RFQ, "type" | "closedMonths">,
  axisId: AxisId
): number[] {
  return rfq.closedMonths?.[axisId] ?? [];
}

// ─── Timeline periods ─────────────────────────────────────────────────────────

/** Periods sorted for display: by start date, then end date (ascending). */
export function sortPeriods(periods: RFQPeriod[]): RFQPeriod[] {
  return [...periods].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate)
  );
}

/**
 * Status of a period relative to `today` (a "YYYY-MM-DD" string). The range is
 * inclusive on both ends, so a period whose start and end are today is active.
 * String comparison is valid because ISO calendar dates sort lexicographically.
 */
export function resolvePeriodStatus(
  period: Pick<RFQPeriod, "startDate" | "endDate">,
  today: string
): PeriodStatus {
  if (today < period.startDate) return "future";
  if (today > period.endDate) return "completed";
  return "active";
}

/** Today's local calendar date as "YYYY-MM-DD" (not UTC — matches the inputs). */
export function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}