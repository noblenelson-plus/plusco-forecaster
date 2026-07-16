// lib/dashboard/data/use-scope-mediabox-totals.ts

/**
 * Fetches the MediaBox totals docs for every client in the dashboard scope
 * (one parallel `getDoc` per client, mirroring `useScopeForecastData`) and
 * reduces them to per-client CAD totals for the MediaBox-coverage card.
 *
 * The docs are written nightly for every client by the MediaBox project's
 * scheduled full refresh, so an absent doc means "never synced" (the
 * collection predates the nightly job) and zero totals with no mapped
 * MediaBox ids mean "this client does not use MediaBox".
 *
 * Currency follows the dashboard convention: amounts are stored per buy
 * currency and normalized to CAD at read time with the year's USD→CAD rate.
 * Month restriction is a pure recompute — changing it never refetches.
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchMediaboxTotals,
  mediaboxCadTotalForMonths,
} from "../../services/mediabox-totals-service";
import type { MediaboxTotals } from "../../types/mediabox.types";
import type { DashboardScope } from "../widgets/widget.types";

export interface ScopeMediaboxClient {
  clientId: string;
  /** A totals doc exists for this client/year (synced at least once). */
  synced: boolean;
  /** At least one MediaBox client id is mapped (CL_MediaBox_IDs). */
  mapped: boolean;
  /** MediaBox media spend in CAD for the selected months. */
  total: number;
}

export interface ScopeMediaboxData {
  loading: boolean;
  error: string | null;
  /** One entry per in-scope client (absent docs included, with zeros). */
  byClient: Record<string, ScopeMediaboxClient>;
  /** Scope-wide MediaBox media spend in CAD for the selected months. */
  total: number;
  /** True when a doc holds USD spend but no USD→CAD rate is configured. */
  missingRate: boolean;
  /** Most recent sync across the fetched docs (ISO), for the card footnote. */
  syncedAt: string | null;
}

export function useScopeMediaboxTotals(
  scope: DashboardScope,
  /** USD→CAD rate for the selected year; undefined when none is configured. */
  usdToCad?: number,
  /** Months (1..12) to restrict totals to. Empty/undefined = all 12. */
  months?: number[]
): ScopeMediaboxData {
  const { clientIds, year } = scope;
  const disabled = year === null || clientIds.length === 0;

  const [docs, setDocs] = useState<Record<string, MediaboxTotals | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency key — array identity changes every render otherwise.
  const clientKey = clientIds.join(",");

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          clientIds.map((id) => fetchMediaboxTotals(id, year!))
        );
        if (cancelled) return;
        setDocs(
          Object.fromEntries(clientIds.map((id, i) => [id, results[i]]))
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load MediaBox data."
          );
          setDocs({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey, year, disabled]);

  // Stable month-filter key — the caller's array identity changes per render.
  const monthsKey =
    months && months.length > 0 && months.length < 12
      ? [...months].sort((a, b) => a - b).join(",")
      : "";

  return useMemo(() => {
    const monthSet = monthsKey
      ? new Set(monthsKey.split(",").map(Number))
      : null;
    const byClient: Record<string, ScopeMediaboxClient> = {};
    let total = 0;
    let missingRate = false;
    let syncedAt: string | null = null;

    if (!disabled) {
      for (const [clientId, doc] of Object.entries(docs)) {
        const clientTotal = doc
          ? mediaboxCadTotalForMonths(doc.byMonth, usdToCad, monthSet)
          : 0;
        if (doc && !usdToCad && (doc.mediaSpend?.USD ?? 0) !== 0) {
          missingRate = true;
        }
        if (doc?.syncedAt && (!syncedAt || doc.syncedAt > syncedAt)) {
          syncedAt = doc.syncedAt;
        }
        byClient[clientId] = {
          clientId,
          synced: doc !== null,
          mapped: (doc?.mediaboxClientIds?.length ?? 0) > 0,
          total: clientTotal,
        };
        total += clientTotal;
      }
    }

    return {
      loading: disabled ? false : loading,
      error: disabled ? null : error,
      byClient,
      total,
      missingRate,
      syncedAt,
    };
  }, [disabled, docs, usdToCad, monthsKey, loading, error]);
}
