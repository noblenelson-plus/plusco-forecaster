// lib/dashboard/data/use-mediabox-planner-mix.ts
"use client";

/**
 * MediaBox Planner data module — reads the `mediabox_planner_mix` collection
 * (MediaBox planned budgets, synced from BigQuery's finance_master_mapping by
 * scripts/sync-mediabox-planner.mjs) and the `dashboard_meta/mediabox_planner`
 * stamp (sync time + the Bank of Canada rates used).
 *
 * Rows are already summed in the sync to year × month × agency × client ×
 * channel × partner × deal × campaign status, with the planned budget in CAD
 * (PLANNED_CAD) and USD (PLANNED_USD). The tab reuses the Media Investments
 * roll-ups (computeTotalMediaInvestment / computeTopPartners /
 * computeSocialSummary) by reshaping these rows into their row types — same
 * sums, same digital / deal definitions.
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useDashboardDocScope } from "../../hooks/use-agency-scope";
import { fetchDashboardRowDocs } from "./agency-scoped-query";
import type { MediaInvestmentRow } from "./use-mediaocean-investment-mix";
import type { SocialPartnerRow } from "./use-social-partner-mix";

const COLLECTION = "mediabox_planner_mix";
const META_PATH = ["dashboard_meta", "mediabox_planner"] as const;

export type PlannerCurrency = "CAD" | "USD";

export interface PlannerRow {
  id: string;
  PLUSCO_YEAR: string;
  /** "YYYY-MM". */
  MONTH: string;
  /** "YYYY-MM-01". */
  MONTH_DATE: string | null;
  AGENCY: string;
  PLUSCO_CLIENT_ID: string | null;
  PLUSCO_CLIENT_NAME: string;
  PLUSCO_MEDIA_CHANNEL: string;
  PLUSCO_MEDIA_PARTNER: string;
  PLUSCO_2026_DEALS: string | null;
  CMP_STATUS: string;
  PLANNED_CAD: number;
  PLANNED_USD: number;
  /** MediaBox fees by bucket (MediaBox v2 only; 0 where the plan is from v1). */
  COMMISSION_CAD?: number;
  COMMISSION_USD?: number;
  TAXES_CAD?: number;
  TAXES_USD?: number;
  OTHER_FEES_CAD?: number;
  OTHER_FEES_USD?: number;
  /** The part of PLANNED_* from MediaBox v1, which has no fee data. */
  NO_FEE_DATA_CAD?: number;
  NO_FEE_DATA_USD?: number;
  [key: string]: unknown;
}

/** A summed amount of a planner row. Client Cost is derived (amountOf). */
export type PlannerMetric = "PLANNED" | "COMMISSION" | "TAXES" | "OTHER_FEES" | "NO_FEE_DATA";

/** One currency's rate to CAD for one year, as the sync recorded it. */
export interface PlannerFxRate {
  rate: number;
  basis: string;
}

export interface PlannerMeta {
  synced_at: string | null;
  /** { [year]: { [currency]: rate } } — CAD is 1. */
  fx: Record<string, Record<string, PlannerFxRate>>;
}

export interface PlannerResult {
  rows: PlannerRow[];
  meta: PlannerMeta | null;
  loading: boolean;
  error: string | null;
}

/**
 * One-shot read of `mediabox_planner_mix` (~17k docs) within the tab's scope —
 * its agencies, plus its clients one by one while MediaBox allocations apply
 * (useDashboardDocScope) — and of the meta stamp. Filter / roll-up in memory.
 */
