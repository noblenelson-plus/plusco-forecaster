// lib/hooks/use-rfq-variance.ts
"use client";

/**
 * Loads, for every in-scope client, the compared lines of `rfq` vs the
 * previous RFQ (computeSwingLines — the swing flags' own comparison) for the
 * Milestones page's "RFQ total variance". Two data_entries reads per client,
 * only while `enabled`; re-run when the clients / year / RFQ change. Each
 * result is tagged with its request, so a stale answer is never shown.
 */

import { useEffect, useState } from "react";
import { fetchRFQs } from "../services/rfq-service";
import { fetchDataEntry } from "../services/data-entry-service";
import { computeSwingLines, type SwingLine } from "../flags/swing-rules";
import { previousRFQ, type AxisData, type AxisId, type DataEntry } from "../types/forecaster.types";
import type { RFQType } from "../types/rfq.types";

export interface UseRfqVarianceResult {
  /** clientId → compared lines. */
  linesByClient: Map<string, SwingLine[]>;
  /** The RFQ compared against; null when none precedes the checkpoint's. */
  previous: { year: number; rfq: RFQType } | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: UseRfqVarianceResult = {
  linesByClient: new Map(),
  previous: null,
  loading: false,
  error: null,
};

function axisOf(entry: DataEntry | null, axis: AxisId): AxisData {
  const raw = entry?.axes?.[axis];
  return {
    buckets: Array.isArray(raw?.buckets) ? raw.buckets : [],
    actuals: Array.isArray(raw?.actuals) ? raw.actuals : [],
  };
}

const axesOf = (entry: DataEntry | null) => ({
  media: axisOf(entry, "media"),
  labs: axisOf(entry, "labs"),
  revenue: axisOf(entry, "revenue"),
});

export function useRfqVariance({
  clientIds,
  year,
  rfq,
  enabled,
  refreshKey = 0,
}: {
  clientIds: string[];
  year: number | null;
  rfq: RFQType;
  enabled: boolean;
  refreshKey?: number;
}): UseRfqVarianceResult {
  const requestKey = `${clientIds.join(",")}|${year}|${rfq}|${refreshKey}`;
  const idle = !enabled || !year || clientIds.length === 0;
  const [result, setResult] = useState<(UseRfqVarianceResult & { key: string }) | null>(null);

  useEffect(() => {
    if (idle) return;
    let cancelled = false;
    (async () => {
      const prev = previousRFQ(await fetchRFQs(), year!, rfq);
      if (!prev) return { previous: null, entries: [] as [string, SwingLine[]][] };
      const entries = await Promise.all(
        clientIds.map(async (id) => {
          const [cur, before] = await Promise.all([
            fetchDataEntry(id, year!, rfq),
            fetchDataEntry(id, prev.year, prev.rfq),
          ]);
          const lines = computeSwingLines({
            current: axesOf(cur),
            previous: axesOf(before),
            partnerLabel: (p) => p,
          });
          return [id, lines] as [string, SwingLine[]];
        })
      );
      return { previous: prev, entries };
    })()
      .then(({ previous, entries }) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          linesByClient: new Map(entries),
          previous,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Milestones RFQ variance fetch failed:", err);
        setResult({ ...EMPTY, key: requestKey, error: "Failed to load the RFQ variance." });
      });
    return () => {
      cancelled = true;
    };
    // requestKey stands for clientIds / year / rfq / refreshKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, idle]);

  if (idle) return EMPTY;
  if (!result || result.key !== requestKey) return { ...EMPTY, loading: true };
  return result;
}
