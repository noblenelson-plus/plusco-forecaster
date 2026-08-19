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
 * A month can be overwritten: when the submission carries a value on a BL
 * Commission Overwrite line for a month, the commission is NOT calculated for
 * that month (`commissionOverwriteMonths` + `applyCommissionOverwrite`).
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
  GENERAL_PROJECT_NAME,
  newRow,
  MEDIA_TYPE_LABELS,
  REVENUE_BL_STREAMS,
  REVENUE_ADMIN_STREAMS,
  REVENUE_STREAM_LABELS,
  REVENUE_COMMISSION_TYPE,
  REVENUE_COMMISSION_OVERWRITE_TYPE,
  REVENUE_ACCRUAL_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  actualsMonthEntered,
  hasExplicitZero,
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
  /**
   * Months whose commission was suppressed because a BL Commission Overwrite
   * line carries a value (see applyCommissionOverwrite). Empty straight out of
   * computeCommission.
   */
  overwritten: Set<number>;
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
// Non-commissionable buckets (campaigns a BL flagged) are excluded from the
  // commission base — their spend still counts everywhere else, just not here.
  const plannedByType = aggregateByType(
    mediaData,
    "BL_INPUT",
    (bucket) => !bucket.nonCommissionable
  );  const months = emptyMonthly();
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

  return { months, byMonth, annual, overwritten: new Set() };
}

/**
 * Months (1–12) where the submission carries a Commission Overwrite value —
 * any BL Commission Overwrite line (across all projects) with a non-zero
 * amount OR an explicitly entered 0 for that month. These months suppress the
 * computed commission (a deliberate $0 overwrite zeroes it).
 */
export function commissionOverwriteMonths(revenueData: AxisData): Set<number> {
  const overwritten = new Set<number>();
  for (const bucket of revenueData.buckets) {
    for (const row of bucket.rows) {
      if (row.rowType !== REVENUE_COMMISSION_OVERWRITE_TYPE) continue;
      for (const m of MONTHS) {
        if ((row.months[m] ?? 0) !== 0 || hasExplicitZero(row, m))
          overwritten.add(m);
      }
    }
  }
  return overwritten;
}

/**
 * Applies the Commission Overwrite rule to a computed breakdown: for each
 * overwritten month the commission is not calculated — the month is zeroed
 * (value and hover lines) and flagged in `overwritten` so the grid can explain
 * the suppression. Returns the base breakdown untouched when nothing is
 * overwritten.
 */
export function applyCommissionOverwrite(
  base: CommissionBreakdown,
  overwritten: Set<number>
): CommissionBreakdown {
  if (overwritten.size === 0) return base;
  const months = { ...base.months };
  const byMonth = { ...base.byMonth };
  let annual = base.annual;
  for (const m of overwritten) {
    annual -= months[m] ?? 0;
    months[m] = 0;
    byMonth[m] = [];
  }
  return { months, byMonth, annual, overwritten };
}

// ─── Official revenue & BL Submission ───────────────────────────────────────

/**
 * Official revenue per month — simply the Official Revenue line (stored as
 * `gaiaForecast`), with no prioritization. Shared so the grid's Official
 * Revenue row and its comparison reference (the previous RFQ's official
 * revenue) always agree.
 */
export function officialRevenueByMonth(data: AxisData): MonthlyMap {
  const forecast = data.actuals.find(
    (r) => r.rowType === REVENUE_GAIA_FORECAST_TYPE
  );
  const out: MonthlyMap = emptyMonthly();
  for (const m of MONTHS) out[m] = forecast?.months[m] ?? 0;
  return out;
}

/**
 * BL Submission per month — a two-level priority between the GAIA detail lines
 * and the BL Input. For each month the GAIA detail lines win when any of them
 * carries a value — a non-zero amount OR an explicitly entered 0 (summed);
 * otherwise the BL Input is used (summed, Commission included as stored). This
 * is the figure compared against the previous RFQ's official revenue in the
 * grid's variance row.
 */
