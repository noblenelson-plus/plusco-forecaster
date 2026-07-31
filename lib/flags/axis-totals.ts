// lib/flags/axis-totals.ts

/**
 * Small pure helpers shared by the forecast flag/alert engines (Firebase-free).
 * They collapse an AxisData into the monthly totals the rules compare — BL_INPUT
 * (buckets) and ADMIN_INPUT (MediaOcean actuals) — plus the per-media-type
 * breakdowns the cat-2 Labs-vs-Media alert needs.
 */

import { MONTHS, type MediaType, type MonthlyMap } from "../types/common.types";
import { emptyMonthly, type AxisData } from "../types/forecaster.types";

/** BL_INPUT monthly total for an axis (all buckets' rows summed). */
export function blMonthlyTotal(data: AxisData): MonthlyMap {
  const out = emptyMonthly();
  for (const b of data.buckets)
    for (const r of b.rows) for (const m of MONTHS) out[m] += r.months[m] ?? 0;
  return out;
}

/** ADMIN_INPUT (MediaOcean) monthly total for an axis (all actuals rows summed). */
export function actualsMonthlyTotal(data: AxisData): MonthlyMap {
  const out = emptyMonthly();
  for (const r of data.actuals) for (const m of MONTHS) out[m] += r.months[m] ?? 0;
  return out;
}

/** Sum of a MonthlyMap over an explicit month subset (1–12). */
export function sumOverMonths(map: MonthlyMap, months: number[]): number {
  return months.reduce((acc, m) => acc + (map[m] ?? 0), 0);
}

/** Media BL spend per media type per month (a media row's rowType is its type). */
export function mediaBlByType(
  media: AxisData
): Partial<Record<MediaType, MonthlyMap>> {
  const out: Partial<Record<MediaType, MonthlyMap>> = {};
  for (const b of media.buckets)
    for (const r of b.rows) {
      const acc = (out[r.rowType as MediaType] ??= emptyMonthly());
      for (const m of MONTHS) acc[m] += r.months[m] ?? 0;
    }
  return out;
}

/**
 * Labs BL spend attributed to a media type per month — each partner's spend
 * mapped through its configured media type. Partners with no known media type
 * (removed from the year's config) cannot be attributed and are skipped.
 */
export function labsBlByMediaType(
  labs: AxisData,
  partnerMediaType: (partnerId: string) => MediaType | undefined
): Partial<Record<MediaType, MonthlyMap>> {
  const out: Partial<Record<MediaType, MonthlyMap>> = {};
  for (const b of labs.buckets)
    for (const r of b.rows) {
      const mt = partnerMediaType(r.rowType);
      if (!mt) continue;
      const acc = (out[mt] ??= emptyMonthly());
      for (const m of MONTHS) acc[m] += r.months[m] ?? 0;
    }
  return out;
}
