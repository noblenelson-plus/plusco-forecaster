// lib/hooks/use-flags.ts

/**
 * Computes the live "Flags" for the selected submission and manages their
 * justifications.
 *
 * — Current side: the three axes' working copies, passed in from the page (all
 *   three grid engines are mounted regardless of the active tab), so flags
 *   recompute as the user edits.
 * — Reference side: the immediately-previous RFQ's submission (resolved by
 *   `previousRFQ`), fetched once per context as a single data_entries read.
 * — Reviews: subscribed in real time so a teammate's acknowledgement/note shows
 *   live; edits go through `saveFlagReview` (allowed even on a LOCKED RFQ).
 *
 * The rule logic itself lives in the pure lib/flags/flag-rules.ts.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { useForecastSelection } from "../stores/forecast-selection.store";
import {
  fetchDataEntry,
  saveFlagReview,
  subscribeToFlagReviews,
} from "../services/data-entry-service";
import { computeFlags } from "../flags/flag-rules";
import { previousRFQ, type AxisData, type AxisId } from "../types/forecaster.types";
import type { Flag, FlagReview, FlagReviewMap } from "../types/flag.types";
import type { RFQType } from "../types/rfq.types";

/** Coerce a raw stored axis into a usable AxisData (mirrors the service's normalizer). */
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

export interface UseFlagsParams {
  /** Current working copies of the three axes (live from the grid engines). */
  media: AxisData;
  labs: AxisData;
  revenue: AxisData;
  /** All RFQs across every year — used to resolve the previous submission. */
  allRfqs: { year: number; type: RFQType }[];
  /** Resolve a Labs partnerId to a display name. */
  partnerLabel: (partnerId: string) => string;
}

export interface UseFlagsResult {
  /** Is a full {client, year, rfq} selected? Otherwise there are no flags. */
  ready: boolean;
  /** Every flag currently raised, in axis order (revenue, media, labs). */
  flags: Flag[];
  /** Per-flag review keyed by flag.key (note + acknowledged); absent = unreviewed. */
  reviews: FlagReviewMap;
  /** Count of raised flags not yet acknowledged — drives the badge. */
  unacknowledgedCount: number;
  /** True until the previous submission has been fetched at least once. */
  loadingReference: boolean;
  /** Persist a flag's justification (note + acknowledged). */
  saveReview: (flagKey: string, review: { note: string; acknowledged: boolean }) => Promise<void>;
}

export function useFlags(params: UseFlagsParams): UseFlagsResult {
  const { media, labs, revenue, allRfqs, partnerLabel } = params;
  const { user } = useAuth();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;

  // The previous submission for the current context (null → no baseline).
  const prev = useMemo(() => {
    if (!selectedYear || !selectedRFQ) return null;
    return previousRFQ(allRfqs, selectedYear, selectedRFQ.type);
  }, [allRfqs, selectedYear, selectedRFQ?.type]);

  // ─── Reference side: fetch the previous submission's three axes ─────────────
  const [previousAxes, setPreviousAxes] =
    useState<Partial<Record<AxisId, AxisData>> | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);

  useEffect(() => {
    if (!selectedClient || !prev) {
      setPreviousAxes(null);
      setLoadingReference(false);
      return;
    }
    let cancelled = false;
    setLoadingReference(true);
    fetchDataEntry(selectedClient.cl_id, prev.year, prev.rfq)
      .then((entry) => {
        if (cancelled) return;
        setPreviousAxes({
          media: axisOf(entry, "media"),
          labs: axisOf(entry, "labs"),
          revenue: axisOf(entry, "revenue"),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Flags: previous submission fetch failed:", err);
        setPreviousAxes(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingReference(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClient?.cl_id, prev?.year, prev?.rfq]);

  // ─── Reviews: live subscription for the current submission ──────────────────
  const [reviews, setReviews] = useState<FlagReviewMap>({});
  useEffect(() => {
    if (!ready) {
      setReviews({});
      return;
    }
    const unsubscribe = subscribeToFlagReviews(
      selectedClient!.cl_id,
      selectedYear!,
      selectedRFQ!.type,
      setReviews
    );
    return () => unsubscribe();
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type]);

  // ─── Flags: pure computation over current + previous data ───────────────────
  const flags = useMemo(() => {
    if (!ready) return [];
    return computeFlags({
      current: { media, labs, revenue },
      previous: previousAxes,
      partnerLabel,
    });
  }, [ready, media, labs, revenue, previousAxes, partnerLabel]);

  const unacknowledgedCount = useMemo(
    () => flags.filter((f) => !reviews[f.key]?.acknowledged).length,
    [flags, reviews]
  );

  const saveReview = useCallback(
    async (flagKey: string, review: { note: string; acknowledged: boolean }) => {
      if (!selectedClient || !selectedYear || !selectedRFQ) return;
      await saveFlagReview(
        selectedClient.cl_id,
        selectedYear,
        selectedRFQ.type,
        flagKey,
        review,
        user?.uid
      );
    },
    [selectedClient?.cl_id, selectedYear, selectedRFQ?.type, user?.uid]
  );

  return {
    ready,
    flags,
    reviews,
    unacknowledgedCount,
    loadingReference,
    saveReview,
  };
}

export type { Flag, FlagReview };
