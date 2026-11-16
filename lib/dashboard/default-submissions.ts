// lib/dashboard/default-submissions.ts

/**
 * Default Time & Context submissions for the Forecaster dashboard: the latest
 * round of a year vs the round before it (Adriana, 2026-11-16 — e.g. Final 2026
 * vs RFQ3 2026, RFQ1 2027 vs RFQ0 2027).
 *
 * "Latest" is the year's open round — the earliest UNLOCKED one — because every
 * round of a year is created up front: the later rounds sit there LOCKED as
 * placeholders (2027 RFQ2 / RFQ3 / FINAL while RFQ1 is open), so neither the
 * highest round nor the latest LOCKED round is the current one. A year with no
 * open round (fully closed) uses its last round.
 *
 * The comparison is the round immediately preceding it (`previousRFQ`, so it
 * crosses into the previous year only for an RFQ0 with no earlier round).
 *
 * Pure and read-only: it selects from the RFQ list the selector already
 * subscribes to. The dashboard page applies it on mount and whenever the
 * primary Year changes (app/(protected)/page.tsx).
 */

import type { RFQ } from "../types/rfq.types";
import { RFQ_TYPE_ORDER } from "../types/rfq.types";
import { previousRFQ } from "../types/forecaster.types";

export interface DefaultSubmissions {
  /** The year's latest (open) round. null when the year has no rounds. */
  primary: RFQ | null;
  /** The round immediately preceding the primary. null when none precedes it. */
  comparison: RFQ | null;
}

/**
 * The year the dashboard opens on: the current calendar year when it has
 * rounds, otherwise the latest year that does. null when there are no rounds.
 */
export function defaultDashboardYear(rfqs: RFQ[], now: Date = new Date()): number | null {
  if (rfqs.length === 0) return null;
  const thisYear = now.getFullYear();
  if (rfqs.some((r) => r.year === thisYear)) return thisYear;
  return Math.max(...rfqs.map((r) => r.year));
}

/** Picks the latest round of `year` (primary) and the round before it (comparison). */
export function pickDefaultSubmissions(rfqs: RFQ[], year: number | null): DefaultSubmissions {
  if (year === null) return { primary: null, comparison: null };
  const ofYear = rfqs
    .filter((r) => r.year === year)
    .sort((a, b) => RFQ_TYPE_ORDER[a.type] - RFQ_TYPE_ORDER[b.type]);
  if (ofYear.length === 0) return { primary: null, comparison: null };

  const primary = ofYear.find((r) => r.status === "UNLOCKED") ?? ofYear[ofYear.length - 1];

  // Previous submission (any status), resolved back to the concrete RFQ doc.
  const prev = previousRFQ(rfqs, primary.year, primary.type);
  const comparison = prev
    ? rfqs.find((r) => r.year === prev.year && r.type === prev.rfq) ?? null
    : null;

  return { primary, comparison };
}
