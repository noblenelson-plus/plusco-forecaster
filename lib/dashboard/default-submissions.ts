// lib/dashboard/default-submissions.ts

/**
 * Default Time & Context submissions for the Forecaster dashboard.
 *
 * The primary ("current") submission is derived from the RFQ docs themselves,
 * so it advances on its own when admins open the next round — no code edit per
 * cycle. The comparison default is the round immediately preceding it, resolved
 * with `previousRFQ` so the "previous round" semantics match the forecast
 * editing page (including year boundaries).
 *
 * Pure and read-only: it selects from the RFQ list the selector already
 * subscribes to. The page forces these on mount (see the effect in
 * app/(protected)/page.tsx).
 */

import type { RFQ, RFQType } from "../types/rfq.types";
import { RFQ_TYPE_ORDER } from "../types/rfq.types";
import { previousRFQ } from "../types/forecaster.types";

/**
 * Chronological rank of a submission: year first, then RFQ order within the
 * year. Mirrors the private ranking used by `previousRFQ`, so "latest" here and
 * "previous" there agree on ordering.
 */
function submissionRank(year: number, type: RFQType): number {
  return year * 10 + RFQ_TYPE_ORDER[type];
}

const byRank = (a: RFQ, b: RFQ) =>
  submissionRank(a.year, a.type) - submissionRank(b.year, b.type);

export interface DefaultSubmissions {
  /** The current submission. null when none exist at all. */
  primary: RFQ | null;
  /** The submission immediately preceding the primary. null when none precedes it. */
  comparison: RFQ | null;
}

/**
 * The current submission: the earliest round that is still UNLOCKED — the one
 * BLs are working on now. Later rounds may already be created (or opened
 * early, e.g. next year's RFQ1), so "earliest open" beats "latest overall".
 *
 * When every round is locked (between cycles), it falls back to the latest
 * round up to the current calendar year (the round just submitted), and then
 * to the latest round overall so the dashboard is never empty.
 */
export function pickCurrentSubmission(
  rfqs: RFQ[],
  today: Date = new Date()
): RFQ | null {
  if (rfqs.length === 0) return null;
  const sorted = [...rfqs].sort(byRank);
  const open = sorted.find((r) => r.status === "UNLOCKED");
  if (open) return open;
  const thisYear = today.getFullYear();
  const upToNow = sorted.filter((r) => r.year <= thisYear);
  return upToNow[upToNow.length - 1] ?? sorted[sorted.length - 1];
}

/**
 * Picks the current submission (primary, see `pickCurrentSubmission`) and the
 * previous one (comparison) from the full RFQ list.
 *
 * The comparison is the round immediately preceding the primary, regardless of
 * status, so variance is always measured against the prior round.
 *
 * Returns nulls when the list is empty or has no earlier submission to compare
 * against.
 */
export function pickDefaultSubmissions(rfqs: RFQ[]): DefaultSubmissions {
  const primary = pickCurrentSubmission(rfqs);
  if (!primary) return { primary: null, comparison: null };

  // Previous submission (any status), resolved back to the concrete RFQ doc.
  const prev = previousRFQ(rfqs, primary.year, primary.type);
  const comparison = prev
    ? rfqs.find((r) => r.year === prev.year && r.type === prev.rfq) ?? null
    : null;

  return { primary, comparison };
}
