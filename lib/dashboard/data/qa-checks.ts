// lib/dashboard/data/qa-checks.ts

/**
 * Pure QA checks for the dashboard QA tab. Each check compares two sides of
 * the already-aggregated, CAD-normalized per-client dashboard data and reports
 * every (client × month [× channel]) combination that breaks the rule.
 *
 * Firebase-free and side-effect-free, like aggregate.ts — the tab feeds them
 * the per-client structures exposed by useScopeForecastData.
 */

import {
  MEDIA_TYPES,
  MONTHS,
  type MediaType,
  type MonthlyMap,
} from "../../types/common.types";
import {
  emptyMonthly,
  MEDIA_TYPE_LABELS,
  REVENUE_COMMISSION_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
} from "../../types/forecaster.types";
import type {
  ClientMediaBreakdown,
  ClientMonthlyTotal,
  ClientRevenueBreakdown,
  LabsDetailRow,
} from "./aggregate";

/**
 * Default acceptable relative gap (5%). Each check takes a `tolerance` (0..1):
 * a comparison only fails when it deviates by more than that share of the
 * reference amount. The QA cards expose a slider to adjust it per check —
 * session-only, never persisted.
 */
export const DEFAULT_QA_TOLERANCE = 0.05;

/**
 * Amounts within this many dollars are always treated as equal, whatever the
 * relative tolerance — absorbs float noise from currency conversion and
 * cent-level rounding even with the slider at 0%.
 */
const QA_EPSILON = 0.5;

/** Allowed slack around `reference` for a relative tolerance (0..1). */
function allowance(reference: number, tolerance: number): number {
  return Math.max(reference * tolerance, QA_EPSILON);
}

export interface QaViolation {
  clientId: string;
  month: number;
  /** Channel / stream the violation concerns — null for per-client-only checks. */
  label: string | null;
  /** The two compared amounts, in the order of the card's value headers. */
  left: number;
  right: number;
}

export interface QaCheckResult {
  /** "empty" — nothing in scope was comparable (no data on either side). */
  status: "pass" | "fail" | "empty";
  /** Number of (client × month [× label]) combinations actually compared. */
  checkedCount: number;
  violations: QaViolation[];
}

function finalize(checkedCount: number, violations: QaViolation[]): QaCheckResult {
  violations.sort(
    (a, b) =>
      a.clientId.localeCompare(b.clientId) ||
      (a.label ?? "").localeCompare(b.label ?? "") ||
      a.month - b.month
  );
  return {
    status: checkedCount === 0 ? "empty" : violations.length > 0 ? "fail" : "pass",
    checkedCount,
    violations,
  };
}

// ─── Test 1 — Labs vs media forecast, per channel ────────────────────────────

/**
 * Labs spend attributed to a media channel (via each partner's media type)
 * must not exceed the BL media spend forecast for the same client, channel and
 * month. Labs rows whose partner is no longer configured (unknown media type)
 * cannot be attributed to a channel and are skipped.
 */
export function checkLabsWithinChannelForecast(
  mediaByClient: ClientMediaBreakdown[],
  labsDetail: LabsDetailRow[],
  tolerance: number
): QaCheckResult {
  const mediaMap = new Map(mediaByClient.map((c) => [c.clientId, c.byType]));

  // client → media type → monthly Labs total (partners of that type summed).
  const labsMap = new Map<string, Map<MediaType, MonthlyMap>>();
  for (const row of labsDetail) {
    if (!row.mediaType) continue;
    let byType = labsMap.get(row.clientId);
    if (!byType) {
      byType = new Map();
      labsMap.set(row.clientId, byType);
    }
    let months = byType.get(row.mediaType);
    if (!months) {
      months = emptyMonthly();
      byType.set(row.mediaType, months);
    }
    for (const m of MONTHS) months[m] += row.months[m] ?? 0;
  }

  let checked = 0;
  const violations: QaViolation[] = [];
  for (const [clientId, byType] of labsMap) {
    const mediaByType = mediaMap.get(clientId);
    for (const [mediaType, labsMonths] of byType) {
      const mediaMonths = mediaByType?.[mediaType];
      for (const m of MONTHS) {
        const labs = labsMonths[m] ?? 0;
        if (labs <= 0) continue;
        checked += 1;
        const media = mediaMonths?.[m] ?? 0;
        if (labs > media + allowance(media, tolerance)) {
          violations.push({
            clientId,
            month: m,
            label: MEDIA_TYPE_LABELS[mediaType],
            left: labs,
            right: media,
          });
        }
      }
    }
  }
  return finalize(checked, violations);
}

