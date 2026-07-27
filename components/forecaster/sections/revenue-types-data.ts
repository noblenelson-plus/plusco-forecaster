// components/forecaster/sections/revenue-types-data.ts

/**
 * Revenue-by-stream helpers for the Revenue Types filter, section and charts.
 *
 * Two rules live here so every consumer applies them identically:
 *
 *  1. Commission + Commission Overwrite always present as one "Commission".
 *     The overwrite REPLACES the computed commission in any month it has a
 *     value — applyCommissionOverwrite already zeroed the computed side for
 *     those months upstream — so the two annual figures are disjoint and
 *     summing them reconstructs the true commission. Never shown separately.
 *
 *  2. A stream set (the filter selection) narrows a StreamSlice[] to the
 *     chosen keys, then merges commission, then totals — in that order, so a
 *     total always matches the visible rows.
 */

import type { StreamSlice } from "../../../lib/dashboard/data/aggregate";
import type { MonthlyMap } from "../../../lib/types/common.types";

const COMMISSION_KEY = "commission";
const COMMISSION_OVERWRITE_KEY = "commissionOverwrite";
const COMMISSION_LABEL = "Commission";

/** The merged Commission key used everywhere downstream. */
export const MERGED_COMMISSION_KEY = COMMISSION_KEY;

/**
 * Filterable stream keys, in display order, with the two commission keys shown
 * as one entry. This is what the filter renders and what "all on" means.
 */
export function filterableStreams(slices: StreamSlice[]): {
  key: string;
  label: string;
  color: string;
}[] {
  const out: { key: string; label: string; color: string }[] = [];
  let commissionAdded = false;

  for (const slice of slices) {
    if (slice.key === COMMISSION_KEY || slice.key === COMMISSION_OVERWRITE_KEY) {
      if (commissionAdded) continue;
      const commission = slices.find((s) => s.key === COMMISSION_KEY);
      out.push({
        key: MERGED_COMMISSION_KEY,
        label: COMMISSION_LABEL,
        color: commission?.color ?? slice.color,
      });
      commissionAdded = true;
      continue;
    }
    out.push({ key: slice.key, label: slice.label, color: slice.color });
  }

  return out;
}

/**
 * Applies a selection to raw slices and returns display slices with commission
 * merged. A stream is kept when its key is in `selected`; the merged commission
 * is kept when the (merged) commission key is selected.
 */
export function selectedStreamSlices(
  slices: StreamSlice[],
  selected: ReadonlySet<string>
): StreamSlice[] {
  const out: StreamSlice[] = [];
  let commissionAdded = false;

  for (const slice of slices) {
    const isCommission =
      slice.key === COMMISSION_KEY || slice.key === COMMISSION_OVERWRITE_KEY;

    if (isCommission) {
      if (!selected.has(MERGED_COMMISSION_KEY) || commissionAdded) continue;
      const c = slices.find((s) => s.key === COMMISSION_KEY);
      const o = slices.find((s) => s.key === COMMISSION_OVERWRITE_KEY);
      out.push({
        key: MERGED_COMMISSION_KEY,
        label: COMMISSION_LABEL,
        color: c?.color ?? slice.color,
        annual: (c?.annual ?? 0) + (o?.annual ?? 0),
      });
      commissionAdded = true;
      continue;
    }

    if (selected.has(slice.key)) out.push(slice);
  }

  return out;
}

/** Sum of the annual figures on a slice list. */
export function sumSlices(slices: StreamSlice[]): number {
  return slices.reduce((total, slice) => total + slice.annual, 0);
}

/** All filterable keys selected — the default "everything on" set. */
export function allStreamKeys(slices: StreamSlice[]): Set<string> {
  return new Set(filterableStreams(slices).map((s) => s.key));
}
/**
 * Sums a client's revenue map, keeping only the selected streams and applying
 * the commission merge. `commission` and `commissionOverwrite` are both counted
 * whenever the merged commission key is selected (their months are disjoint, so
 * summing is safe); every other stream is counted when its own key is selected.
 * A null selection means "all streams" — the unfiltered total.
 */
export function sumSelectedStreams(
  byStream: Record<string, MonthlyMap> | undefined,
  selected: ReadonlySet<string> | null
): number {
  if (!byStream) return 0;

  const sumMonths = (m?: MonthlyMap) =>
    Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

  let total = 0;
  for (const [key, months] of Object.entries(byStream)) {
    const selectionKey =
      key === COMMISSION_OVERWRITE_KEY ? MERGED_COMMISSION_KEY : key;
    if (selected === null || selected.has(selectionKey)) {
      total += sumMonths(months);
    }
  }
  return total;
}