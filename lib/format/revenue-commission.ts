// lib/format/revenue-commission.ts

/**
 * Revenue commission — the Commission BL row is not entered, it is derived from
 * the Media spend forecast of the same submission and the client's commission
 * rates:
 *
 *   commission(month) = Σ_mediaType [ mediaBL(type, month) × rate(type, month) / 100 ]
 *
 * Only BL_INPUT media is considered (the plan, not the MediaOcean actuals).
 * `byMonth` keeps the per-media-type contribution lines so the grid can show
 * the breakdown on hover.
 *
 * Also hosts `ensureRevenueShape`, which seeds the axis with its fixed rows
 * (one BL row per stream in a single implicit bucket, one GAIA actuals row per
 * admin stream) so the user sees every revenue type immediately, with no
 * project/add-row notion.
 */

import {
  MONTHS,
  MEDIA_TYPES,
  type MonthlyMap,
  type MediaType,
} from "../types/common.types";
import {
  aggregateByType,
  emptyMonthly,
  newBucket,
  newRow,
  MEDIA_TYPE_LABELS,
  REVENUE_BL_STREAMS,
  REVENUE_ADMIN_STREAMS,
  REVENUE_STREAM_LABELS,
  REVENUE_COMMISSION_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  type AxisData,
  type ForecastRow,
  type ForecastBucket,
  type RevenueStream,
} from "../types/forecaster.types";

// ─── Commission ───────────────────────────────────────────────────────────────

/** One media type's contribution to a month's commission. */
export interface CommissionMediaLine {
  mediaType: MediaType;
  label: string;
  /** Media BL spend for this type and month. */
  spend: number;
  /** Commission rate (%) for this type and month. */
  rate: number;
  /** spend × rate / 100, rounded to whole dollars. */
  amount: number;
}

export interface CommissionBreakdown {
  /** Total commission per month — the values shown on the BL Commission row. */
  months: MonthlyMap;
  /** Per-month non-zero contribution lines, for the cell hover. */
  byMonth: Record<number, CommissionMediaLine[]>;
  /** Annual commission total. */
  annual: number;
}

/**
 * Computes the commission from the Media axis (BL) and a year's commission
 * rates (the `commissionsConfig[year]` slice of the client doc). A missing rate
 * or type resolves to 0, so an unconfigured client simply yields 0 commission.
 *
 * Each per-media-type contribution is rounded to whole dollars at the source, so
 * the commission carries no decimals anywhere downstream (grid, comparison
 * variances, dashboard, and the value persisted on Save). The monthly total is
 * the sum of these rounded lines, so the hover breakdown always adds up exactly.
 */
export function computeCommission(
  mediaData: AxisData,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined
): CommissionBreakdown {
  const plannedByType = aggregateByType(mediaData, "BL_INPUT");
  const months = emptyMonthly();
  const byMonth: Record<number, CommissionMediaLine[]> = {};
  let annual = 0;

  for (const m of MONTHS) {
    const lines: CommissionMediaLine[] = [];
    let total = 0;
    for (const type of MEDIA_TYPES) {
      const spend = plannedByType[type]?.[m] ?? 0;
      const rate = yearRates?.[type]?.[m] ?? 0;
      // Round each contribution at the source so no decimals propagate.
      const amount = Math.round((spend * rate) / 100);
      if (amount !== 0) {
        lines.push({
          mediaType: type,
          label: MEDIA_TYPE_LABELS[type],
          spend,
          rate,
          amount,
        });
        total += amount;
      }
    }
    months[m] = total;
    byMonth[m] = lines;
    annual += total;
  }

  return { months, byMonth, annual };
}

// ─── Fixed-structure seeding ────────────────────────────────────────────────

/**
 * Ensures the revenue axis carries its fixed structure: a single implicit BL
 * bucket with one row per BL stream, and one GAIA actuals row per admin stream,
 * in canonical order. Existing months (and row/bucket ids) are preserved by
 * matching `rowType`; this is idempotent and safe to run on every load. Run via
 * the grid hook's `normalizeLoaded` so the seeded rows are part of the clean
 * snapshot and never count as unsaved changes.
 */
