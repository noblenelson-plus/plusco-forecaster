// filepath: components/forecaster/sections/mediaocean-social-section.tsx
"use client";

/**
 * SOCIAL MEDIA section (MediaOcean tab) -- the last MediaOcean section. Reads the
 * `social_partner_mix` collection via useSocialPartnerMix and rolls the (filtered)
 * rows up to: a per-partner table (spend 2025, spend 2026, variance, share ppt)
 * and a 2025-vs-2026 Social Share comparison chart.
 *
 * Design: mirrors the other MediaOcean sections -- icon+title header, ChartCard
 * shells, shared table styling. Driven by the global dashboard filter + Time &
 * Context; no local filters. Social has NO year filter -- it intrinsically
 * compares 2025 vs 2026 -- so only client scope + months apply. All figures
 * recompute from the summable monthly spends (the hook ignores the stored annual
 * columns), so Month filtering stays correct.
 *
 * The share comparison is drawn as paired CSS bars (2025 vs 2026 per partner)
 * rather than a stacked chart, since the values are two independent shares to
 * compare side by side, not parts of one total.
 */

import { useMemo } from "react";
import { Loader2, Share2, Table } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import {
  useSocialPartnerMix,
  computeSocialSummary,
  type SocialPartnerSlice,
  type SocialPartnerRow,
} from "../../../lib/dashboard/data/use-social-partner-mix";
import type { Client } from "../../../lib/types/client.types";

// --- Formatting helpers -------------------------------------------------------

/** 27546111 -> "$27 546 111" (en-CA). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.55 -> "55%" ; null -> "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Signed points, e.g. -12.0 -> "−12.0", null -> "—". */
function ppt(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}`;
}

// Month name -> number, to match the global Months selection against the row's
// MONTH (which may be a name, a number, or a date string).
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
function monthOf(r: SocialPartnerRow): number | null {
  const raw = String(r.MONTH ?? "").trim();
  if (!raw) return null;
  const idx = MONTH_NAMES.indexOf(raw.toLowerCase());
  if (idx >= 0) return idx + 1;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.getUTCMonth() + 1;
  return null;
}

// Two-tone palette for the paired share bars (2025 / 2026).
const COLOR_2025 = "#3b82f6"; // blue
const COLOR_2026 = "#f59e0b"; // amber

// --- Social table -------------------------------------------------------------
// Same styling as the shared VarianceTable / other MediaOcean tables.
function SocialTable({
  partners,
  total2025,
  total2026,
  totalVariance,
}: {
  partners: SocialPartnerSlice[];
  total2025: number;
  total2026: number;
  totalVariance: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2 text-left font-medium">Partner</th>
          <th className="py-2 text-right font-medium">Spend 2025</th>
          <th className="py-2 text-right font-medium">Spend 2026</th>
          <th className="py-2 text-right font-medium">Variance $</th>
          <th className="py-2 text-right font-medium">Share ppt</th>
        </tr>
      </thead>
      <tbody>
        {partners.map((p) => (
          <tr key={p.partner} className="border-b border-border/60">
            <td className="py-2 text-left text-foreground">{p.partner}</td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {money(p.spend2025)}
            </td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {money(p.spend2026)}
            </td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {money(p.variance)}
            </td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {ppt(p.sharePpt)}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-border font-semibold">
          <td className="py-2 text-left tabular-nums text-foreground">
            Grand total
          </td>
          <td className="py-2 text-right tabular-nums text-foreground">
            {money(total2025)}
          </td>
          <td className="py-2 text-right tabular-nums text-foreground">
            {money(total2026)}
          </td>
          <td className="py-2 text-right tabular-nums text-foreground">
            {money(totalVariance)}
          </td>
          <td className="py-2 text-right tabular-nums text-muted-foreground">
            —
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// --- Paired share bars (2025 vs 2026 per partner) -----------------------------
function ShareBars({ partners }: { partners: SocialPartnerSlice[] }) {
  // Scale bars to the largest share in view so differences are legible.
  const maxShare = partners.reduce((m, p) => {
    const a = p.share2025 ?? 0;
    const b = p.share2026 ?? 0;
    return Math.max(m, a, b);
  }, 0);
  const w = (share: number | null): number =>
    share === null || maxShare === 0 ? 0 : (share / maxShare) * 100;

  if (partners.length === 0) {
    return <p className="text-xs text-muted-foreground">No spend in range.</p>;
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLOR_2025 }}
          />
          Social Share 2025
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLOR_2026 }}
          />
          Social Share 2026
        </span>
      </div>

      {partners.map((p) => (
        <div key={p.partner} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-foreground">{p.partner}</span>
            <span className="tabular-nums text-muted-foreground">
              {pct(p.share2025)} → {pct(p.share2026)}
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden bg-muted">
              <div
                className="h-2"
                style={{ width: `${w(p.share2025)}%`, backgroundColor: COLOR_2025 }}
              />
            </div>
            <div className="h-2 w-full overflow-hidden bg-muted">
              <div
                className="h-2"
                style={{ width: `${w(p.share2026)}%`, backgroundColor: COLOR_2026 }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Section ------------------------------------------------------------------

export default function MediaoceanSocialSection({
  scopedClientIds,
  clients,
  selMonths,
}: {
  scopedClientIds: string[];
  clients: Client[];
  selMonths: number[];
}) {
  const { rows, loading, error } = useSocialPartnerMix();

  // Driven by the global filter bar + Time & Context (no local filters). Social
  // has no year filter -- it intrinsically compares 2025 vs 2026 -- so we map
  // only client scope + months. Client scope arrives as ids; social rows key on
  // client NAME, so we map ids -> names via the clients collection and match
  // case-insensitively.
  const scopedNames = useMemo(() => {
    const nameById = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
    const names = new Set<string>();
    for (const id of scopedClientIds) {
      const n = nameById.get(id);
      if (n) names.add(n.trim().toLowerCase());
    }
    return names;
  }, [scopedClientIds, clients]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (
          scopedNames.size > 0 &&
          !scopedNames.has(String(r.PLUSCO_CLIENT_NAME).trim().toLowerCase())
        )
          return false;
        if (selMonths.length > 0) {
          const m = monthOf(r);
          if (m === null || !selMonths.includes(m)) return false;
        }
        return true;
      }),
    [rows, scopedNames, selMonths]
  );
  const summary = useMemo(() => computeSocialSummary(filtered), [filtered]);

  // --- States (mirror the other sections) -----------------------------------
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          Couldn&apos;t load Social Media: {error}
        </div>
        <p className="text-xs text-muted-foreground">
          This view reads the admin-only <code>social_partner_mix</code>{" "}
          collection. If this is a permissions error, the signed-in account needs
          admin access.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
        No Social Media data yet — run the sync
        (scripts/sync-social-partner-mix.mjs).
      </div>
    );
  }

  return (
    <div
      data-scroll-section
      data-scroll-label="Social Media"
      className="space-y-6"
    >
      {/* Header — with a right-aligned 2026 social-spend caption. */}
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Social Media</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {money(summary.total2026)} social spend (2026)
        </span>
      </div>

      {/* Table + share comparison side by side. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <ChartCard title="Social Partners" icon={Table}>
          <div className="pt-4">
            <SocialTable
              partners={summary.partners}
              total2025={summary.total2025}
              total2026={summary.total2026}
              totalVariance={summary.totalVariance}
            />
          </div>
        </ChartCard>
        <ChartCard
          title="Social Share: 2025 vs 2026"
          icon={Share2}
          subtitle="Each partner's share of total social spend"
        >
          <ShareBars partners={summary.partners} />
        </ChartCard>
      </div>
    </div>
  );
}
