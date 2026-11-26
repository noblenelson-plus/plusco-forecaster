// lib/dashboard/data/use-investment-deals-mix.ts
"use client";

/**
 * Reads `investment_deals_mix` (MIR booked net by client × month × channel ×
 * partner × deal × vendor market / language, synced by
 * scripts/sync-investment-deals-mix.mjs) within the current dashboard tab's
 * scope: its agencies plus its clients one by one (useDashboardDocScope, same as
 * Local Media). Roll-ups happen in memory (lib/format/investment-deals.ts).
 *
 * One module-level cache per scope key, so switching between Media YOY, PCC
 * Deals and Broadcast doesn't refetch ~27k rows.
 */

import { useEffect, useMemo, useState } from "react";
import { useDashboardDocScope } from "../../hooks/use-agency-scope";
import { fetchDashboardRowDocs } from "./agency-scoped-query";
import type { InvestmentDealsRow } from "../../format/investment-deals";
import type { Client } from "../../types/client.types";

const COLLECTION = "investment_deals_mix";
const cache = new Map<string, Promise<InvestmentDealsRow[]>>();

export function useInvestmentDealsMix(): { rows: InvestmentDealsRow[]; loading: boolean; error: string | null } {
  // The result is tagged with the scope key it was loaded for; a different key = still loading.
  const [result, setResult] = useState<{ key: string; rows: InvestmentDealsRow[]; error: string | null } | null>(null);
  const { scope, clientIds, key, loading: scopeLoading } = useDashboardDocScope();

  useEffect(() => {
    if (scopeLoading) return;
    let cancelled = false;
    let p = cache.get(key);
    if (!p) {
      p = fetchDashboardRowDocs(COLLECTION, { scope, clientIds }).then((docs) =>
        docs.map((d) => d.data() as InvestmentDealsRow)
      );
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    p.then((rows) => {
      if (!cancelled) setResult({ key, rows, error: null });
    }).catch((e: unknown) => {
      if (!cancelled)
        setResult({ key, rows: [], error: e instanceof Error ? e.message : "Failed to load the MIR investments data." });
    });
    return () => {
      cancelled = true;
    };
    // `key` covers scope + clientIds (both memoized on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scopeLoading]);

  const ready = !scopeLoading && result?.key === key;
  return { rows: ready ? result.rows : [], loading: !ready, error: ready ? result.error : null };
}

/** Lowercased names of the scoped Forecaster clients (MIR rows key on the client name). */
export function useScopedClientNames(scopedClientIds: string[], clients: Client[]): ReadonlySet<string> {
  return useMemo(() => {
    const nameById = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
    const out = new Set<string>();
    for (const id of scopedClientIds) {
      const n = nameById.get(id);
      if (n) out.add(n.trim().toLowerCase());
    }
    return out;
  }, [scopedClientIds, clients]);
}
