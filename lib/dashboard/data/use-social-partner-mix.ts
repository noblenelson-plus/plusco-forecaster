// filepath: lib/dashboard/data/use-social-partner-mix.ts
"use client";

/**
 * Social Media data module -- reads the `social_partner_mix` collection (synced
 * read-only from BigQuery's SOCIAL_PARTNER_MIX_2025_vs_2026 by
 * scripts/sync-social-partner-mix.mjs) and rolls the (filtered) rows up to the
 * Social Media screen: per-partner spend 2025 vs 2026, variance $, and share of
 * social. Six client-level filters drive it (Agency / BU Region / Business Lead /
 * GM Pod / Client / Month).
 *
 * IMPORTANT -- monthly vs annual columns. spend_2025 / spend_2026 are MONTHLY and
 * summable. The build ALSO carries annual columns (variance_cad, share_2025,
 * share_2026, variance_ppt, target_*) repeated across each month row, some null.
 * This module deliberately IGNORES those precomputed annual columns and RECOMPUTES
 * variance + share from the summable spends, so any Month filter stays correct
 * (summing the annual columns across months would multiply them). Same discipline
 * as the other modules: sum raw dollars, then divide.
 *
 * Variance sign follows the report: variance = spend_2025 - spend_2026 (social
 * going DOWN reads as a positive variance in the Looker mockup), which is the
 * OPPOSITE sign of the SQL variance_cad. That is intentional.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

const COLLECTION = "social_partner_mix";

// ─── Row shape ───────────────────────────────────────────────────────────────
export interface SocialPartnerRow {
  id: string;
  AGENCY: string;
  BU_REGION: string;
  BUSINESS_LEAD: string;
  GM_POD: string;
  PLUSCO_CLIENT_NAME: string;
  PLUSCO_MEDIA_PARTNER: string;
  MONTH: string;
  spend_2025: number;
  spend_2026: number;
  // Annual precomputed columns exist on the doc but are intentionally unused here.
  [key: string]: unknown;
}

// ─── Fetch hook ──────────────────────────────────────────────────────────────

export interface SocialPartnerResult {
  rows: SocialPartnerRow[];
  loading: boolean;
  error: string | null;
}

/**
 * One-shot read of the whole `social_partner_mix` collection (~2.7k docs). Small,
 * so read in full and filter/roll-up in memory (same pattern as the other
 * dashboard data modules).
 */
export function useSocialPartnerMix(): SocialPartnerResult {
  const [rows, setRows] = useState<SocialPartnerRow[]>([]);
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
        })) as SocialPartnerRow[];
        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load Social Media data."
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

// ─── Numeric helpers ───────────────────────────────────────────────────────────

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

// ─── Filters ─────────────────────────────────────────────────────────────────
// The Social screen exposes six client-level filters (the mockup's filter bar).

export interface SocialFilters {
  agency: string[];
  buRegion: string[];
  businessLead: string[];
  gmPod: string[];
  client: string[];
  month: string[];
}

export const EMPTY_SOCIAL_FILTERS: SocialFilters = {
  agency: [],
  buRegion: [],
  businessLead: [],
  gmPod: [],
  client: [],
  month: [],
};

export type SocialFilterOptions = SocialFilters;

/** Distinct, sorted, non-empty option lists for each Social filter. */
export function socialFilterOptions(rows: SocialPartnerRow[]): SocialFilterOptions {
  return {
    agency: uniqSorted(rows.map((r) => r.AGENCY)),
    buRegion: uniqSorted(rows.map((r) => r.BU_REGION)),
    businessLead: uniqSorted(rows.map((r) => r.BUSINESS_LEAD)),
    gmPod: uniqSorted(rows.map((r) => r.GM_POD)),
    client: uniqSorted(rows.map((r) => r.PLUSCO_CLIENT_NAME)),
    month: uniqSorted(rows.map((r) => r.MONTH)),
  };
}

/** Rows kept when they match every active Social filter. */
export function applySocialFilters(
  rows: SocialPartnerRow[],
  f: SocialFilters
): SocialPartnerRow[] {
  return rows.filter(
    (r) =>
      matchFilter(f.agency, r.AGENCY) &&
      matchFilter(f.buRegion, r.BU_REGION) &&
      matchFilter(f.businessLead, r.BUSINESS_LEAD) &&
      matchFilter(f.gmPod, r.GM_POD) &&
      matchFilter(f.client, r.PLUSCO_CLIENT_NAME) &&
      matchFilter(f.month, r.MONTH)
  );
}

// ─── Roll-up compute ─────────────────────────────────────────────────────────

/** One partner's social row: spends, variance, and 2025/2026 share of social. */
export interface SocialPartnerSlice {
  partner: string;
  spend2025: number;
  spend2026: number;
  /** spend_2025 − spend_2026 (report sign: social going down is positive). */
  variance: number;
  /** Partner's 2025 spend / total 2025 social spend. */
  share2025: number | null;
  /** Partner's 2026 spend / total 2026 social spend. */
  share2026: number | null;
  /** Change in share, in percentage POINTS: (share2026 − share2025) × 100. */
  sharePpt: number | null;
}

export interface SocialSummary {
  partners: SocialPartnerSlice[];
  total2025: number;
  total2026: number;
  /** total_2025 − total_2026 (same report sign as per-partner variance). */
  totalVariance: number;
}

// Internal accumulator per partner.
interface SocialAgg {
  spend2025: number;
  spend2026: number;
}

/**
 * Roll the given (already-filtered) rows up to the Social screen. All figures are
 * recomputed from the summable monthly spends, so a Month filter narrows correctly.
 */
export function computeSocialSummary(rows: SocialPartnerRow[]): SocialSummary {
  const byPartner = new Map<string, SocialAgg>();
  let total2025 = 0;
  let total2026 = 0;

  for (const r of rows) {
    const partner = (r.PLUSCO_MEDIA_PARTNER ?? "").toString().trim();
    if (partner === "") continue;
    const s25 = num(r.spend_2025);
    const s26 = num(r.spend_2026);

    total2025 += s25;
    total2026 += s26;

    let entry = byPartner.get(partner);
    if (!entry) {
      entry = { spend2025: 0, spend2026: 0 };
      byPartner.set(partner, entry);
    }
    entry.spend2025 += s25;
    entry.spend2026 += s26;
  }

  const partners: SocialPartnerSlice[] = [...byPartner.entries()]
    .map(([partner, agg]) => {
      const share2025 = safeDiv(agg.spend2025, total2025);
      const share2026 = safeDiv(agg.spend2026, total2026);
      const sharePpt =
        share2025 === null || share2026 === null
          ? null
          : (share2026 - share2025) * 100;
      return {
        partner,
        spend2025: agg.spend2025,
        spend2026: agg.spend2026,
        variance: agg.spend2025 - agg.spend2026,
        share2025,
        share2026,
        sharePpt,
      };
    })
    .sort((a, b) => b.spend2026 - a.spend2026);

  return {
    partners,
    total2025,
    total2026,
    totalVariance: total2025 - total2026,
  };
}
