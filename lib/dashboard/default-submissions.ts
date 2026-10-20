// lib/dashboard/default-submissions.ts

/**
 * Default Time & Context submissions for the Forecaster dashboard.
 *
 * The primary ("current") submission is PINNED to a fixed Year + RFQ round via
 * DEFAULT_PRIMARY_SUBMISSION below — the dashboard opens on that round every
 * time. The comparison default is the round immediately preceding it, resolved
 * with `previousRFQ` so the "previous round" semantics match the forecast
 * editing page (including year boundaries).
 *
 * Pure and read-only: it selects from the RFQ list the selector already
 * subscribes to. The page forces these on mount (see the effect in
 * app/(protected)/forecaster/page.tsx).
 */

import type { RFQ, RFQType } from "../types/rfq.types";
import { RFQ_TYPE_ORDER } from "../types/rfq.types";
import { previousRFQ } from "../types/forecaster.types";

/**
 * ▶︎ EDIT THIS EACH FORECAST CYCLE ◀︎
 *
 * The submission the Forecaster dashboard opens on by default. Set it to the
 * current round. When the cycle advances (e.g. RFQ3 → FINAL, or into a new
 * year), change these two values. The comparison side updates automatically to
 * the round immediately before it — no other edits needed.
 */
export const DEFAULT_PRIMARY_SUBMISSION: { year: number; type: RFQType } = {
  year: 2026,
  type: "RFQ3",
};

/**
 * Chronological rank of a submission: year first, then RFQ order within the
 * year. Mirrors the private ranking used by `previousRFQ`, so "latest" here and
 * "previous" there agree on ordering.
 */
function submissionRank(year: number, type: RFQType): number {
  return year * 10 + RFQ_TYPE_ORDER[type];
}

export interface DefaultSubmissions {
  /** The pinned current submission. null when none exist at all. */
  primary: RFQ | null;
  /** The submission immediately preceding the primary. null when none precedes it. */
  comparison: RFQ | null;
}

/**
 * Picks the current submission (primary) and the previous one (comparison)
 * from the full RFQ list.
 *
 * Primary is the round pinned in DEFAULT_PRIMARY_SUBMISSION. If that exact
 * round is not present in the data (e.g. the pin is stale), it falls back to
 * the latest round overall so the dashboard is never empty.
 *
 * The comparison is the round immediately preceding the primary, regardless of
 * status, so variance is always measured against the prior round.
 *
 * Returns nulls when the list is empty or has no earlier submission to compare
 * against.
 */
export function pickDefaultSubmissions(rfqs: RFQ[]): DefaultSubmissions {
  if (rfqs.length === 0) {
    return { primary: null, comparison: null };
  }

  // Primary = the pinned submission when present; otherwise the latest round
  // overall (safety net for a stale pin).
  const pinned =
    rfqs.find(
      (r) =>
        r.year === DEFAULT_PRIMARY_SUBMISSION.year &&
        r.type === DEFAULT_PRIMARY_SUBMISSION.type
    ) ?? null;

  const primary =
    pinned ??
    rfqs.reduce((best, candidate) =>
      submissionRank(candidate.year, candidate.type) >
      submissionRank(best.year, best.type)
        ? candidate
        : best
    );

  // Previous submission (any status), resolved back to the concrete RFQ doc.
  const prev = previousRFQ(rfqs, primary.year, primary.type);
  const comparison = prev
    ? rfqs.find((r) => r.year === prev.year && r.type === prev.rfq) ?? null
    : null;

  return { primary, comparison };
}