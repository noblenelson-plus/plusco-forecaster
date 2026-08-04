// lib/dashboard/data/use-scope-flags.ts
"use client";

/**
 * Read-only aggregation of persisted forecast flags (swing + under-target)
 * across every client in the dashboard scope, for the globally-selected
 * Year + RFQ, narrowed to one axis. Flags live per client on the
 * `data_entries` doc, so this fans out one `fetchStoredFlags` read per client
 * (in parallel) and merges the results — mirroring `useScopeForecastData`.
 *
 * Lazy: it only reads while `enabled` is true (the drawer is open), and a
 * cancellation flag discards a stale batch when the scope/axis/context changes
 * mid-flight. This never writes — justification stays on the Flags page.
 */

import { useEffect, useState } from "react";
import { fetchStoredFlags } from "../../services/data-entry-service";
import type { StoredFlag } from "../../types/forecast-flags.types";
import type { AxisId } from "../../types/forecaster.types";
import type { RFQType } from "../../types/rfq.types";

export interface ClientFlags {
  clientId: string;
  clientName: string;
  flags: StoredFlag[];
}

export interface ScopeFlagsData {
  loading: boolean;
  error: string | null;
  /** Clients with at least one flag for the axis, sorted by name. */
  byClient: ClientFlags[];
  /** Total flags across all clients in scope. */
  total: number;
  /** How many of those still need a justification. */
  unjustified: number;
}

const EMPTY: ScopeFlagsData = {
  loading: false,
  error: null,
  byClient: [],
  total: 0,
  unjustified: 0,
};

/** Unjustified first, then largest absolute drift first. */
function sortFlags(a: StoredFlag, b: StoredFlag): number {
  if (a.justified !== b.justified) return a.justified ? 1 : -1;
  return Math.abs(b.delta) - Math.abs(a.delta);
}

export function useScopeFlags(
  clientIds: string[],
  year: number | null,
  rfq: RFQType | null,
  axis: AxisId,
  clientNameById: Record<string, string>,
  enabled: boolean
): ScopeFlagsData {
  const [data, setData] = useState<ScopeFlagsData>(EMPTY);

  // A stable key so the effect re-runs only when the scope actually changes.
  const clientKey = clientIds.join(",");

  useEffect(() => {
    let cancelled = false;

    // All state updates live inside this async callback (never synchronously in
    // the effect body), matching useScopeForecastData and the lint rule.
    (async () => {
      if (!enabled || year === null || rfq === null || clientIds.length === 0) {
        if (!cancelled) setData(EMPTY);
        return;
      }

      setData({ ...EMPTY, loading: true });
      try {
        const maps = await Promise.all(
          clientIds.map((id) => fetchStoredFlags(id, year, rfq))
        );
        if (cancelled) return;

        const byClient: ClientFlags[] = [];
        let total = 0;
        let unjustified = 0;

        clientIds.forEach((clientId, i) => {
          const flags = Object.values(maps[i])
            .filter((f) => f.axis === axis)
            .sort(sortFlags);
          if (flags.length === 0) return;
          total += flags.length;
          unjustified += flags.filter((f) => !f.justified).length;
          byClient.push({
            clientId,
            clientName: clientNameById[clientId] ?? clientId,
            flags,
          });
        });

        byClient.sort((a, b) => a.clientName.localeCompare(b.clientName));
        setData({ loading: false, error: null, byClient, total, unjustified });
      } catch (err) {
        if (cancelled) return;
        setData({
          ...EMPTY,
          error: err instanceof Error ? err.message : "Failed to load flags.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // clientNameById is intentionally omitted — names are display-only and
    // resolved at render from the latest map; the fetch keys on scope/axis/context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, year, rfq, axis, clientKey]);

  return data;
}
