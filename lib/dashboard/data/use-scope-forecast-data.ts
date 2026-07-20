// lib/dashboard/data/use-scope-forecast-data.ts

/**
 * Fetches and aggregates forecast data for the whole dashboard scope (every
 * filtered client, for the global Year + RFQ) and reshapes it into the
 * breakdowns the tabs render. One Firestore read per client (the entry doc
 * carries all three axes), run in parallel.
 *
 * Every client's amounts are normalized to CAD before aggregation: a client
 * forecasting in USD has its figures multiplied by the year's USD→CAD rate
 * (Admin → Currency). The dashboard therefore always reports in CAD.
 *
 * Re-runs the fetch when the client set or the Year/RFQ context changes. A stale
 * request (filters changed mid-flight) is discarded via a cancellation flag.
 * Currency normalization is a separate, pure recompute so changing the rate (or
 * a client's currency) re-aggregates without re-reading Firestore.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchDataEntry } from "../../services/data-entry-service";
import { fetchAnnualActualsEntry } from "../../services/annual-actuals-service";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../services/labs-partner-service";
import {
  computeLabsPenetration,
  type LabsPenetrationResult,
} from "../../format/labs-penetration";
import {
  commissionOverwriteMonths,
  blSubmissionByStream,
  officialRevenueByMonth,
} from "../../format/revenue-commission";
import type { ClientOverwriteMonths } from "./qa-checks";
import {
  rollUpActuals,
  emptyMonthly,
  type AxisData,
  type AxisId,
  type DataEntry,
} from "../../types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../types/common.types";
import type { LabsPartner } from "../../types/labs.types";
import type { Currency } from "../../types/client.types";
import type { DashboardScope } from "../widgets/widget.types";
import { aggregateByType } from "../../types/forecaster.types";
import {
  actualsMonthly,
  computeLabsMonthly,
  computeMediaBreakdown,
  computeRevenueBreakdown,
  revenueBreakdownFromStreams,
  officialBreakdown,
  labsByPartnerForClient,
  maskAxisDataToMonths,
  mergeAxisData,
  resolveLabsDetail,
  scaleAxisData,
  OFFICIAL_STREAM_KEY,
  type ClientLabsRaw,
  type ClientMediaBreakdown,
  type ClientMonthlyTotal,
  type ClientRevenueBreakdown,
  type LabsDetailRow,
  type MediaBreakdown,
  type RevenueBreakdown,
} from "./aggregate";

/** The two revenue definitions the dashboard can show (see revenue-grid.tsx). */
export type RevenueMode = "blSubmission" | "official";

/** A scope-level revenue breakdown plus its per-client rows, for one mode. */
export interface RevenueView {
  breakdown: RevenueBreakdown;
  byClient: ClientRevenueBreakdown[];
}

/** Coerce a stored axis into a usable AxisData (tolerates legacy/partial docs). */
function axisOf(entry: DataEntry | null, axis: AxisId): AxisData {
  const raw = entry?.axes?.[axis];
  return {
    buckets: Array.isArray(raw?.buckets) ? raw.buckets : [],
    actuals: Array.isArray(raw?.actuals) ? raw.actuals : [],
  };
}

function hasAnyInput(data: AxisData): boolean {
  return (
    data.buckets.some((b) => b.rows.length > 0) || data.actuals.length > 0
  );
}

/** One in-scope client's three axes, as fetched (before currency normalization). */
interface RawClientAxes {
  clientId: string;
  media: AxisData;
  labs: AxisData;
  revenue: AxisData;
}

