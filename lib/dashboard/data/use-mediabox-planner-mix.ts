// lib/dashboard/data/use-mediabox-planner-mix.ts
"use client";

/**
 * MediaBox Planner data module — reads the `mediabox_planner_mix` collection
 * (MediaBox planned budgets, synced from BigQuery's finance_master_mapping by
 * scripts/sync-mediabox-planner.mjs) and the `dashboard_meta/mediabox_planner`
 * stamp (sync time + the Bank of Canada rates used).
 *
 * Rows are already summed in the sync to year × month × agency × client ×
 * MediaBox media type × publisher × deal, with every amount in CAD and USD.
 * The view groups by MediaBox's own media type ("Media Type (Channel)") and
 * publisher — not the Plus channel / partner mappings. It reuses the Media
 * Investments roll-ups (computeTopPartners / computeSocialSummary) by reshaping
 * these rows into their row types; the channel mix has its own roll-up
 * (computePlannerMediaMix) because MediaBox names its digital types differently
 * (Paid Search, Digital).
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useDashboardDocScope } from "../../hooks/use-agency-scope";
import { fetchDashboardRowDocs } from "./agency-scoped-query";
import type { ChannelSlice, MediaInvestmentRow, TotalMediaInvestment } from "./use-mediaocean-investment-mix";
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
  /** MediaBox media type — shown as "Media Type (Channel)". */
  MEDIA_TYPE?: string;
  /** MediaBox publisher — the view's partner dimension. */
  PUBLISHER?: string;
  /** Plus mappings, on rows synced before the media type / publisher switch. */
  PLUSCO_MEDIA_CHANNEL?: string;
  PLUSCO_MEDIA_PARTNER?: string;
  PLUSCO_2026_DEALS: string | null;
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

/** Label for rows with no publisher picked in MediaBox (the sync writes it). */
export const NO_PUBLISHER = "(No publisher)";
/** Label for rows with no media type in MediaBox. */
export const NO_MEDIA_TYPE = "(No media type)";

/** The row's MediaBox media type (older rows: the Plus channel). */
export function mediaTypeOf(r: PlannerRow): string {
  return String(r.MEDIA_TYPE ?? r.PLUSCO_MEDIA_CHANNEL ?? "").trim() || NO_MEDIA_TYPE;
}

/** The row's MediaBox publisher (older rows: the Plus partner). */
export function publisherOf(r: PlannerRow): string {
  return String(r.PUBLISHER ?? r.PLUSCO_MEDIA_PARTNER ?? "").trim() || NO_PUBLISHER;
}

/**
 * Media types counted as digital — Media Investments' Programmatic / SEM /
 * Digital Direct / Social. The sync rolls MediaBox's types up to 8 channels
 * (Search = Paid Search / SEM; Digital Direct includes MediaBox's generic
 * "Digital"); the older names stay listed for rows synced before that.
 */
const PLANNER_DIGITAL = new Set(["PROGRAMMATIC", "SOCIAL", "SEARCH", "DIGITAL DIRECT", "PAID SEARCH", "DIGITAL", "SEM"]);

/** Media types the view leaves out entirely (media team): "Other" and no media type. */
const HIDDEN_MEDIA_TYPES = new Set(["OTHER", NO_MEDIA_TYPE.toUpperCase()]);

/** The row is "Other" / has no media type — left out of every table and total. */
export function isHiddenMediaType(r: PlannerRow): boolean {
  return HIDDEN_MEDIA_TYPES.has(mediaTypeOf(r).toUpperCase());
}

export function isDigitalMediaType(mediaType: string): boolean {
  return PLANNER_DIGITAL.has(mediaType.trim().toUpperCase());
}

/**
 * Planned Net by media type: total, digital share, all-types mix and digital
 * mix (the Media Investments TotalMediaInvestment shape). Types are merged
 * case-insensitively.
 */
export function computePlannerMediaMix(rows: PlannerRow[], currency: PlannerCurrency): TotalMediaInvestment {
  const byType = new Map<string, { label: string; net: number }>();
  for (const r of rows) {
    const label = mediaTypeOf(r);
    const key = label.toUpperCase();
    const e = byType.get(key) ?? { label, net: 0 };
    e.net += plannedAmount(r, currency);
    byType.set(key, e);
  }
  let grandTotal = 0;
  let digitalTotal = 0;
  for (const [key, e] of byType) {
    grandTotal += e.net;
    if (PLANNER_DIGITAL.has(key)) digitalTotal += e.net;
  }
  const slice = (e: { label: string; net: number }, total: number): ChannelSlice => ({
    channel: e.label,
    net: e.net,
    pct: total ? e.net / total : null,
  });
  const all = [...byType.values()];
  return {
    grandTotal,
    digitalTotal,
    digitalShareOfTotal: grandTotal ? digitalTotal / grandTotal : null,
    mediaMix: all.map((e) => slice(e, grandTotal)).sort((a, b) => b.net - a.net),
    digitalMix: all.filter((e) => isDigitalMediaType(e.label)).map((e) => slice(e, digitalTotal)).sort((a, b) => b.net - a.net),
  };
}

/**
 * Planner rows in the Media Investments row shape, so its partner roll-up and
 * filters apply as-is: the channel slot carries the media type, the partner slot
 * the publisher, NET_ORDERED_CAD the planned amount in the chosen currency.
 */
export function toInvestmentRows(rows: PlannerRow[], currency: PlannerCurrency): MediaInvestmentRow[] {
  return rows.map((r) => ({
    ...r,
    PLUSCO_MEDIA_CHANNEL: mediaTypeOf(r),
    PLUSCO_MEDIA_PARTNER: publisherOf(r),
    PLUSCO_PROGRAMMATIC: null,
    BU_REGION: "",
    BUSINESS_LEAD: "",
    GM_POD: "",
    NET_ORDERED_CAD: plannedAmount(r, currency),
  }));
}

/**
 * Social media-type planner rows in the Social Media row shape (spend_2025 /
 * spend_2026 per month, partner = publisher), so computeSocialSummary applies as-is.
 */
export function toSocialRows(rows: PlannerRow[], currency: PlannerCurrency): SocialPartnerRow[] {
  const out: SocialPartnerRow[] = [];
  for (const r of rows) {
    if (mediaTypeOf(r).toUpperCase() !== "SOCIAL") continue;
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
      PLUSCO_MEDIA_PARTNER: publisherOf(r),
      MONTH: String(plannerMonth(r) ?? ""),
      spend_2025: year === 2025 ? amount : 0,
      spend_2026: year === 2026 ? amount : 0,
    });
  }
  return out;
}
