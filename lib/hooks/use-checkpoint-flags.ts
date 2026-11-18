// lib/hooks/use-checkpoint-flags.ts
"use client";

/**
 * Loads, for every in-scope client, the CURRENT stored flags of one submission
 * ({year, rfq} — the Milestones checkpoint's target RFQ), plus the year's
 * USD→CAD rate so the page can total USD clients in CAD. One-shot reads (like
 * the recap). Each result is tagged with the request it answers, so `loading`
 * is derived (result for an older request = still loading) and a stale answer
 * is never shown.
 */

import { useEffect, useState } from "react";
import { fetchStoredFlags } from "../services/data-entry-service";
import { fetchCurrencyRateForYear } from "../services/currency-service";
import type { StoredFlag } from "../types/forecast-flags.types";
import type { RFQType } from "../types/rfq.types";

export interface UseCheckpointFlagsResult {
  /** clientId → that submission's flags (absent = none / no submission). */
  flagsByClient: Map<string, StoredFlag[]>;
  /** USD→CAD for the year; undefined when no rate is set. */
  usdToCad: number | undefined;
  loading: boolean;
  error: string | null;
}

const EMPTY: UseCheckpointFlagsResult = {
  flagsByClient: new Map(),
  usdToCad: undefined,
  loading: false,
  error: null,
};

export function useCheckpointFlags({
  clientIds,
  year,
  rfq,
  refreshKey = 0,
}: {
  clientIds: string[];
  year: number | null;
  rfq: RFQType;
  refreshKey?: number;
}): UseCheckpointFlagsResult {
  const clientKey = clientIds.join(",");
  const requestKey = `${clientKey}|${year}|${rfq}|${refreshKey}`;
  const idle = !year || clientIds.length === 0;
  const [result, setResult] = useState<(UseCheckpointFlagsResult & { key: string }) | null>(null);

  useEffect(() => {
    if (idle) return;
    let cancelled = false;
    Promise.all([
      fetchCurrencyRateForYear(year!).catch(() => undefined),
      Promise.all(
        clientIds.map(async (id) => [id, Object.values(await fetchStoredFlags(id, year!, rfq))] as const)
      ),
    ])
      .then(([usdToCad, entries]) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          flagsByClient: new Map(entries.filter(([, f]) => f.length > 0)),
          usdToCad,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Milestones flags fetch failed:", err);
        setResult({ ...EMPTY, key: requestKey, error: "Failed to load the flags." });
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
