-// filepath: lib/dashboard/data/use-mo-kpi-by-client.ts
"use client";

/**
 * Investment KPIs data module — reads the `mo_kpi_by_client` collection (synced
 * read-only from BigQuery's KPI_BY_CLIENT_2025_vs_2026 by scripts/sync-kpi-by-client.mjs)
 * and turns it into the portfolio scorecards on the MediaOcean → Investment KPIs page.
 *
 * Design (the 2.0 discipline): the app does NOT recompute business logic. Every
 * intricate rule (meta targets, Billups eligibility, MIQ carve-outs) already ran
 * in BigQuery and is baked into the per-client rows. Here we only:
 *   1) fetch the ~163 client rows,
 *   2) filter them by the client-level dimensions, and
 *   3) roll them up — summing raw dollar columns, then dividing — so every
 *      portfolio percentage is sum(numerator)/sum(denominator), never an average
 *      of per-client percentages.
 *
 * This module exports small, reusable pieces (fetch hook + pure filter/compute
 * helpers) so the visual component stays thin.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

const COLLECTION = "mo_kpi_by_client";

// ─── Row shape ──────────────────────────────────────────────────────────────
// Only the fields the scorecards + table + pie use are typed; the index
// signature keeps every other synced column available without fuss.
export interface KpiByClientRow {
  PLUSCO_CLIENT_ID: string;
  CLIENT_NAME: string;
  AGENCY: string;
  BU_REGION: string;
  BUSINESS_LEAD: string;
  GM_POD: string;
  meta_share_trend: string | null;

  // Achieve Labs Targets
  labs_spend_2026: number;
  total_spend_2026: number;
  prog_labs_spend_2026: number;
  ooh_spend_2026: number;
  billups_ooh_spend_2026: number;
  print_spend_2026: number;
  billups_print_spend_2026: number;

  // Meta Divestment
  meta_spend_2026: number;
  meta_spend_2025: number;
  social_spend_2026: number;
  social_spend_2025: number;
  social_forecast_rfq1: number;
  target_meta_spend_2026: number;
  other_platforms_spend_2026: number;
  other_platforms_spend_2025: number;
  miq_social_spend_2026: number;
  miq_social_forecast_2026: number;

  // Grow Programmatic / Decrease Digital Direct
  digital_spend_2026: number;
  digital_spend_2025: number;
  prog_spend_2026: number;
  prog_spend_2025: number;
  prog_deal_spend_2026: number;
  prog_nondeal_spend_2026: number;
  digital_direct_spend_2026: number;
  digital_direct_spend_2025: number;
  dd_deal_spend_2026: number;
  dd_nondeal_spend_2026: number;

  // Any other synced columns (eligibility flags, scenario, etc.)
  [key: string]: unknown;
}

// ─── Fetch hook ───────────────────────────────────────────────────────────────

export interface MoKpiByClientResult {
  rows: KpiByClientRow[];
  loading: boolean;
  error: string | null;
}

/**
 * One-shot read of the whole `mo_kpi_by_client` collection (~163 docs). Small
 * enough to load in full and filter/roll-up in memory, which is what keeps the
 * dashboard filters instant.
 */
export function useMoKpiByClient(): MoKpiByClientResult {
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
        const out = snap.docs.map((d) => ({
          PLUSCO_CLIENT_ID: d.id,
          ...(d.data() as Record<string, unknown>),
        })) as KpiByClientRow[];
        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load Investment KPIs data."
          );
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

// ─── Filters ────────────────────────────────────────────────────────────────

export interface KpiFilters {
  agency: string[];
  buRegion: string[];
  businessLead: string[];
  gmPod: string[];
  client: string[];
}

export const EMPTY_KPI_FILTERS: KpiFilters = {
  agency: [],
  buRegion: [],
  businessLead: [],
  gmPod: [],
  client: [],
};

export type KpiFilterOptions = KpiFilters;