export function blSubmissionByMonth(data: AxisData): MonthlyMap {
  const others = data.actuals.filter(
    (r) => r.rowType !== REVENUE_GAIA_FORECAST_TYPE
  );
  const out: MonthlyMap = emptyMonthly();
  for (const m of MONTHS) {
    let detail = 0;
    let hasDetail = false;
    for (const r of others) {
      const v = r.months[m] ?? 0;
      if (actualsMonthEntered(r, m)) hasDetail = true;
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

/**
 * BL Submission broken down by stream (rowType). Applies the same per-month
 * two-level priority as `blSubmissionByMonth`, then attributes the winning
 * level's cells to their stream: the GAIA detail lines when any carries a value
 * that month, otherwise the BL Input rows. Zero cells are skipped, so summing
 * every stream's months reproduces `blSubmissionByMonth` exactly.
 *
 * This mirrors the grid's per-stream breakdown (revenue-grid.tsx), and is used
 * by the dashboard to aggregate BL Submission per client before summing the
 * scope — the level decision must be made client by client.
 */
export function blSubmissionByStream(data: AxisData): Record<string, MonthlyMap> {
  const others = data.actuals.filter(
    (r) => r.rowType !== REVENUE_GAIA_FORECAST_TYPE
  );
  const out: Record<string, MonthlyMap> = {};
  const add = (stream: string, m: number, v: number) => {
    if (!v) return;
    (out[stream] ??= emptyMonthly())[m] += v;
  };
  for (const m of MONTHS) {
    const hasDetail = others.some((r) => actualsMonthEntered(r, m));
    if (hasDetail) {
      for (const r of others) add(r.rowType, m, r.months[m] ?? 0);
    } else {
      for (const b of data.buckets)
        for (const r of b.rows) add(r.rowType, m, r.months[m] ?? 0);
    }
  }
  return out;
}

/**
 * Winning BL Submission level for each month — the same two-level priority as
 * `blSubmissionByMonth`, exposed as the decision itself so callers can mask a
 * row's cells to the months it actually feeds the submission ("counted"):
 *   "DETAIL" — the GAIA detail lines win (any of them carries a value that
 *              month); "BL" — the BL Input wins; "NONE" — neither has data.
 * The Official Revenue line (`gaiaForecast`) is independent and never part of
 * this. Mirrors the grid's per-month `blLevel`.
 */
export type BlSubmissionLevel = "NONE" | "BL" | "DETAIL";

export function blSubmissionLevelByMonth(
  data: AxisData
): Record<number, BlSubmissionLevel> {
  const others = data.actuals.filter(
    (r) => r.rowType !== REVENUE_GAIA_FORECAST_TYPE
  );
  const map: Record<number, BlSubmissionLevel> = {};
  for (const m of MONTHS) {
    if (others.some((r) => actualsMonthEntered(r, m))) {
      map[m] = "DETAIL";
      continue;
    }
    let bl = 0;
    for (const b of data.buckets) for (const r of b.rows) bl += r.months[m] ?? 0;
    map[m] = bl !== 0 ? "BL" : "NONE";
  }
  return map;
}

// ─── Fixed-structure seeding ────────────────────────────────────────────────

/**
 * Ensures the revenue axis carries its fixed structure: BL projects (buckets)
 * of stream lines with a mandatory "General" project FIRST — it hosts the
 * required Commission (computed) and Accrual lines, so the commission math
 * always has one well-known home — and one GAIA actuals row per admin stream,
 * in canonical order. Existing months (and row/bucket ids) are preserved;
 * this is idempotent and safe to run on every load. Run via the grid hook's
 * `normalizeLoaded` so the seeded rows are part of the clean snapshot and
 * never count as unsaved changes.
 */
export function ensureRevenueShape(data: AxisData): AxisData {
  // Fill all 12 months; the label is always the stream's canonical type label
  // (rows are real revenue types, never renamed). The note is preserved, and
  // so are BL explicit zeros (Commission Overwrite) — dropping any month whose
  // stored value is no longer 0 (a later non-zero entry supersedes the flag).
  // A Product Fees line's product link is preserved too.
  const normalize = (row: ForecastRow): ForecastRow => {
    const months = { ...emptyMonthly(), ...row.months };
    const explicitZeros = (row.explicitZeros ?? []).filter(
      (m) => (months[m] ?? 0) === 0
    );
    return {
      rowId: row.rowId,
      rowType: row.rowType,
      label: REVENUE_STREAM_LABELS[row.rowType as RevenueStream] ?? row.rowType,
      months,
      ...(row.note ? { note: row.note } : {}),
      ...(explicitZeros.length ? { explicitZeros } : {}),
      ...(row.productId ? { productId: row.productId } : {}),
    };
  };

  // BL Input — preserve the stored projects (ids, names, row order), only
  // normalizing each row. On a brand-new (empty) doc, seed a General project
  // with the base streams.
  let buckets: ForecastBucket[] = data.buckets.map((b) => ({
    bucketId: b.bucketId,
    name: b.name,
    rows: b.rows.map(normalize),
  }));
  if (buckets.length === 0 || buckets.every((b) => b.rows.length === 0)) {
    const seeded = buckets[0] ?? newBucket(GENERAL_PROJECT_NAME);
    buckets = [
      {
        bucketId: seeded.bucketId,
        name: GENERAL_PROJECT_NAME,
        rows: REVENUE_BL_STREAMS.map((s) => newRow(s, REVENUE_STREAM_LABELS[s])),
      },
      ...buckets.slice(1),
    ];
  }

  // The General project is mandatory and always first. A legacy single-bucket
  // doc (named "Revenue") is simply renamed; with several projects and no
  // General, one is prepended.
  let generalIdx = buckets.findIndex((b) => b.name === GENERAL_PROJECT_NAME);
  if (generalIdx === -1) {
    if (buckets.length === 1) {
      buckets[0] = { ...buckets[0], name: GENERAL_PROJECT_NAME };
      generalIdx = 0;
    } else {
      buckets = [newBucket(GENERAL_PROJECT_NAME), ...buckets];
      generalIdx = 0;
    }
  }
  if (generalIdx !== 0) {
    const [general] = buckets.splice(generalIdx, 1);
    buckets = [general, ...buckets];
  }

  // The Commission (computed) and Accrual (fixed) rows are required, never
  // added or removed by hand, and always live in General — commission math
  // (computeCommission overlay, syncRevenueCommission) relies on it. Strays
  // in other projects are moved home.
  const general = buckets[0];
  for (const required of [REVENUE_COMMISSION_TYPE, REVENUE_ACCRUAL_TYPE]) {
    if (general.rows.some((r) => r.rowType === required)) continue;
    let moved: ForecastRow | null = null;
    for (const b of buckets.slice(1)) {
      const at = b.rows.findIndex((r) => r.rowType === required);
      if (at !== -1) {
        [moved] = b.rows.splice(at, 1);
        break;
      }
    }
    general.rows.push(moved ?? newRow(required, REVENUE_STREAM_LABELS[required]));
  }

  // GAIA (ADMIN_INPUT) — exactly one row per stream, in the fixed order.
  const actualsByType = new Map<string, ForecastRow>();
  for (const row of data.actuals) {
    if (!actualsByType.has(row.rowType)) actualsByType.set(row.rowType, row);
  }
  const ensureActual = (stream: RevenueStream): ForecastRow => {
    const prev = actualsByType.get(stream);
    if (prev) {
      const months = { ...emptyMonthly(), ...prev.months };
      // Explicit zeros survive the reload, dropping any month whose stored
      // value is no longer 0 (a later non-zero entry supersedes the flag).
      const explicitZeros = (prev.explicitZeros ?? []).filter(
        (m) => (months[m] ?? 0) === 0
      );
      return {
        rowId: prev.rowId,
        rowType: stream,
        label: REVENUE_STREAM_LABELS[stream],
        months,
        ...(prev.note ? { note: prev.note } : {}),
        // Detail lines ride along — the grid hook derives the parent's months
        // from them (row = Σ details) after this normalization. A detail line's
        // own product link (Product Fees) rides along inside them.
        ...(prev.details?.length ? { details: prev.details } : {}),
        ...(explicitZeros.length ? { explicitZeros } : {}),
        // The roll-up (no-details) Product Fees actuals row keeps its product
        // link, mirroring the BL rows.
        ...(prev.productId ? { productId: prev.productId } : {}),
      };
    }
    return newRow(stream, REVENUE_STREAM_LABELS[stream]);
  };
  const actuals = REVENUE_ADMIN_STREAMS.map(ensureActual);

  return { buckets, actuals };
}
