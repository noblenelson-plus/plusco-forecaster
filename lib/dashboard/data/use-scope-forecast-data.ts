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
  type AxisData,
  type AxisId,
  type DataEntry,
} from "../../types/forecaster.types";
import type { MonthlyMap } from "../../types/common.types";
import type { LabsPartner } from "../../types/labs.types";
import type { Currency } from "../../types/client.types";
import type { DashboardScope } from "../widgets/widget.types";
import { aggregateByType } from "../../types/forecaster.types";
import {
  computeLabsMonthly,
  computeMediaBreakdown,
  computeRevenueBreakdown,
  labsByPartnerForClient,
  mergeAxisData,
  resolveLabsDetail,
  scaleAxisData,
  type ClientLabsRaw,
  type ClientMediaBreakdown,
  type ClientRevenueBreakdown,
  type LabsDetailRow,
  type MediaBreakdown,
  type RevenueBreakdown,
} from "./aggregate";

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
  /** One entry per in-scope client with revenue, for the table and ratios. */
  revenueByClient: ClientRevenueBreakdown[];
  labs: LabsPenetrationResult;
  labsMonthly: MonthlyMap;
  /** One row per (client × partner) with spend, for the detailed Labs table. */
  labsDetail: LabsDetailRow[];
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
  usdToCad?: number
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
          const media = axisOf(entry, "media");
          media.actuals = Array.isArray(annual.media) ? annual.media : [];
          const labs = axisOf(entry, "labs");
          labs.actuals = Array.isArray(annual.labs) ? annual.labs : [];
          const revenue = axisOf(entry, "revenue");
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

  // Normalize each client to CAD, then merge + reshape into scope aggregates.
  // When disabled the scope is empty so this collapses to empty breakdowns
  // without writing state from an effect (`rawClients` may hold stale data).
  const processed = useMemo(() => {
    const list = disabled ? [] : rawClients;

    const mediaList: AxisData[] = [];
    const labsList: AxisData[] = [];
    const revenueList: AxisData[] = [];
    const mediaByClient: ClientMediaBreakdown[] = [];
    const labsByClient: ClientLabsRaw[] = [];
    const revenueByClient: ClientRevenueBreakdown[] = [];
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

      const media = scaleAxisData(rc.media, factor);
      const labs = scaleAxisData(rc.labs, factor);
      const revenue = scaleAxisData(rc.revenue, factor);

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
      clientsWithData,
      usdClientCount,
      missingRate,
    };
  }, [disabled, rawClients, currencyByClient, usdToCad]);

  const media = useMemo(
    () => computeMediaBreakdown(processed.media),
    [processed.media]
  );
  const revenue = useMemo(
    () => computeRevenueBreakdown(processed.revenue),
    [processed.revenue]
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
    labs,
    labsMonthly,
    labsDetail,
    usdClientCount: processed.usdClientCount,
    missingRate: processed.missingRate,
  };
}
