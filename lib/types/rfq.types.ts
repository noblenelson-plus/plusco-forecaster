// lib/types/rfq.types.ts

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