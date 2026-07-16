// lib/hooks/use-mediabox-totals.ts

/**
 * Live MediaBox totals for a {client, year}, converted to CAD for display.
 *
 * Stale-while-revalidate with no polling: we subscribe to the totals doc and to
 * the year's USD→CAD rate. Whenever the doc is missing or older than 24h we
 * fire one background refresh; the MediaBox function writes the fresh doc and
 * the subscription delivers it. `refresh()` forces a recompute (the manual
 * button), bypassing the freshness check.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeToMediaboxTotals,
  triggerMediaboxRefresh,
  isMediaboxTotalsStale,
  mediaboxRefreshDeadlineMs,
  mediaboxTotalsToCad,
  type MediaboxTotalsCad,
} from "../services/mediabox-totals-service";
import {
  subscribeToCurrencyRates,
  getCurrencyRateForYear,
} from "../services/currency-service";
import type { CurrencyRate } from "../types/currency.types";
import type { MediaboxTotals } from "../types/mediabox.types";

export interface UseMediaboxTotalsResult {
  totals: MediaboxTotals | null;
  cad: MediaboxTotalsCad | null;
  /**
   * Server-side aggregation in flight (from the doc's own flag). Flags left
   * behind by a crashed function are ignored after a timeout — see
   * MEDIABOX_REFRESH_TIMEOUT_MS.
   */
  refreshing: boolean;
  /** A manual/background refresh trigger is in flight from this client. */
  triggering: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMediaboxTotals(
  clientId: string | undefined | null,
  year: number | null
): UseMediaboxTotalsResult {
  const [totals, setTotals] = useState<MediaboxTotals | null>(null);
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState<boolean>(!!clientId && year != null);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against re-firing the background refresh for the same doc state.
  const autoTriggeredRef = useRef(false);

  // Subscribe to the totals doc.
  useEffect(() => {
    if (!clientId || year == null) {
      setTotals(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    autoTriggeredRef.current = false;
    const unsub = subscribeToMediaboxTotals(
      clientId,
      year,
      (data) => {
        setTotals(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [clientId, year]);

  // Subscribe to USD→CAD rates (small, shared collection).
  useEffect(() => {
    const unsub = subscribeToCurrencyRates(setRates);
    return () => unsub();
  }, []);

  // A refresh "in flight" past its deadline is a crashed MediaBox function
  // that never cleared the doc's flag: treat it as not refreshing so the
  // button and the auto-refresh recover instead of waiting forever. `clock`
  // is the last time we looked at the wall clock — set at mount, refreshed by
  // the timer the moment a live refresh crosses its deadline. An NaN deadline
  // (no start stamp) compares false and is therefore stuck immediately.
  const [clock, setClock] = useState(() => Date.now());
  const deadline = totals?.refreshing ? mediaboxRefreshDeadlineMs(totals) : null;
  const refreshing = deadline != null && clock < deadline;
  useEffect(() => {
    if (!refreshing || deadline == null) return;
    const id = setTimeout(() => setClock(Date.now()), deadline - Date.now());
    return () => clearTimeout(id);
  }, [refreshing, deadline]);

  const doTrigger = useCallback(
    async (force: boolean) => {
      if (!clientId || year == null) return;
      setTriggering(true);
      setError(null);
      try {
        await triggerMediaboxRefresh(clientId, year, force);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Refresh failed.");
      } finally {
        setTriggering(false);
      }
    },
    [clientId, year]
  );

  // Auto-refresh once when the loaded doc is stale or missing.
  useEffect(() => {
    if (loading || !clientId || year == null) return;
    if (autoTriggeredRef.current) return;
    if (refreshing) return; // a live refresh is already running server-side
    if (isMediaboxTotalsStale(totals)) {
      autoTriggeredRef.current = true;
      void doTrigger(false);
    }
  }, [loading, totals, refreshing, clientId, year, doTrigger]);

  const refresh = useCallback(() => {
    autoTriggeredRef.current = true; // a manual refresh covers the auto one
    void doTrigger(true);
  }, [doTrigger]);

  const usdToCad = year != null ? getCurrencyRateForYear(rates, year) : undefined;
  const cad = totals ? mediaboxTotalsToCad(totals, usdToCad) : null;

  return {
    totals,
    cad,
    refreshing,
    triggering,
    loading,
    error,
    refresh,
  };
}
