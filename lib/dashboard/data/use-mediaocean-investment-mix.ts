// filepath: lib/dashboard/data/use-mediaocean-investment-mix.ts
"use client";

/**
 * MediaOcean Investments data module -- reads the `mediaocean_investment_mix`
 * collection (synced read-only from BigQuery's MEDIAOCEAN_INVESTMENT_MIX by
 * scripts/sync-mediaocean-investment-mix.mjs) and serves BOTH MediaOcean screens
 * from one fetch:
 *   1) Total Media Investment  -- channel rollup, media mix, digital mix, digital share.
 *   2) Top Partners            -- partner rollup (top-N), Deal vs Non-Deal split.
 *
 * Same discipline as use-mo-kpi-by-client.ts: the app does NOT recompute business
 * logic. The heavy rollup already ran in BigQuery (one row per grain tuple). Here
 * we only (1) fetch, (2) filter by the screen's dimensions, and (3) sum + group --
 * every percentage is sum(numerator)/sum(denominator), never an average of
 * per-row percentages.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

const COLLECTION = "mediaocean_investment_mix";

// Channels that count as "digital" for the Digital Media Mix pie and the Digital
// Share scorecard. Compared case-insensitively via channelKey(). Confirmed against
// the live report: Programmatic + SEM + Digital Direct + Social.
const DIGITAL_CHANNELS = new Set([
  "PROGRAMMATIC",
  "SEM",
  "DIGITAL DIRECT",
  "SOCIAL",
]);

// A partner row counts as a "Deal" partner only when PLUSCO_2026_DEALS is exactly
// "Partner Deal" (case-insensitive, trimmed) -- matching the Looker calc field.
// Everything else -- "#N/A", "Partner Deal - OLG", blanks -- is Non-Deal.
const DEAL_VALUE = "PARTNER DEAL";

// ─── Row shape ───────────────────────────────────────────────────────────────
// Only the fields the screens use are typed; the index signature keeps every
// other synced column reachable without fuss.
export interface MediaInvestmentRow {
  id: string; // Firestore doc id (grain hash) -- stable React key
  PLUSCO_YEAR: string;
  MONTH: string;
  MONTH_DATE: string | null;
  AGENCY: string;
  BU_REGION: string;
  BUSINESS_LEAD: string;
  GM_POD: string;
  PLUSCO_CLIENT_NAME: string;
  PLUSCO_MEDIA_CHANNEL: string;
  PLUSCO_MEDIA_PARTNER: string;
  PLUSCO_PROGRAMMATIC: string | null;
  PLUSCO_2026_DEALS: string | null;
  NET_ORDERED_CAD: number;
  [key: string]: unknown;
}

// ─── Fetch hook ──────────────────────────────────────────────────────────────

export interface MediaInvestmentResult {
  rows: MediaInvestmentRow[];
  loading: boolean;
  error: string | null;
}

/**
 * One-shot read of the whole `mediaocean_investment_mix` collection (~21.8k docs).
 * Read in full and filter/roll-up in memory (same pattern as useMoKpiByClient),
 * which keeps the dashboard filters instant and avoids per-interaction queries.
 */
export function useMediaoceanInvestmentMix(): MediaInvestmentResult {
  const [rows, setRows] = useState<MediaInvestmentRow[]>([]);
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
          id: d.id,
          ...(d.data() as Record<string, unknown>),
        })) as MediaInvestmentRow[];
        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load MediaOcean Investments data."
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

// ─── Shared numeric helpers ────────────────────────────────────────────────────