/** Distinct, sorted, non-empty option lists for each filter, read from the data. */
export function kpiFilterOptions(rows: KpiByClientRow[]): KpiFilterOptions {
  const uniq = (values: (string | null | undefined)[]): string[] => {
    const set = new Set<string>();
    for (const v of values) {
      const s = (v ?? "").toString().trim();
      if (s !== "") set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  return {
    agency: uniq(rows.map((r) => r.AGENCY)),
    buRegion: uniq(rows.map((r) => r.BU_REGION)),
    businessLead: uniq(rows.map((r) => r.BUSINESS_LEAD)),
    gmPod: uniq(rows.map((r) => r.GM_POD)),
    client: uniq(rows.map((r) => r.CLIENT_NAME)),
  };
}

/** Rows kept when they match every active filter (an empty list = no filter). */
export function applyKpiFilters(
  rows: KpiByClientRow[],
  f: KpiFilters
): KpiByClientRow[] {
  const match = (selected: string[], value: string | null | undefined): boolean =>
    selected.length === 0 || selected.includes((value ?? "").toString().trim());

  return rows.filter(
    (r) =>
      match(f.agency, r.AGENCY) &&
      match(f.buRegion, r.BU_REGION) &&
      match(f.businessLead, r.BUSINESS_LEAD) &&
      match(f.gmPod, r.GM_POD) &&
      match(f.client, r.CLIENT_NAME)
  );
}

// ─── Roll-up compute ──────────────────────────────────────────────────────────

/** Coerce any synced value to a finite number (missing/null/NaN → 0). */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Ratio that returns null when the denominator is zero (renders as "—"). */
function safeDiv(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

/** Point difference of two shares; null unless both shares are defined. */
function pptDiff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

export interface ShareStat {
  /** 0..1 ratio, or null when undefined (zero denominator). */
  value: number | null;
  /** Year-over-year change in points (2026 share − 2025 share), or null. */
  yoyPpt: number | null;
}

export interface InvestmentKpis {
  clientCount: number;

  labs: {
    labsShareOfTotalMedia: number | null;
    progLabsShareOfProg: number | null;
    billupsShareOfOoh: number | null;
    billupsShareOfPrint: number | null;
  };

  meta: {
    metaShareOfSocial: ShareStat;
    targetMetaShareOfSocial: number | null;
    otherPlatformsShare: ShareStat;
    metaSpend2026: number;
    targetMetaSpend2026: number;
    pctOfTarget: number | null;
    miqSocialSpend2026: number;
    miqSocialForecast2026: number;
  };

  programmatic: {
    shareOfDigital: ShareStat;
    dealSpend: number;
    dealPct: number | null;
    nonDealSpend: number;
    nonDealPct: number | null;
  };

  digitalDirect: {
    shareOfDigital: ShareStat;
    dealSpend: number;
    dealPct: number | null;
    nonDealSpend: number;
    nonDealPct: number | null;
  };
}

/**
 * Roll the given (already-filtered) rows up to the portfolio scorecards. Every
 * percentage is computed as sum(numerator)/sum(denominator) across the rows.
 */
export function computeInvestmentKpis(rows: KpiByClientRow[]): InvestmentKpis {
  const sum = (key: keyof KpiByClientRow | string): number =>
    rows.reduce((acc, r) => acc + num(r[key as string]), 0);

  // Achieve Labs Targets
  const labs2026 = sum("labs_spend_2026");
  const total2026 = sum("total_spend_2026");
  const progLabs2026 = sum("prog_labs_spend_2026");
  const ooh2026 = sum("ooh_spend_2026");
  const billupsOoh2026 = sum("billups_ooh_spend_2026");
  const print2026 = sum("print_spend_2026");
  const billupsPrint2026 = sum("billups_print_spend_2026");

  // Meta Divestment
  const metaSpend2026 = sum("meta_spend_2026");
  const metaSpend2025 = sum("meta_spend_2025");
  const social2026 = sum("social_spend_2026");
  const social2025 = sum("social_spend_2025");
  const socialForecast = sum("social_forecast_rfq1");
  const targetMetaSpend2026 = sum("target_meta_spend_2026");
  const otherPlatforms2026 = sum("other_platforms_spend_2026");
  const otherPlatforms2025 = sum("other_platforms_spend_2025");
  const miqSocialSpend2026 = sum("miq_social_spend_2026");
  const miqSocialForecast2026 = sum("miq_social_forecast_2026");

  const metaShare2026 = safeDiv(metaSpend2026, social2026);
  const metaShare2025 = safeDiv(metaSpend2025, social2025);
  const otherShare2026 = safeDiv(otherPlatforms2026, social2026);
  const otherShare2025 = safeDiv(otherPlatforms2025, social2025);

  // Grow Programmatic
  const digital2026 = sum("digital_spend_2026");
  const digital2025 = sum("digital_spend_2025");
  const prog2026 = sum("prog_spend_2026");
  const prog2025 = sum("prog_spend_2025");
  const progDeal = sum("prog_deal_spend_2026");
  const progNonDeal = sum("prog_nondeal_spend_2026");

  const progShare2026 = safeDiv(prog2026, digital2026);
  const progShare2025 = safeDiv(prog2025, digital2025);

  // Decrease Digital Direct
  const dd2026 = sum("digital_direct_spend_2026");
  const dd2025 = sum("digital_direct_spend_2025");
  const ddDeal = sum("dd_deal_spend_2026");
  const ddNonDeal = sum("dd_nondeal_spend_2026");

  const ddShare2026 = safeDiv(dd2026, digital2026);
  const ddShare2025 = safeDiv(dd2025, digital2025);

  return {
    clientCount: rows.length,

    labs: {
      labsShareOfTotalMedia: safeDiv(labs2026, total2026),
      progLabsShareOfProg: safeDiv(progLabs2026, prog2026),
      billupsShareOfOoh: safeDiv(billupsOoh2026, ooh2026),
      billupsShareOfPrint: safeDiv(billupsPrint2026, print2026),
    },

    meta: {
      metaShareOfSocial: {
        value: metaShare2026,
        yoyPpt: pptDiff(metaShare2026, metaShare2025),
      },
      targetMetaShareOfSocial: safeDiv(targetMetaSpend2026, socialForecast),
      otherPlatformsShare: {
        value: otherShare2026,
        yoyPpt: pptDiff(otherShare2026, otherShare2025),
      },
      metaSpend2026,
      targetMetaSpend2026,
      pctOfTarget: safeDiv(metaSpend2026, targetMetaSpend2026),
      miqSocialSpend2026,
      miqSocialForecast2026,
    },

    programmatic: {
      shareOfDigital: {
        value: progShare2026,
        yoyPpt: pptDiff(progShare2026, progShare2025),
      },
      dealSpend: progDeal,
      dealPct: safeDiv(progDeal, prog2026),
      nonDealSpend: progNonDeal,
      nonDealPct: safeDiv(progNonDeal, prog2026),
    },

    digitalDirect: {
      shareOfDigital: {
        value: ddShare2026,
        yoyPpt: pptDiff(ddShare2026, ddShare2025),
      },
      dealSpend: ddDeal,
      dealPct: safeDiv(ddDeal, dd2026),
      nonDealSpend: ddNonDeal,
      nonDealPct: safeDiv(ddNonDeal, dd2026),
    },
  };
}

/** Client counts by Meta Share Trend — feeds the "% of Clients" pie. */
export function metaShareTrendBreakdown(
  rows: KpiByClientRow[]
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = (r.meta_share_trend ?? "").toString().trim();
    if (label === "") continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}