// ─── Test 2 — GAIA admin lines vs Official Revenue ───────────────────────────

/**
 * For every month where both sides are entered, the sum of the GAIA admin
 * detail lines (every ADMIN_INPUT stream except Official Revenue) must equal
 * the Official Revenue. Months where either side is absent (zero) are skipped —
 * the rule only applies when both are available.
 */
export function checkRevenueActualsMatchOfficial(
  revenueActualsByClient: ClientRevenueBreakdown[],
  tolerance: number
): QaCheckResult {
  let checked = 0;
  const violations: QaViolation[] = [];
  for (const { clientId, byStream } of revenueActualsByClient) {
    const official = byStream[REVENUE_GAIA_FORECAST_TYPE];
    if (!official) continue;

    const detail = emptyMonthly();
    for (const [stream, months] of Object.entries(byStream)) {
      if (stream === REVENUE_GAIA_FORECAST_TYPE) continue;
      for (const m of MONTHS) detail[m] += months[m] ?? 0;
    }

    for (const m of MONTHS) {
      const sum = detail[m];
      const officialValue = official[m] ?? 0;
      if (sum === 0 || officialValue === 0) continue;
      checked += 1;
      if (Math.abs(sum - officialValue) > allowance(officialValue, tolerance)) {
        violations.push({
          clientId,
          month: m,
          label: null,
          left: sum,
          right: officialValue,
        });
      }
    }
  }
  return finalize(checked, violations);
}

// ─── Tests 3a / 3b — MediaOcean actuals vs forecast total ────────────────────

/**
 * MediaOcean actuals must not exceed the BL forecast total for the same client
 * and month. Used twice — once for Media, once for Labs — each with its own
 * per-client monthly totals. Months without actuals are skipped; a client with
 * actuals but no forecast at all fails (actuals exceed a zero forecast).
 */
export function checkActualsWithinForecast(
  forecastByClient: ClientMonthlyTotal[],
  actualsByClient: ClientMonthlyTotal[],
  tolerance: number
): QaCheckResult {
  const forecastMap = new Map(
    forecastByClient.map((c) => [c.clientId, c.months])
  );
  let checked = 0;
  const violations: QaViolation[] = [];
  for (const { clientId, months } of actualsByClient) {
    const forecast = forecastMap.get(clientId);
    for (const m of MONTHS) {
      const actual = months[m] ?? 0;
      if (actual <= 0) continue;
      checked += 1;
      const planned = forecast?.[m] ?? 0;
      if (actual > planned + allowance(planned, tolerance)) {
        violations.push({
          clientId,
          month: m,
          label: null,
          left: actual,
          right: planned,
        });
      }
    }
  }
  return finalize(checked, violations);
}

/**
 * Inverse of checkActualsWithinForecast — the BL forecast total must not
 * exceed the MediaOcean actuals for the same client and month. Only months
 * with actuals entered (nonzero) are compared: a month not yet synced from
 * MediaOcean says nothing about the forecast, so it is skipped rather than
 * flagged.
 */
export function checkForecastWithinActuals(
  forecastByClient: ClientMonthlyTotal[],
  actualsByClient: ClientMonthlyTotal[],
  tolerance: number
): QaCheckResult {
  const forecastMap = new Map(
    forecastByClient.map((c) => [c.clientId, c.months])
  );
  let checked = 0;
  const violations: QaViolation[] = [];
  for (const { clientId, months } of actualsByClient) {
    const forecast = forecastMap.get(clientId);
    for (const m of MONTHS) {
      const actual = months[m] ?? 0;
      if (actual <= 0) continue;
      checked += 1;
      const planned = forecast?.[m] ?? 0;
      if (planned > actual + allowance(actual, tolerance)) {
        violations.push({
          clientId,
          month: m,
          label: null,
          left: planned,
          right: actual,
        });
      }
    }
  }
  return finalize(checked, violations);
}

// ─── Test — Stored Revenue Commission vs recomputation from Media ────────────