export interface ScopeForecastData {
  loading: boolean;
  error: string | null;
  /** A Year + RFQ are both selected — without them there is nothing to fetch. */
  hasContext: boolean;
  clientCount: number;
  clientsWithData: number;
  media: MediaBreakdown;
  /** One entry per in-scope client with media spend, for the data table. */
  mediaByClient: ClientMediaBreakdown[];
  revenue: RevenueBreakdown;
  /** One entry per in-scope client with revenue, for the table and ratios.
   *  Raw BL_INPUT by stream — consumed by the QA commission check. */
  revenueByClient: ClientRevenueBreakdown[];
  /**
   * Revenue reshaped for each selectable definition — BL Submission (the
   * forecast grid's mauve two-level-priority figure, per-stream) and Official
   * Revenue (the emerald hand-entered `gaiaForecast` line, single stream). The
   * BL Submission mechanic is resolved client by client before summing, so it
   * cannot be derived from the merged scope. The Revenue tab picks a mode.
   */
  revenueByMode: Record<RevenueMode, RevenueView>;
  labs: LabsPenetrationResult;
  labsMonthly: MonthlyMap;
  /** One row per (client × partner) with spend, for the detailed Labs table. */
  labsDetail: LabsDetailRow[];
  /** Per-client GAIA (ADMIN_INPUT) revenue by stream — feeds the QA checks. */
  revenueActualsByClient: ClientRevenueBreakdown[];
  /** Per-client months carrying a Commission Overwrite — feeds the QA
   *  commission check (explicit zeros survive here where the aggregated
   *  streams lose them). */
  commissionOverwriteMonthsByClient: ClientOverwriteMonths[];
  /** Per-client MediaOcean media actuals per month — feeds the QA checks. */
  mediaActualsByClient: ClientMonthlyTotal[];
  /** Per-client MediaOcean Labs actuals per month — feeds the QA checks. */
  labsActualsByClient: ClientMonthlyTotal[];
  /** In-scope clients that forecast in USD (their amounts were converted to CAD). */
  usdClientCount: number;
  /** True when an in-scope USD client has no USD→CAD rate set for the year, so
   *  its figures could not be converted and are shown as-is. */
  missingRate: boolean;
}