/**
 * Official revenue per month — the source of truth used by the Revenue grid's
 * total (and now its comparison panel). Each month picks the first level that
 * carries a value, in order: GAIA Revenue line > the other GAIA detail lines,
 * summed > BL Input, summed (Commission included, as stored). Shared so the grid
 * and the comparison panel always agree.
 */
export function officialRevenueByMonth(data: AxisData): MonthlyMap {
  const forecast = data.actuals.find(
    (r) => r.rowType === REVENUE_GAIA_FORECAST_TYPE
  );
  const others = data.actuals.filter(
    (r) => r.rowType !== REVENUE_GAIA_FORECAST_TYPE
  );
  const out: MonthlyMap = emptyMonthly();
  for (const m of MONTHS) {
    const gaia = forecast?.months[m] ?? 0;
    if (gaia !== 0) {
      out[m] = gaia;
      continue;
    }
    let detail = 0;
    let hasDetail = false;
    for (const r of others) {
      const v = r.months[m] ?? 0;
      if (v !== 0) hasDetail = true;
      detail += v;
    }
    if (hasDetail) {
      out[m] = detail;
      continue;
    }
    let bl = 0;
    for (const b of data.buckets) for (const r of b.rows) bl += r.months[m] ?? 0;
    out[m] = bl;
  }
  return out;
}

export function ensureRevenueShape(data: AxisData): AxisData {
  // Fill all 12 months; the label is always the stream's canonical type label
  // (rows are real revenue types, never renamed). The note is preserved.
  const normalize = (row: ForecastRow): ForecastRow => ({
    rowId: row.rowId,
    rowType: row.rowType,
    label: REVENUE_STREAM_LABELS[row.rowType as RevenueStream] ?? row.rowType,
    months: { ...emptyMonthly(), ...row.months },
    ...(row.note ? { note: row.note } : {}),
  });

  // BL Input — on a brand-new (empty) doc, seed the four base streams in order.
  // On an existing doc, preserve EXACTLY what is stored (in order, including
  // several lines of the same stream and minus any the user deleted), only
  // ensuring the computed Commission row is present — it is required and is
  // never added or removed by hand.
  const existingBl = data.buckets.flatMap((b) => b.rows).map(normalize);
  let blRows: ForecastRow[];
  if (existingBl.length === 0) {
    blRows = REVENUE_BL_STREAMS.map((s) => newRow(s, REVENUE_STREAM_LABELS[s]));
  } else {
    blRows = existingBl;
    if (!blRows.some((r) => r.rowType === REVENUE_COMMISSION_TYPE)) {
      blRows = [
        ...blRows,
        newRow(
          REVENUE_COMMISSION_TYPE,
          REVENUE_STREAM_LABELS[REVENUE_COMMISSION_TYPE]
        ),
      ];
    }
  }

  // GAIA (ADMIN_INPUT) — exactly one row per stream, in the fixed order.
  const actualsByType = new Map<string, ForecastRow>();
  for (const row of data.actuals) {
    if (!actualsByType.has(row.rowType)) actualsByType.set(row.rowType, row);
  }
  const ensureActual = (stream: RevenueStream): ForecastRow => {
    const prev = actualsByType.get(stream);
    if (prev) {
      return {
        rowId: prev.rowId,
        rowType: stream,
        label: REVENUE_STREAM_LABELS[stream],
        months: { ...emptyMonthly(), ...prev.months },
        ...(prev.note ? { note: prev.note } : {}),
      };
    }
    return newRow(stream, REVENUE_STREAM_LABELS[stream]);
  };
  const actuals = REVENUE_ADMIN_STREAMS.map(ensureActual);

  const base = data.buckets[0];
  const bucket: ForecastBucket = {
    bucketId: base?.bucketId ?? newBucket("Revenue").bucketId,
    name: base?.name ?? "Revenue",
    rows: blRows,
  };

  return { buckets: [bucket], actuals };
}
