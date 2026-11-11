// lib/dashboard/data/use-local-media-mix.ts
"use client";

/**
 * Reads `local_media_mix` (MIR booked net by channel × local-media tag, synced
 * by scripts/sync-local-media-mix.mjs) within the current dashboard tab's
 * scope: its agencies plus its clients one by one (useDashboardDocScope, same
 * as the Media Investments mix). Filtering and roll-ups happen in memory
 * (lib/format/local-media.ts).
 */

import { useEffect, useState } from "react";
import { useDashboardDocScope } from "../../hooks/use-agency-scope";
import { fetchDashboardRowDocs } from "./agency-scoped-query";
import type { LocalMediaRow } from "../../format/local-media";

export function useLocalMediaMix(): { rows: LocalMediaRow[]; loading: boolean; error: string | null } {
  const [rows, setRows] = useState<LocalMediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { scope, clientIds, key, loading: scopeLoading } = useDashboardDocScope();

  useEffect(() => {
    if (scopeLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const docs = await fetchDashboardRowDocs("local_media_mix", { scope, clientIds });
        if (!cancelled) setRows(docs.map((d) => d.data() as LocalMediaRow));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load Local Media data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` covers scope + clientIds (both memoized on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scopeLoading]);

  return { rows, loading: loading || scopeLoading, error };
}
