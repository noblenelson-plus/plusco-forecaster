// filepath: components/forecaster/sections/mediaocean-social-section.tsx
"use client";

/**
 * SOCIAL MEDIA section (MediaOcean tab) -- the last MediaOcean section. Reads the
 * `social_partner_mix` collection via useSocialPartnerMix and rolls the (filtered)
 * rows up to: a per-partner table (spend 2025, spend 2026, variance, share ppt)
 * and a 2025-vs-2026 Social Share comparison chart. Six client-level filters
 * (Agency / BU Region / Business Lead / GM Pod / Client / Month).
 *
 * Design: mirrors the other MediaOcean sections -- icon+title header,
 * MultiSelectDropdown filters, ChartCard shells, shared table styling. All figures
 * recompute from the summable monthly spends (the hook ignores the stored annual
 * columns), so Month filtering stays correct.
 *
 * The share comparison is drawn as paired CSS bars (2025 vs 2026 per partner)
 * rather than a stacked chart, since the values are two independent shares to
 * compare side by side, not parts of one total.
 */

import { useMemo, useState } from "react";
import { Loader2, Share2, Table } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import MultiSelectDropdown, {
  type Option,
} from "../../_shared/multi-select-dropdown";
import {
  useSocialPartnerMix,
  socialFilterOptions,
  applySocialFilters,
  computeSocialSummary,
  EMPTY_SOCIAL_FILTERS,
  type SocialFilters,
  type SocialPartnerSlice,
} from "../../../lib/dashboard/data/use-social-partner-mix";

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** 27546111 → "$27 546 111" (en-CA). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.55 → "55%" ; null → "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Signed points, e.g. -12.0 → "−12.0", null → "—". */
function ppt(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}`;
}

const toOptions = (values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: v }));

// Two-tone palette for the paired share bars (2025 / 2026).
const COLOR_2025 = "#3b82f6"; // blue
const COLOR_2026 = "#f59e0b"; // amber

// ─── Social table ──────────────────────────────────────────────────────────────
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

// ─── Paired share bars (2025 vs 2026 per partner) ─────────────────────────────
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

// ─── Section ──────────────────────────────────────────────────────────────────

export default function MediaoceanSocialSection() {
  const { rows, loading, error } = useSocialPartnerMix();
  const [filters, setFilters] = useState<SocialFilters>(EMPTY_SOCIAL_FILTERS);

  const options = useMemo(() => socialFilterOptions(rows), [rows]);
  const filtered = useMemo(
    () => applySocialFilters(rows, filters),
    [rows, filters]
  );
  const summary = useMemo(() => computeSocialSummary(filtered), [filtered]);

  const anyFilterActive =
    filters.agency.length > 0 ||
    filters.buRegion.length > 0 ||
    filters.businessLead.length > 0 ||
    filters.gmPod.length > 0 ||
    filters.client.length > 0 ||
    filters.month.length > 0;

  const set = (patch: Partial<SocialFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  // ─── States (mirror the other sections) ───────────────────────────────────
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
      {/* Header */}
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Social Media</h2>
      </div>

      {/* Filter bar (6 filters) */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Agency"
          options={toOptions(options.agency)}
          selectedValues={filters.agency}
          onChange={(v) => set({ agency: v })}
          searchable
        />
        <MultiSelectDropdown
          label="BU Region"
          options={toOptions(options.buRegion)}
          selectedValues={filters.buRegion}
          onChange={(v) => set({ buRegion: v })}
        />
        <MultiSelectDropdown
          label="Business Lead"
          options={toOptions(options.businessLead)}
          selectedValues={filters.businessLead}
          onChange={(v) => set({ businessLead: v })}
          searchable
        />
        <MultiSelectDropdown
          label="GM Pod"
          options={toOptions(options.gmPod)}
          selectedValues={filters.gmPod}
          onChange={(v) => set({ gmPod: v })}
        />
        <MultiSelectDropdown
          label="Client"
          options={toOptions(options.client)}
          selectedValues={filters.client}
          onChange={(v) => set({ client: v })}
          searchable
        />
        <MultiSelectDropdown
          label="Month"
          options={toOptions(options.month)}
          selectedValues={filters.month}
          onChange={(v) => set({ month: v })}
        />
        {anyFilterActive && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_SOCIAL_FILTERS)}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
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
