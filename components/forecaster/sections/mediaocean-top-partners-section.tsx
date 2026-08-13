// filepath: components/forecaster/sections/mediaocean-top-partners-section.tsx
"use client";

/**
 * TOP PARTNERS section (MediaOcean tab) -- sits directly below Total Media
 * Investment. Reads the SAME `mediaocean_investment_mix` collection via
 * useMediaoceanInvestmentMix (no new data), and rolls the (filtered) grain rows
 * up to: two hero scorecards (Deal Partners $ / Non-Deal Partners $ with their
 * shares), a Top-N partner table, and a "Spend by Partner" horizontal bar chart.
 * No business logic is recomputed here; the aggregate already ran in BigQuery.
 *
 * Design: mirrors the Total Media Investment section -- StatCard heroes, ChartCard
 * shells, shared table styling (uppercase muted headers, border-b rows, border-t-2
 * grand total), the shared HorizontalStackedBar (single series) for the ranking.
 * Four partner filters (Channel / Programmatic / 2026 Deals / Partner) plus Year,
 * which defaults to 2026 but stays changeable. Recomputes over active filters.
 *
 * Deal split is PER ROW (PLUSCO_2026_DEALS === "Partner Deal"), reproducing the
 * Looker calc field. Everything else -- "#N/A", "Partner Deal - OLG" -- is Non-Deal.
 */

import { useMemo, useState } from "react";
import { Loader2, Users, Table, BarChart3 } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import HorizontalStackedBar, {
  type StackSeries,
  type StackRow,
} from "../../dashboard/charts/horizontal-stacked-bar";
import MultiSelectDropdown, {
  type Option,
} from "../../_shared/multi-select-dropdown";
import {
  useMediaoceanInvestmentMix,
  partnerFilterOptions,
  applyPartnerFilters,
  computeTopPartners,
  EMPTY_PARTNER_FILTERS,
  type PartnerFilters,
  type PartnerSlice,
} from "../../../lib/dashboard/data/use-mediaocean-investment-mix";

// How many partners to show in the table + bar chart (matches the Looker "Top 20").
const TOP_N = 20;

// Single bar-series color for the Spend by Partner chart (flat Plus blue).
const BAR_COLOR = "#3b82f6";

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** 287023068 → "$287 023 068" (en-CA, matching the app's money style). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.68 → "68%" ; null → "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

const toOptions = (values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: v }));

// ─── Partner table ─────────────────────────────────────────────────────────────
// Same styling as the Total Media channel table / shared VarianceTable.
function PartnerTable({ partners }: { partners: PartnerSlice[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2 pr-2 text-left font-medium">#</th>
          <th className="py-2 text-left font-medium">Partner</th>
          <th className="py-2 text-left font-medium">2026 Deals</th>
          <th className="py-2 text-right font-medium">Net Ordered (CAD)</th>
        </tr>
      </thead>
      <tbody>
        {partners.map((p, i) => (
          <tr key={p.partner} className="border-b border-border/60">
            <td className="py-2 pr-2 text-left tabular-nums text-muted-foreground">
              {i + 1}
            </td>
            <td className="py-2 text-left text-foreground">{p.partner}</td>
            <td className="py-2 text-left text-muted-foreground">
              {p.dealType}
            </td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {money(p.net)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export default function MediaoceanTopPartnersSection() {
  const { rows, loading, error } = useMediaoceanInvestmentMix();

  // Year defaults to 2026 (senior-management default view); still changeable.
  const [filters, setFilters] = useState<PartnerFilters>({
    ...EMPTY_PARTNER_FILTERS,
    year: ["2026"],
  });

  // Options come from ALL rows so the choices stay stable as filters change.
  const options = useMemo(() => partnerFilterOptions(rows), [rows]);
  const filtered = useMemo(
    () => applyPartnerFilters(rows, filters),
    [rows, filters]
  );
  const top = useMemo(() => computeTopPartners(filtered), [filtered]);

  const topPartners = useMemo(
    () => top.partners.slice(0, TOP_N),
    [top.partners]
  );

  // Bar chart: one series ("net"), one row per top partner, pre-sorted desc.
  const barSeries: StackSeries[] = useMemo(
    () => [{ key: "net", label: "Net Ordered (CAD)", color: BAR_COLOR }],
    []
  );
  const barRows: StackRow[] = useMemo(
    () =>
      topPartners.map((p) => ({
        label: p.partner,
        values: { net: p.net },
      })),
    [topPartners]
  );

  const anyFilterActive =
    filters.channel.length > 0 ||
    filters.programmatic.length > 0 ||
    filters.deals.length > 0 ||
    filters.partner.length > 0 ||
    filters.year.length > 0;

  const set = (patch: Partial<PartnerFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const resetFilters = () =>
    setFilters({ ...EMPTY_PARTNER_FILTERS, year: ["2026"] });

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
          Couldn&apos;t load Top Partners: {error}
        </div>
        <p className="text-xs text-muted-foreground">
          This view reads the admin-only{" "}
          <code>mediaocean_investment_mix</code> collection. If this is a
          permissions error, the signed-in account needs admin access.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
        No Top Partners data yet — run the sync
        (scripts/sync-mediaocean-investment-mix.mjs).
      </div>
    );
  }

  return (
    <div
      data-scroll-section
      data-scroll-label="Top Partners"
      className="space-y-6"
    >
      {/* Header — matches the shipped sections (icon + title). */}
      <div className="flex items-center gap-2">
        <Users size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Top Partners</h2>
      </div>

      {/* Filter bar (4 partner filters + Year) */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Media Channel"
          options={toOptions(options.channel)}
          selectedValues={filters.channel}
          onChange={(v) => set({ channel: v })}
          searchable
        />
        <MultiSelectDropdown
          label="Programmatic"
          options={toOptions(options.programmatic)}
          selectedValues={filters.programmatic}
          onChange={(v) => set({ programmatic: v })}
        />
        <MultiSelectDropdown
          label="2026 Deals"
          options={toOptions(options.deals)}
          selectedValues={filters.deals}
          onChange={(v) => set({ deals: v })}
        />
        <MultiSelectDropdown
          label="Media Partner"
          options={toOptions(options.partner)}
          selectedValues={filters.partner}
          onChange={(v) => set({ partner: v })}
          searchable
        />
        <MultiSelectDropdown
          label="Year"
          options={toOptions(options.year)}
          selectedValues={filters.year}
          onChange={(v) => set({ year: v })}
        />
        {anyFilterActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Reset to 2026
          </button>
        )}
      </div>

      {/* Row 1 — Deal vs Non-Deal hero scorecards. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <StatCard
          icon={Users}
          label="Deal Partners $"
          value={money(top.dealTotal)}
          sub={`${pct(top.dealPct)} of total`}
        />
        <StatCard
          icon={Users}
          label="Non-Deal Partners $"
          value={money(top.nonDealTotal)}
          sub={`${pct(top.nonDealPct)} of total`}
        />
      </div>

      {/* Row 2 — Top-N table + Spend by Partner bar, side by side. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <ChartCard title={`Top ${TOP_N} Partners`} icon={Table}>
          <div className="pt-4">
            <PartnerTable partners={topPartners} />
          </div>
        </ChartCard>
        <ChartCard title="Spend by Partner" icon={BarChart3}>
          <div className="pt-4">
            <HorizontalStackedBar
              series={barSeries}
              rows={barRows}
              valueFormat={money}
            />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
