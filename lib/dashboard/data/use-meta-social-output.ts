// filepath: lib/dashboard/data/use-meta-social-output.ts
"use client";

/**
 * Meta data module — reads the `meta_social_output` collection (synced read-only
 * from BigQuery's META_SOCIAL_OUTPUT_2025_vs_2026 by scripts/sync-meta-social-output.mjs,
 * aggregated there to one doc per client). This is the TRUE source of the Looker
 * Meta page, so the Meta tab reads it instead of mo_kpi_by_client.
 *
 * The two BigQuery tables name their columns differently, so mapRow() aliases the
 * meta_social_output names onto the KpiByClientRow shape the Meta components already
 * consume (meta_2026 -> meta_spend_2026, PLUSCO_CLIENT_NAME -> CLIENT_NAME, etc.).
 * The three flag columns and the pre-computed annual ratios pass straight through
 * via the row's index signature. Labs/digital/prog fields don't exist in this
 * table and are zero-filled — the Meta components never read them.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import type { KpiByClientRow } from "./use-mo-kpi-by-client";

const COLLECTION = "meta_social_output";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Map one synced meta_social_output doc onto the KpiByClientRow shape. */
function mapRow(id: string, raw: Record<string, unknown>): KpiByClientRow {
  return {
    // Pass through flags, pre-computed annual ratios, and any other columns.
    ...raw,

    // Dimensions
    PLUSCO_CLIENT_ID: id,
    CLIENT_NAME: str(raw.PLUSCO_CLIENT_NAME),
    AGENCY: str(raw.AGENCY),
    BU_REGION: str(raw.BU_REGION),
    BUSINESS_LEAD: str(raw.BUSINESS_LEAD),
    GM_POD: str(raw.GM_POD),
    meta_share_trend: (raw.meta_share_trend as string | null) ?? null,

    // Meta divestment (aliased from META_SOCIAL_OUTPUT column names)
    meta_spend_2026: num(raw.meta_2026),
    meta_spend_2025: num(raw.meta_2025),
    social_spend_2026: num(raw.social_2026),
    social_spend_2025: num(raw.social_2025),
    social_forecast_rfq1: num(raw.social_forecast_rfq1),
    target_meta_spend_2026: num(raw.target_meta_spend_2026),
    other_platforms_spend_2026: num(raw.other_platforms_spend_2026),
    other_platforms_spend_2025: num(raw.other_platforms_spend_2025),
    miq_social_spend_2026: num(raw.miq_social_mir_2026),
    miq_social_forecast_2026: num(raw.miq_social_forecast_rfq1),

    // Not present in the Meta table; zero-filled (Meta components never read these).
    labs_spend_2026: 0,
    total_spend_2026: 0,
    prog_labs_spend_2026: 0,
    ooh_spend_2026: 0,
    billups_ooh_spend_2026: 0,
    print_spend_2026: 0,
    billups_print_spend_2026: 0,
    digital_spend_2026: 0,
    digital_spend_2025: 0,
    prog_spend_2026: 0,
    prog_spend_2025: 0,
    prog_deal_spend_2026: 0,
    prog_nondeal_spend_2026: 0,
    digital_direct_spend_2026: 0,
    digital_direct_spend_2025: 0,
    dd_deal_spend_2026: 0,
    dd_nondeal_spend_2026: 0,
  } as KpiByClientRow;
}

export interface MetaSocialOutputResult {
  rows: KpiByClientRow[];
  loading: boolean;
  error: string | null;
}

/** One-shot read of the whole `meta_social_output` collection (~164 client docs). */
export function useMetaSocialOutput(): MetaSocialOutputResult {
  const [rows, setRows] = useState<KpiByClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(collection(db, COLLECTION));
        if (cancelled) return;
        const out = snap.docs.map((d) =>
          mapRow(d.id, d.data() as Record<string, unknown>)
        );
        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load Meta data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error };
}