export function useMediaboxPlannerMix(): PlannerResult {
  const [rows, setRows] = useState<PlannerRow[]>([]);
  const [meta, setMeta] = useState<PlannerMeta | null>(null);
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
        const [docs, metaSnap] = await Promise.all([
          fetchDashboardRowDocs(COLLECTION, { scope, clientIds }),
          getDoc(doc(db, ...META_PATH)).catch(() => null),
        ]);
        if (cancelled) return;
        setRows(docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as PlannerRow[]);
        const m = metaSnap?.exists() ? (metaSnap.data() as Partial<PlannerMeta>) : null;
        setMeta(m ? { synced_at: m.synced_at ?? null, fx: m.fx ?? {} } : null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load MediaBox Planner data.");
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

  return { rows, meta, loading: loading || scopeLoading, error };
}

/**
 * "Oct 19, 2026" — when the MediaBox Planner sync last ran (null until read,
 * or when it never ran). For the period bar's "as of" stamp.
 */
export function useMediaboxPlannerSyncedAt(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...META_PATH))
      .then((snap) => {
        const at = snap.exists() ? (snap.data().synced_at as string | undefined) : undefined;
        if (!cancelled && at) {
          setLabel(new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return label;
}

/** One summed amount of a row in the chosen currency (missing = 0). */
export function amountOf(r: PlannerRow, metric: PlannerMetric, currency: PlannerCurrency): number {
  const v = r[`${metric}_${currency}`];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** The planned amount (Planned Net) in the chosen currency. */
export function plannedAmount(r: PlannerRow, currency: PlannerCurrency): number {
  return amountOf(r, "PLANNED", currency);
}

/** Client Cost totals over some rows (Client Cost = Planned Net + Commission (+ Taxes)). */
export interface ClientCostTotals {
  plannedNet: number;
  commission: number;
  taxes: number;
  otherFees: number;
  clientCostExclTaxes: number;
  clientCostInclTaxes: number;
  /** Planned Net from MediaBox v1 plans, which carry no fees. */
  noFeeData: number;
}

export function clientCostTotals(rows: PlannerRow[], currency: PlannerCurrency): ClientCostTotals {
  const t = { plannedNet: 0, commission: 0, taxes: 0, otherFees: 0, noFeeData: 0 };
  for (const r of rows) {
    t.plannedNet += amountOf(r, "PLANNED", currency);
    t.commission += amountOf(r, "COMMISSION", currency);
    t.taxes += amountOf(r, "TAXES", currency);
    t.otherFees += amountOf(r, "OTHER_FEES", currency);
    t.noFeeData += amountOf(r, "NO_FEE_DATA", currency);
  }
  return {
    ...t,
    clientCostExclTaxes: t.plannedNet + t.commission,
    clientCostInclTaxes: t.plannedNet + t.commission + t.taxes,
  };
}

/** Calendar month (1–12) of a planner row, from "YYYY-MM". */
export function plannerMonth(r: PlannerRow): number | null {
  const m = Number(String(r.MONTH ?? "").slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

/**
 * Planner rows in the Media Investments row shape, so its roll-ups apply as-is.
 * NET_ORDERED_CAD carries the planned amount in the chosen currency.
 */
export function toInvestmentRows(rows: PlannerRow[], currency: PlannerCurrency): MediaInvestmentRow[] {
  return rows.map((r) => ({
    ...r,
    PLUSCO_PROGRAMMATIC: null,
    BU_REGION: "",
    BUSINESS_LEAD: "",
    GM_POD: "",
    NET_ORDERED_CAD: plannedAmount(r, currency),
  }));
}

/**
 * Social-channel planner rows in the Social Media row shape (spend_2025 /
 * spend_2026 per month), so computeSocialSummary applies as-is.
 */
export function toSocialRows(rows: PlannerRow[], currency: PlannerCurrency): SocialPartnerRow[] {
  const out: SocialPartnerRow[] = [];
  for (const r of rows) {
    if (String(r.PLUSCO_MEDIA_CHANNEL ?? "").trim().toUpperCase() !== "SOCIAL") continue;
    const year = Number(r.PLUSCO_YEAR);
    if (year !== 2025 && year !== 2026) continue;
    const amount = plannedAmount(r, currency);
    out.push({
      id: r.id,
      AGENCY: r.AGENCY,
      BU_REGION: "",
      BUSINESS_LEAD: "",
      GM_POD: "",
      PLUSCO_CLIENT_NAME: r.PLUSCO_CLIENT_NAME,
      PLUSCO_MEDIA_PARTNER: r.PLUSCO_MEDIA_PARTNER,
      MONTH: String(plannerMonth(r) ?? ""),
      spend_2025: year === 2025 ? amount : 0,
      spend_2026: year === 2026 ? amount : 0,
    });
  }
  return out;
}

/** Distinct, sorted campaign statuses present in the rows. */
export function plannerStatuses(rows: PlannerRow[]): string[] {
  return [...new Set(rows.map((r) => String(r.CMP_STATUS ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