/** One client's `commissionsConfig[year]` slice — rates (%) per type per month. */
export type YearCommissionRates = Partial<Record<MediaType, MonthlyMap>>;

/** Per-client months (1–12) carrying a Commission Overwrite value. */
export interface ClientOverwriteMonths {
  clientId: string;
  months: number[];
}

/**
 * Absolute floor for the commission comparison, wider than QA_EPSILON: the
 * stored commission is rounded per media type in the client's own currency
 * before CAD conversion, so recomputing from the converted spend can differ
 * by a few dollars per month without any real drift.
 */
const COMMISSION_EPSILON = 10;

/**
 * The Commission stored on each Revenue submission must equal the commission
 * recomputed from the BL media spend forecast and the client's commission
 * rates. The stored row is a derived value persisted by syncRevenueCommission
 * (on Media save, rate save, bulk import/delete) — a gap means one of those
 * syncs was missed or failed silently. Months carrying a Commission Overwrite
 * are skipped (the overwrite suppresses the calculation by design), and months
 * where both sides are zero are not comparisons at all.
 */
export function checkCommissionMatchesMedia(
  mediaByClient: ClientMediaBreakdown[],
  revenueByClient: ClientRevenueBreakdown[],
  overwriteMonthsByClient: ClientOverwriteMonths[],
  ratesByClient: Record<string, YearCommissionRates | undefined>,
  tolerance: number
): QaCheckResult {
  const mediaMap = new Map(mediaByClient.map((c) => [c.clientId, c.byType]));
  const storedMap = new Map(
    revenueByClient.map((c) => [c.clientId, c.byStream[REVENUE_COMMISSION_TYPE]])
  );
  const overwriteMap = new Map(
    overwriteMonthsByClient.map((c) => [c.clientId, new Set(c.months)])
  );

  // Union of both sides: a client with media spend + rates but no stored
  // commission at all (sync never ran) must be flagged, and so must a client
  // with a stored commission but no longer any media/rates to justify it.
  const clientIds = new Set([...mediaMap.keys(), ...storedMap.keys()]);

  let checked = 0;
  const violations: QaViolation[] = [];
  for (const clientId of clientIds) {
    const byType = mediaMap.get(clientId);
    const rates = ratesByClient[clientId];
    const stored = storedMap.get(clientId);
    const overwritten = overwriteMap.get(clientId);

    for (const m of MONTHS) {
      if (overwritten?.has(m)) continue;
      // Mirror computeCommission: each type's contribution rounded at source.
      let expected = 0;
      if (byType && rates) {
        for (const type of MEDIA_TYPES) {
          const spend = byType[type]?.[m] ?? 0;
          const rate = rates[type]?.[m] ?? 0;
          expected += Math.round((spend * rate) / 100);
        }
      }
      const storedValue = stored?.[m] ?? 0;
      if (storedValue === 0 && expected === 0) continue;
      checked += 1;
      if (
        Math.abs(storedValue - expected) >
        Math.max(expected * tolerance, COMMISSION_EPSILON)
      ) {
        violations.push({
          clientId,
          month: m,
          label: null,
          left: storedValue,
          right: expected,
        });
      }
    }
  }
  return finalize(checked, violations);
}

// ─── Forecast-side derivations (from data the hook already exposes) ──────────

/** Per-client BL media forecast total per month (all channels summed). */
export function mediaForecastMonthlyByClient(
  mediaByClient: ClientMediaBreakdown[]
): ClientMonthlyTotal[] {
  return mediaByClient.map(({ clientId, byType }) => {
    const months = emptyMonthly();
    for (const map of Object.values(byType)) {
      for (const m of MONTHS) months[m] += map[m] ?? 0;
    }
    return { clientId, months };
  });
}

/** Per-client BL Labs forecast total per month (all partners summed). */
export function labsForecastMonthlyByClient(
  labsDetail: LabsDetailRow[]
): ClientMonthlyTotal[] {
  const byClient = new Map<string, MonthlyMap>();
  for (const row of labsDetail) {
    let months = byClient.get(row.clientId);
    if (!months) {
      months = emptyMonthly();
      byClient.set(row.clientId, months);
    }
    for (const m of MONTHS) months[m] += row.months[m] ?? 0;
  }
  return [...byClient.entries()].map(([clientId, months]) => ({
    clientId,
    months,
  }));
}