export function useScopeForecastData(
  scope: DashboardScope,
  /** Currency per client id; a client absent from the map is treated as CAD. */
  currencyByClient?: Record<string, Currency>,
  /** USD→CAD rate for the selected year; undefined when none is configured. */
  usdToCad?: number,
  /**
   * Months (1..12) to restrict every aggregation to. Empty/undefined (or all
   * 12) = no restriction. A pure recompute — changing it never refetches.
   */
  months?: number[]
): ScopeForecastData {
  const { clientIds, year, rfq } = scope;
  const hasContext = year !== null && rfq !== null;
  // Nothing to fetch without a Year + RFQ and at least one client in scope.
  const disabled = !hasContext || clientIds.length === 0;

  const [rawClients, setRawClients] = useState<RawClientAxes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lab partners (global) — needed to attribute Labs spend to media types.
  const [partners, setPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsub = subscribeToLabsPartners(setPartners);
    return () => unsub();
  }, []);

  // Stable dependency key — array identity changes every render otherwise.
  const clientKey = clientIds.join(",");
  const rfqType = rfq?.type ?? null;

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    // All state updates live inside this async callback (never synchronously in
    // the effect body) so they don't trigger cascading renders.
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Per client: the submission doc (BL buckets, Revenue GAIA actuals) plus
        // the annual_actuals doc (Media/Labs MediaOcean is annual, not per-RFQ).
        const results = await Promise.all(
          clientIds.map((id) =>
            Promise.all([
              fetchDataEntry(id, year!, rfq!.type),
              fetchAnnualActualsEntry(id, year!),
            ])
          )
        );
        if (cancelled) return;

        const next: RawClientAxes[] = results.map(([entry, annual], i) => {
          // Media/Labs actuals come from the annual doc, not the submission doc.
          // Every ADMIN_INPUT side gets the same detail roll-up as the grid
          // (a row with detail lines derives its months from them) — stored
          // parent months can be zero/stale on docs saved before the roll-up.
          const media = axisOf(entry, "media");
          media.actuals = rollUpActuals(
            Array.isArray(annual.media) ? annual.media : []
          );
          const labs = axisOf(entry, "labs");
          labs.actuals = rollUpActuals(
            Array.isArray(annual.labs) ? annual.labs : []
          );
          const revenue = axisOf(entry, "revenue");
          revenue.actuals = rollUpActuals(revenue.actuals);
          return { clientId: clientIds[i], media, labs, revenue };
        });
        setRawClients(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load forecast data."
          );
          setRawClients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey, year, rfqType, disabled]);

  const partnersForYear = useMemo(
    () => (year ? getLabsPartnersForYear(partners, year) : []),
    [partners, year]
  );

  // Stable month-filter key — the caller's array identity changes per render.
  const monthsKey =
    months && months.length > 0 && months.length < 12
      ? [...months].sort((a, b) => a - b).join(",")
      : "";

  // Normalize each client to CAD (and mask to the selected months), then
  // merge + reshape into scope aggregates. When disabled the scope is empty so
  // this collapses to empty breakdowns without writing state from an effect
  // (`rawClients` may hold stale data).
  const processed = useMemo(() => {
    const list = disabled ? [] : rawClients;
    const monthSet = monthsKey
      ? new Set(monthsKey.split(",").map(Number))
      : null;
    const restrict = (data: AxisData): AxisData =>
      monthSet ? maskAxisDataToMonths(data, monthSet) : data;

    const mediaList: AxisData[] = [];
    const labsList: AxisData[] = [];
    const revenueList: AxisData[] = [];
    const mediaByClient: ClientMediaBreakdown[] = [];
    const labsByClient: ClientLabsRaw[] = [];
    const revenueByClient: ClientRevenueBreakdown[] = [];
    // BL Submission / Official Revenue, computed per client (the level decision
    // is per client × per month) then summed into the scope maps below.
    const revenueByClientBLSub: ClientRevenueBreakdown[] = [];
    const revenueByClientOfficial: ClientRevenueBreakdown[] = [];
    const scopeBLSubByStream: Record<string, MonthlyMap> = {};
    const scopeOfficialMonthly: MonthlyMap = emptyMonthly();
    const revenueActualsByClient: ClientRevenueBreakdown[] = [];
    const commissionOverwriteMonthsByClient: ClientOverwriteMonths[] = [];
    const mediaActualsByClient: ClientMonthlyTotal[] = [];
    const labsActualsByClient: ClientMonthlyTotal[] = [];
    let clientsWithData = 0;
    let usdClientCount = 0;
    let missingRate = false;

    for (const rc of list) {
      const currency = currencyByClient?.[rc.clientId] ?? "CAD";
      let factor = 1;
      if (currency === "USD") {
        usdClientCount += 1;
        if (usdToCad != null) factor = usdToCad;
        else missingRate = true; // no rate → left unconverted, surfaced in the UI
      }

      const media = restrict(scaleAxisData(rc.media, factor));
      const labs = restrict(scaleAxisData(rc.labs, factor));
      const revenue = restrict(scaleAxisData(rc.revenue, factor));

      mediaList.push(media);
      labsList.push(labs);
      revenueList.push(revenue);

      if (hasAnyInput(media)) {
        // Per-client BL media spend per type per month, for the table.
        mediaByClient.push({
          clientId: rc.clientId,
          byType: aggregateByType(media, "BL_INPUT"),
        });
      }
      if (hasAnyInput(labs)) {
        // Per-client BL Labs spend per partner per month, for the table.
        labsByClient.push({
          clientId: rc.clientId,
          byPartner: labsByPartnerForClient(labs),
        });
      }
      if (hasAnyInput(revenue)) {
        // Per-client BL revenue per stream per month, for the table/ratios.
        revenueByClient.push({
          clientId: rc.clientId,
          byStream: aggregateByType(revenue, "BL_INPUT"),
        });

        // BL Submission per stream (the mauve two-level-priority figure) —
        // resolved for this client, then folded into the scope sums.
        const blSubStreams = blSubmissionByStream(revenue);
        revenueByClientBLSub.push({
          clientId: rc.clientId,
          byStream: blSubStreams,
        });
        for (const [stream, months] of Object.entries(blSubStreams)) {
          const target = (scopeBLSubByStream[stream] ??= emptyMonthly());
          for (const m of MONTHS) target[m] += months[m] ?? 0;
        }

        // Official Revenue (the emerald hand-entered line) — a single stream.
        const officialMonthly = officialRevenueByMonth(revenue);
        revenueByClientOfficial.push({
          clientId: rc.clientId,
          byStream: { [OFFICIAL_STREAM_KEY]: officialMonthly },
        });
        for (const m of MONTHS) scopeOfficialMonthly[m] += officialMonthly[m] ?? 0;

        // Overwrite months come from the raw axis: explicit-zero overwrites
        // (deliberate $0) are invisible in the aggregated streams. A month
        // masked out by the month filter compares 0 vs 0 downstream anyway,
        // so masking is irrelevant here.
        const owMonths = commissionOverwriteMonths(rc.revenue);
        if (owMonths.size > 0) {
          commissionOverwriteMonthsByClient.push({
            clientId: rc.clientId,
            months: [...owMonths],
          });
        }
      }

      // ADMIN_INPUT sides, per client — consumed by the QA tab's checks.
      if (revenue.actuals.length > 0) {
        revenueActualsByClient.push({
          clientId: rc.clientId,
          byStream: aggregateByType(revenue, "ADMIN_INPUT"),
        });
      }
      if (media.actuals.length > 0) {
        mediaActualsByClient.push({
          clientId: rc.clientId,
          months: actualsMonthly(media),
        });
      }
      if (labs.actuals.length > 0) {
        labsActualsByClient.push({
          clientId: rc.clientId,
          months: actualsMonthly(labs),
        });
      }
      if (hasAnyInput(media) || hasAnyInput(labs) || hasAnyInput(revenue)) {
        clientsWithData += 1;
      }
    }

    return {
      media: mergeAxisData(mediaList),
      labs: mergeAxisData(labsList),
      revenue: mergeAxisData(revenueList),
      mediaByClient,
      labsByClient,
      revenueByClient,
      revenueByClientBLSub,
      revenueByClientOfficial,
      scopeBLSubByStream,
      scopeOfficialMonthly,
      revenueActualsByClient,
      commissionOverwriteMonthsByClient,
      mediaActualsByClient,
      labsActualsByClient,
      clientsWithData,
      usdClientCount,
      missingRate,
    };
  }, [disabled, rawClients, currencyByClient, usdToCad, monthsKey]);

  const media = useMemo(
    () => computeMediaBreakdown(processed.media),
    [processed.media]
  );
  const revenue = useMemo(
    () => computeRevenueBreakdown(processed.revenue),
    [processed.revenue]
  );
  const revenueByMode = useMemo<Record<RevenueMode, RevenueView>>(
    () => ({
      blSubmission: {
        breakdown: revenueBreakdownFromStreams(processed.scopeBLSubByStream),
        byClient: processed.revenueByClientBLSub,
      },
      official: {
        breakdown: officialBreakdown(processed.scopeOfficialMonthly),
        byClient: processed.revenueByClientOfficial,
      },
    }),
    [
      processed.scopeBLSubByStream,
      processed.revenueByClientBLSub,
      processed.scopeOfficialMonthly,
      processed.revenueByClientOfficial,
    ]
  );
  const labs = useMemo(
    () => computeLabsPenetration(processed.labs, processed.media, partnersForYear),
    [processed.labs, processed.media, partnersForYear]
  );
  const labsMonthly = useMemo(
    () => computeLabsMonthly(processed.labs),
    [processed.labs]
  );
  const labsDetail = useMemo(
    () => resolveLabsDetail(processed.labsByClient, partnersForYear),
    [processed.labsByClient, partnersForYear]
  );

  return {
    loading: disabled ? false : loading,
    error: disabled ? null : error,
    hasContext,
    clientCount: clientIds.length,
    clientsWithData: processed.clientsWithData,
    media,
    mediaByClient: processed.mediaByClient,
    revenue,
    revenueByClient: processed.revenueByClient,
    revenueByMode,
    labs,
    labsMonthly,
    labsDetail,
    revenueActualsByClient: processed.revenueActualsByClient,
    commissionOverwriteMonthsByClient: processed.commissionOverwriteMonthsByClient,
    mediaActualsByClient: processed.mediaActualsByClient,
    labsActualsByClient: processed.labsActualsByClient,
    usdClientCount: processed.usdClientCount,
    missingRate: processed.missingRate,
  };
}
