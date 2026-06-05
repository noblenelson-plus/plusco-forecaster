// lib/dashboard/data/use-scope-forecast-data.ts

/**
 * Fetches and aggregates forecast data for the whole dashboard scope (every
 * filtered client, for the global Year + RFQ) and reshapes it into the
 * breakdowns the tabs render. One Firestore read per client (the entry doc
 * carries all three axes), run in parallel.
 *
 * Re-runs when the client set or the Year/RFQ context changes. A stale request
 * (filters changed mid-flight) is discarded via a cancellation flag.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchDataEntry } from "../../services/data-entry-service";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../services/labs-partner-service";
import {
  computeLabsPenetration,
  type LabsPenetrationResult,
} from "../../format/labs-penetration";
import {
  emptyAxisData,
  type AxisData,
  type AxisId,
  type DataEntry,
} from "../../types/forecaster.types";
import type { MonthlyMap } from "../../types/common.types";
import type { LabsPartner } from "../../types/labs.types";
import type { DashboardScope } from "../widgets/widget.types";
import {
  computeLabsMonthly,
  computeMediaBreakdown,
  computeRevenueBreakdown,
  mergeAxisData,
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

interface RawScopeData {
  media: AxisData;
  labs: AxisData;
  revenue: AxisData;
  clientsWithData: number;
}

const EMPTY_RAW: RawScopeData = {
  media: emptyAxisData(),
  labs: emptyAxisData(),
  revenue: emptyAxisData(),
  clientsWithData: 0,
};

export interface ScopeForecastData {
  loading: boolean;
  error: string | null;
  /** A Year + RFQ are both selected — without them there is nothing to fetch. */
  hasContext: boolean;
  clientCount: number;
  clientsWithData: number;
  media: MediaBreakdown;
  revenue: RevenueBreakdown;
  labs: LabsPenetrationResult;
  labsMonthly: MonthlyMap;
}

export function useScopeForecastData(scope: DashboardScope): ScopeForecastData {
  const { clientIds, year, rfq } = scope;
  const hasContext = year !== null && rfq !== null;
  // Nothing to fetch without a Year + RFQ and at least one client in scope.
  const disabled = !hasContext || clientIds.length === 0;

  const [raw, setRaw] = useState<RawScopeData>(EMPTY_RAW);
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
        const entries = await Promise.all(
          clientIds.map((id) => fetchDataEntry(id, year!, rfq!.type))
        );
        if (cancelled) return;

        const mediaList: AxisData[] = [];
        const labsList: AxisData[] = [];
        const revenueList: AxisData[] = [];
        let clientsWithData = 0;

        for (const entry of entries) {
          const media = axisOf(entry, "media");
          const labs = axisOf(entry, "labs");
          const revenue = axisOf(entry, "revenue");
          mediaList.push(media);
          labsList.push(labs);
          revenueList.push(revenue);
          if (hasAnyInput(media) || hasAnyInput(labs) || hasAnyInput(revenue)) {
            clientsWithData += 1;
          }
        }

        setRaw({
          media: mergeAxisData(mediaList),
          labs: mergeAxisData(labsList),
          revenue: mergeAxisData(revenueList),
          clientsWithData,
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load forecast data."
          );
          setRaw(EMPTY_RAW);
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

  // When disabled (no context / empty scope) present an empty, idle result
  // without writing state from the effect — `raw` may hold stale fetched data.
  const effective = disabled ? EMPTY_RAW : raw;

  const partnersForYear = useMemo(
    () => (year ? getLabsPartnersForYear(partners, year) : []),
    [partners, year]
  );

  const media = useMemo(
    () => computeMediaBreakdown(effective.media),
    [effective.media]
  );
  const revenue = useMemo(
    () => computeRevenueBreakdown(effective.revenue),
    [effective.revenue]
  );
  const labs = useMemo(
    () => computeLabsPenetration(effective.labs, effective.media, partnersForYear),
    [effective.labs, effective.media, partnersForYear]
  );
  const labsMonthly = useMemo(
    () => computeLabsMonthly(effective.labs),
    [effective.labs]
  );

  return {
    loading: disabled ? false : loading,
    error: disabled ? null : error,
    hasContext,
    clientCount: clientIds.length,
    clientsWithData: effective.clientsWithData,
    media,
    revenue,
    labs,
    labsMonthly,
  };
}
