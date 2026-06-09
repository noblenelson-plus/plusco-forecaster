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
   * When an axis key is absent, the static RFQ_CLOSED_MONTHS[type] default
   * applies for that axis (no migration needed for pre-existing docs).
   */
  closedMonths?: Partial<Record<AxisId, number[]>>;
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
 * Default months (1–12) that are "closed" for each RFQ type. A closed period
 * is shown locked (greyed + padlock) and cannot be edited by Business Leads;
 * admins are never restricted by it. RFQ0 has no closed months; each quarterly
 * RFQ closes its own quarter; FINAL closes the whole year.
 *
 * These are only DEFAULTS: admins can override the closed months per axis on
 * each RFQ doc (`RFQ.closedMonths`). Use `resolveClosedMonths` to read the
 * effective set for an axis rather than this table directly.
 */
export const RFQ_CLOSED_MONTHS: Record<RFQType, number[]> = {
  RFQ0: [],
  RFQ1: [1, 2, 3],
  RFQ2: [4, 5, 6],
  RFQ3: [7, 8, 9],
  FINAL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

/** Is `month` (1–12) a closed period for the given RFQ type (default table)? */
export function isMonthClosed(type: RFQType, month: number): boolean {
  return RFQ_CLOSED_MONTHS[type].includes(month);
}

/**
 * Effective closed months (1–12) for one axis of an RFQ. Uses the admin-set
 * per-axis override (`rfq.closedMonths[axisId]`) when present, otherwise falls
 * back to the static `RFQ_CLOSED_MONTHS[type]` default.
 */
export function resolveClosedMonths(
  rfq: Pick<RFQ, "type" | "closedMonths">,
  axisId: AxisId
): number[] {
  return rfq.closedMonths?.[axisId] ?? RFQ_CLOSED_MONTHS[rfq.type];
}