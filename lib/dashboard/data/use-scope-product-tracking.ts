// lib/dashboard/data/use-scope-product-tracking.ts

/**
 * Fetches the product tracking docs for the whole dashboard scope (every
 * filtered client) and flattens them into one row per (client × product)
 * entry. One Firestore read per client, run in parallel.
 *
 * Unlike the forecast data there is no Year/RFQ/month dimension — product
 * tracking is always-on per client — so the fetch only depends on the client
 * scope. A stale request (filters changed mid-flight) is discarded via a
 * cancellation flag, mirroring use-scope-forecast-data.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchProductTracking } from "../../services/product-tracking-service";
import type { ProductStatus } from "../../types/product.types";

/** One tracked (client × product) entry, flattened for aggregation. */
export interface ClientProductEntry {
  clientId: string;
  productId: string;
  /** Absent = the product only carries a note (no pipeline status picked). */
  status?: ProductStatus;
  /** Expected month revenue starts, "YYYY-MM". */
  timing?: string;
  note?: string;
}

export interface ScopeProductData {
  loading: boolean;
  error: string | null;
  /** Clients in scope. */
  clientCount: number;
  /** Clients with at least one tracked product. */
  clientsTracking: number;
  /** Every tracked entry across the scope (untracked products have no row). */
  entries: ClientProductEntry[];
}

export function useScopeProductTracking(clientIds: string[]): ScopeProductData {
  const [raw, setRaw] = useState<ClientProductEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency key — array identity changes every render otherwise.
  const clientKey = clientIds.join(",");

  useEffect(() => {
    if (clientKey === "") return;
    const ids = clientKey.split(",");

    let cancelled = false;
    // All state updates live inside this async callback (never synchronously in
    // the effect body) so they don't trigger cascading renders.
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const docs = await Promise.all(ids.map(fetchProductTracking));
        if (cancelled) return;

        const next: ClientProductEntry[] = [];
        docs.forEach((docData, i) => {
          const products = docData?.products;
          if (!products) return;
          for (const [productId, entry] of Object.entries(products)) {
            if (!entry) continue;
            next.push({
              clientId: ids[i],
              productId,
              ...(entry.status ? { status: entry.status } : {}),
              ...(entry.timing ? { timing: entry.timing } : {}),
              ...(entry.note ? { note: entry.note } : {}),
            });
          }
        });
        setRaw(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load product tracking."
          );
          setRaw([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientKey]);

  return useMemo(() => {
    // An empty scope collapses to empty data without writing state from an
    // effect (`raw` may hold stale rows from the previous scope).
    const entries = clientKey === "" ? [] : raw;
    return {
      loading,
      error,
      clientCount: clientKey === "" ? 0 : clientKey.split(",").length,
      clientsTracking: new Set(entries.map((e) => e.clientId)).size,
      entries,
    };
  }, [raw, loading, error, clientKey]);
}
