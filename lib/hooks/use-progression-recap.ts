// lib/hooks/use-progression-recap.ts

/**
 * Fetches, for every in-scope client, the data needed by the "Progression and
 * flag recap" table: which confirmation steps are ticked, and which flags are
 * raised (with their justifications) for the selected Year + RFQ.
 *
 * One read per client for the current submission plus one for the previous RFQ
 * (needed by the flag engine), run in parallel — mirrors the dashboard's
 * per-client fetch pattern (use-scope-forecast-data.ts). A stale request
 * (scope/context changed mid-flight) is discarded via a cancellation flag.
 *
 * Pure flag logic lives in lib/flags/flag-rules.ts; this hook only gathers the
 * raw per-client axes and runs it.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchDataEntry } from "../services/data-entry-service";
import { computeFlags } from "../flags/flag-rules";
import {
  previousRFQ,
  type AxisData,
  type AxisId,
  type DataEntry,
} from "../types/forecaster.types";
import type { Flag, FlagReviewMap } from "../types/flag.types";
import type { RFQ, RFQType } from "../types/rfq.types";

/** data_entries docs also carry these annotation fields (not on the DataEntry type). */
type EntryWithAnnotations = DataEntry & {
  readyMonths?: unknown;
  flagReviews?: FlagReviewMap;
};

/** Coerce a raw stored axis into a usable AxisData (mirrors the service normalizer). */
function axisOf(
  entry: { axes?: Partial<Record<AxisId, Partial<AxisData>>> } | null,
  axisId: AxisId
): AxisData {
  const raw = entry?.axes?.[axisId];
  return {
    buckets: Array.isArray(raw?.buckets) ? raw!.buckets! : [],
    actuals: Array.isArray(raw?.actuals) ? raw!.actuals! : [],
  };
}

export interface RecapRow {
  clientId: string;
  /** Ids of the confirmation steps ticked complete for this submission. */
  confirmed: Set<string>;
  /** Flags raised for this client's submission vs the previous RFQ. */
  flags: Flag[];
  /** Per-flag justification (note + acknowledged), keyed by flag.key. */
  reviews: FlagReviewMap;
}

export interface UseProgressionRecapParams {
  clientIds: string[];
  year: number | null;
  rfq: RFQ | null;
  allRfqs: { year: number; type: RFQType }[];
  partnerLabel: (partnerId: string) => string;
}

export interface UseProgressionRecapResult {
  /** One entry per in-scope client (keyed by clientId via the array). */
  rows: RecapRow[];
  loading: boolean;
  error: string | null;
}

export function useProgressionRecap({
  clientIds,
  year,
  rfq,
  allRfqs,
  partnerLabel,
}: UseProgressionRecapParams): UseProgressionRecapResult {
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The previous submission (same for every client) — null when none precedes.
  const prev = useMemo(
    () => (year && rfq ? previousRFQ(allRfqs, year, rfq.type) : null),
    [allRfqs, year, rfq?.type]
  );

  // Stable primitive dependency for the client set (arrays change identity).
  const clientKey = clientIds.join(",");

  useEffect(() => {
    if (!year || !rfq || clientIds.length === 0) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      clientIds.map(async (clientId): Promise<RecapRow> => {
        const [curEntry, prevEntry] = await Promise.all([
          fetchDataEntry(clientId, year, rfq.type),
          prev ? fetchDataEntry(clientId, prev.year, prev.rfq) : Promise.resolve(null),
        ]);
        const cur = curEntry as EntryWithAnnotations | null;

        const current = {
          media: axisOf(cur, "media"),
          labs: axisOf(cur, "labs"),
          revenue: axisOf(cur, "revenue"),
        };
        const previous = prev
          ? {
              media: axisOf(prevEntry, "media"),
              labs: axisOf(prevEntry, "labs"),
              revenue: axisOf(prevEntry, "revenue"),
            }
          : null;

        const flags = computeFlags({ current, previous, partnerLabel });
        const rawSteps = cur?.readyMonths;
        const confirmed = new Set(
          Array.isArray(rawSteps) ? rawSteps.filter((s): s is string => typeof s === "string") : []
        );
        const reviews = cur?.flagReviews ?? {};

        return { clientId, confirmed, flags, reviews };
      })
    )
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Progression recap fetch failed:", err);
        setError("Failed to load the progression recap.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, year, rfq?.type, prev?.year, prev?.rfq, partnerLabel]);

  return { rows, loading, error };
}
