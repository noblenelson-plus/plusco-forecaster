// lib/hooks/use-flag-history.ts
"use client";

/**
 * Loads the flag history (flag_history snapshots) of every in-scope client for
 * a year, plus the year's USD→CAD rate. The Milestones page reads one
 * checkpoint's snapshot for Sections 2–3 and the earlier ones for "previous
 * justification". One query per client, re-run only when the clients / year
 * change (switching checkpoint needs no reload). Each result is tagged with
 * the request it answers, so `loading` is derived and a stale answer is never
 * shown.
 */

import { useEffect, useState } from "react";
import { fetchFlagSnapshots, type FlagSnapshot } from "../services/flag-history-service";
import { fetchCurrencyRateForYear } from "../services/currency-service";

export interface UseFlagHistoryResult {
  /** clientId → stepId → snapshot (absent = never validated). */
  snapshotsByClient: Map<string, Record<string, FlagSnapshot>>;
  /** USD→CAD for the year; undefined when no rate is set. */
  usdToCad: number | undefined;
  loading: boolean;
  error: string | null;
}

const EMPTY: UseFlagHistoryResult = {
  snapshotsByClient: new Map(),
  usdToCad: undefined,
  loading: false,
  error: null,
};

export function useFlagHistory({
  clientIds,
  year,
  refreshKey = 0,
}: {
  clientIds: string[];
  year: number | null;
  refreshKey?: number;
}): UseFlagHistoryResult {
  const requestKey = `${clientIds.join(",")}|${year}|${refreshKey}`;
  const idle = !year || clientIds.length === 0;
  const [result, setResult] = useState<(UseFlagHistoryResult & { key: string }) | null>(null);

  useEffect(() => {
    if (idle) return;
    let cancelled = false;
    Promise.all([
      fetchCurrencyRateForYear(year!).catch(() => undefined),
      Promise.all(clientIds.map(async (id) => [id, await fetchFlagSnapshots(id, year!)] as const)),
    ])
      .then(([usdToCad, entries]) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          snapshotsByClient: new Map(entries.filter(([, s]) => Object.keys(s).length > 0)),
          usdToCad,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Milestones flag history fetch failed:", err);
        setResult({ ...EMPTY, key: requestKey, error: "Failed to load the flags." });
      });
    return () => {
      cancelled = true;
    };
    // requestKey stands for clientIds / year / refreshKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, idle]);

  if (idle) return EMPTY;
  if (!result || result.key !== requestKey) return { ...EMPTY, loading: true };
  return result;
}