/** Coerce any synced value to a finite number (missing/null/NaN -> 0). */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Ratio that returns null when the denominator is zero (renders as "—"). */
function safeDiv(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

/** Distinct, sorted, non-empty string list from raw values. */
function uniqSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").toString().trim();
    if (s !== "") set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** True if `value` matches an active multi-select filter (empty list = no filter). */
function matchFilter(selected: string[], value: string | null | undefined): boolean {
  return (
    selected.length === 0 || selected.includes((value ?? "").toString().trim())
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TOTAL MEDIA INVESTMENT
// ════════════════════════════════════════════════════════════════════════════

// The Total Media screen exposes seven dimension filters.
export interface TotalMediaFilters {
  agency: string[];
  buRegion: string[];
  businessLead: string[];
  gmPod: string[];
  client: string[];
  month: string[];
  year: string[];
}

export const EMPTY_TOTAL_MEDIA_FILTERS: TotalMediaFilters = {
  agency: [],
  buRegion: [],
  businessLead: [],
  gmPod: [],
  client: [],
  month: [],
  year: [],
};

export type TotalMediaFilterOptions = TotalMediaFilters;

/** Distinct, sorted, non-empty option lists for each Total Media filter. */
export function totalMediaFilterOptions(
  rows: MediaInvestmentRow[]
): TotalMediaFilterOptions {
  return {
    agency: uniqSorted(rows.map((r) => r.AGENCY)),
    buRegion: uniqSorted(rows.map((r) => r.BU_REGION)),
    businessLead: uniqSorted(rows.map((r) => r.BUSINESS_LEAD)),
    gmPod: uniqSorted(rows.map((r) => r.GM_POD)),
    client: uniqSorted(rows.map((r) => r.PLUSCO_CLIENT_NAME)),
    month: uniqSorted(rows.map((r) => r.MONTH)),
    year: uniqSorted(rows.map((r) => r.PLUSCO_YEAR)),
  };
}

/** Rows kept when they match every active Total Media filter. */
export function applyTotalMediaFilters(
  rows: MediaInvestmentRow[],
  f: TotalMediaFilters
): MediaInvestmentRow[] {
  return rows.filter(
    (r) =>
      matchFilter(f.agency, r.AGENCY) &&
      matchFilter(f.buRegion, r.BU_REGION) &&
      matchFilter(f.businessLead, r.BUSINESS_LEAD) &&
      matchFilter(f.gmPod, r.GM_POD) &&
      matchFilter(f.client, r.PLUSCO_CLIENT_NAME) &&
      matchFilter(f.month, r.MONTH) &&
      matchFilter(f.year, r.PLUSCO_YEAR)
  );
}

/** Case-insensitive channel key used for grouping + digital detection. */
function channelKey(v: unknown): string {
  return (v ?? "").toString().trim().toUpperCase();
}

/** True when a channel is one of the four digital channels. */
export function isDigitalChannel(v: unknown): boolean {
  return DIGITAL_CHANNELS.has(channelKey(v));
}

/** One channel's slice: display label, dollars, and share of its pie's total. */
export interface ChannelSlice {
  channel: string;
  net: number;
  pct: number | null;
}

export interface TotalMediaInvestment {
  grandTotal: number;
  digitalTotal: number;
  /** Digital dollars / grand total -- the "Digital Share of Total Media" (63%). */
  digitalShareOfTotal: number | null;
  /** All channels, share of grand total, sorted desc -- table + Media Mix pie. */
  mediaMix: ChannelSlice[];
  /** Digital channels only, share of digital total, sorted desc -- Digital pie. */
  digitalMix: ChannelSlice[];
}

// Internal accumulator per channel key.
interface ChannelAgg {
  net: number;
  labelCounts: Map<string, number>;
}

/** Pick the most frequent original spelling as the display label (merges Print/PRINT). */
function pickLabel(labelCounts: Map<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [label, n] of labelCounts) {
    if (label === "") continue;
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best;
}

/**
 * Roll the given (already-filtered) rows up to the Total Media screen. Channels
 * are merged case-insensitively so "Print" and "PRINT" collapse into one slice.
 */
export function computeTotalMediaInvestment(
  rows: MediaInvestmentRow[]
): TotalMediaInvestment {
  const byChannel = new Map<string, ChannelAgg>();

  for (const r of rows) {
    const key = channelKey(r.PLUSCO_MEDIA_CHANNEL);
    if (key === "") continue; // channel N/A already filtered upstream; belt-and-suspenders
    const net = num(r.NET_ORDERED_CAD);

    let entry = byChannel.get(key);
    if (!entry) {
      entry = { net: 0, labelCounts: new Map() };
      byChannel.set(key, entry);
    }
    entry.net += net;

    const label = (r.PLUSCO_MEDIA_CHANNEL ?? "").toString().trim();
    entry.labelCounts.set(label, (entry.labelCounts.get(label) ?? 0) + 1);
  }

  let grandTotal = 0;
  let digitalTotal = 0;
  for (const [key, agg] of byChannel) {
    grandTotal += agg.net;
    if (DIGITAL_CHANNELS.has(key)) digitalTotal += agg.net;
  }

  const mediaMix: ChannelSlice[] = [...byChannel.entries()]
    .map(([, agg]) => ({
      channel: pickLabel(agg.labelCounts),
      net: agg.net,
      pct: safeDiv(agg.net, grandTotal),
    }))
    .sort((a, b) => b.net - a.net);

  const digitalMix: ChannelSlice[] = [...byChannel.entries()]
    .filter(([key]) => DIGITAL_CHANNELS.has(key))
    .map(([, agg]) => ({
      channel: pickLabel(agg.labelCounts),
      net: agg.net,
      pct: safeDiv(agg.net, digitalTotal),
    }))
    .sort((a, b) => b.net - a.net);

  return {
    grandTotal,
    digitalTotal,
    digitalShareOfTotal: safeDiv(digitalTotal, grandTotal),
    mediaMix,
    digitalMix,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TOP PARTNERS
// ════════════════════════════════════════════════════════════════════════════

// The Top Partners screen exposes four dimension filters in the mockup
// (Media Channel, Programmatic, 2026 Deals, Media Partner). We add Year so the
// section can default to 2026 yet stay switchable, consistent with Total Media.
export interface PartnerFilters {
  channel: string[];
  programmatic: string[];
  deals: string[];
  partner: string[];
  year: string[];
}

export const EMPTY_PARTNER_FILTERS: PartnerFilters = {
  channel: [],
  programmatic: [],
  deals: [],
  partner: [],
  year: [],
};

export type PartnerFilterOptions = PartnerFilters;

/** Distinct, sorted, non-empty option lists for each Top Partners filter. */
export function partnerFilterOptions(
  rows: MediaInvestmentRow[]
): PartnerFilterOptions {
  return {
    channel: uniqSorted(rows.map((r) => r.PLUSCO_MEDIA_CHANNEL)),
    programmatic: uniqSorted(rows.map((r) => r.PLUSCO_PROGRAMMATIC)),
    deals: uniqSorted(rows.map((r) => r.PLUSCO_2026_DEALS)),
    partner: uniqSorted(rows.map((r) => r.PLUSCO_MEDIA_PARTNER)),
    year: uniqSorted(rows.map((r) => r.PLUSCO_YEAR)),
  };
}

/** Rows kept when they match every active Top Partners filter. */
export function applyPartnerFilters(
  rows: MediaInvestmentRow[],
  f: PartnerFilters
): MediaInvestmentRow[] {
  return rows.filter(
    (r) =>
      matchFilter(f.channel, r.PLUSCO_MEDIA_CHANNEL) &&
      matchFilter(f.programmatic, r.PLUSCO_PROGRAMMATIC) &&
      matchFilter(f.deals, r.PLUSCO_2026_DEALS) &&
      matchFilter(f.partner, r.PLUSCO_MEDIA_PARTNER) &&
      matchFilter(f.year, r.PLUSCO_YEAR)
  );
}

/** True when a deal value is exactly "Partner Deal" (case-insensitive, trimmed). */
export function isDealValue(v: unknown): boolean {
  return (v ?? "").toString().trim().toUpperCase() === DEAL_VALUE;
}

/** One partner's row in the Top Partners table / bar chart. */
export interface PartnerSlice {
  partner: string;
  /** Deal-type label shown in the table (the partner's dominant 2026 deals value). */
  dealType: string;
  net: number;
  /** True if this partner's dominant deal value is exactly "Partner Deal". */
  isDeal: boolean;
}

export interface TopPartners {
  /** All partners, sorted by spend desc. The section slices the top N. */
  partners: PartnerSlice[];
  grandTotal: number;
  /** Sum of NET where the ROW is a Partner Deal (across all filtered rows). */
  dealTotal: number;
  /** Sum of NET where the ROW is not a Partner Deal. */
  nonDealTotal: number;
  dealPct: number | null;
  nonDealPct: number | null;
}

// Internal accumulator per partner.
interface PartnerAgg {
  net: number;
  // Deal-type label -> $ spent under it, so the table shows the label carrying
  // the most spend for that partner (a partner may appear under >1 deal value).
  dealTypeSpend: Map<string, number>;
}

/** Pick the deal-type label carrying the most spend for a partner. */
function pickDealType(dealTypeSpend: Map<string, number>): string {
  let best = "";
  let bestNet = -Infinity;
  for (const [label, net] of dealTypeSpend) {
    if (net > bestNet) {
      best = label;
      bestNet = net;
    }
  }
  return best;
}

/**
 * Roll the given (already-filtered) rows up to the Top Partners screen.
 *
 * Two separate calculations, intentionally:
 *  - The Deal / Non-Deal $ split is computed PER ROW (a row is a Partner Deal or
 *    not), so it exactly reproduces the Looker calc field regardless of how a
 *    partner's rows are labelled overall.
 *  - Each partner's table `dealType`/`isDeal` reflects that partner's dominant
 *    (most-spend) deal value, for display in the ranking table.
 */
export function computeTopPartners(rows: MediaInvestmentRow[]): TopPartners {
  const byPartner = new Map<string, PartnerAgg>();
  let grandTotal = 0;
  let dealTotal = 0;
  let nonDealTotal = 0;

  for (const r of rows) {
    const partner = (r.PLUSCO_MEDIA_PARTNER ?? "").toString().trim();
    if (partner === "") continue; // no partner name -> not a ranked partner
    const net = num(r.NET_ORDERED_CAD);
    const dealLabel = (r.PLUSCO_2026_DEALS ?? "").toString().trim() || "—";

    grandTotal += net;
    if (isDealValue(r.PLUSCO_2026_DEALS)) dealTotal += net;
    else nonDealTotal += net;

    let entry = byPartner.get(partner);
    if (!entry) {
      entry = { net: 0, dealTypeSpend: new Map() };
      byPartner.set(partner, entry);
    }
    entry.net += net;
    entry.dealTypeSpend.set(
      dealLabel,
      (entry.dealTypeSpend.get(dealLabel) ?? 0) + net
    );
  }

  const partners: PartnerSlice[] = [...byPartner.entries()]
    .map(([partner, agg]) => {
      const dealType = pickDealType(agg.dealTypeSpend);
      return {
        partner,
        dealType,
        net: agg.net,
        isDeal: isDealValue(dealType),
      };
    })
    .sort((a, b) => b.net - a.net);

  return {
    partners,
    grandTotal,
    dealTotal,
    nonDealTotal,
    dealPct: safeDiv(dealTotal, grandTotal),
    nonDealPct: safeDiv(nonDealTotal, grandTotal),
  };
}
