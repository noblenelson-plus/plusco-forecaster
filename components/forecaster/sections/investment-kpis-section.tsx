// filepath: components/forecaster/sections/investment-kpis-section.tsx
"use client";

/**
 * INVESTMENT KPIS section (MediaOcean tab) — the strategy scorecards:
 * Achieve Labs Targets / Meta Divestment / Grow Programmatic / Decrease Digital
 * Direct. Reads the `mo_kpi_by_client` collection via useMoKpiByClient and rolls
 * the (filtered) client rows up to portfolio figures — no business logic is
 * recomputed here; every rule already ran in BigQuery.
 *
 * This is a fixed strategy snapshot (source = RFQ 2-BL-2026, 2025 vs 2026): it
 * intentionally does NOT react to the dashboard's Year/RFQ selectors. Its own
 * five client-level filters (Agency / BU Region / Business Lead / GM Pod /
 * Client) drive the roll-up, and the same filtered rows feed the table below.
 */

import { useMemo, useState } from "react";
import { Loader2, Gauge } from "lucide-react";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import MultiSelectDropdown, {
  type Option,
} from "../../_shared/multi-select-dropdown";
import {
  useMoKpiByClient,
  kpiFilterOptions,
  applyKpiFilters,
  computeInvestmentKpis,
  metaShareTrendBreakdown,
  EMPTY_KPI_FILTERS,
  type KpiFilters,
} from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import InvestmentKpisTable from "./investment-kpis-table";

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** 27546111 → "$27 546 111" (en-CA, matching the app's money style). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.55 → "55%" ; null → "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/**
 * Build the StatCard variance pill from a year-over-year point change. `favorable`
 * says which direction is good for THIS metric (e.g. Meta share going down is
 * good; Programmatic share going up is good), so the pill colors correctly.
 */
function yoyVariance(
  yoyPpt: number | null,
  favorable: "up" | "down"
): StatVariance | null {
  if (yoyPpt === null) return null;
  const points = yoyPpt * 100;
  const rounded = Number(points.toFixed(2));
  const isFavorable =
    rounded === 0 ? true : favorable === "up" ? rounded > 0 : rounded < 0;
  const magnitude = Math.abs(rounded).toFixed(rounded % 1 === 0 ? 0 : 2);
  const pillLabel =
    rounded === 0 ? "—" : `${rounded > 0 ? "+" : "−"}${magnitude}% YOY`;
  return { pillLabel, isFavorable };
}

const toOptions = (values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: v }));

// ─── Small building blocks ────────────────────────────────────────────────────

function KpiGroup({
  title,
  subtitle,
  columns = 4,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  columns?: 3 | 4;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const gridCols = columns === 3 ? "md:grid-cols-3" : "md:grid-cols-4";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className={`grid grid-cols-2 gap-4 ${gridCols}`}>{children}</div>
      {footer && <div className="mt-4 border-t border-border pt-4">{footer}</div>}
    </div>
  );
}

// Meta Share Trend — client counts by trend category, as a compact bar strip.
// Lives inside the Meta Divestment group (option 1) rather than a lone pie.
function MetaShareTrendStrip({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return null;
  const colorFor = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes("divest")) return "bg-blue-500";
    if (l.includes("increas")) return "bg-orange-500";
    if (l.includes("flat")) return "bg-purple-500";
    return "bg-gray-400";
  };
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Meta Share Trend · % of {total} client{total === 1 ? "" : "s"}
      </p>
      <div className="space-y-2">
        {data.map((d) => {
          const share = total ? (d.count / total) * 100 : 0;
          return (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-44 flex-shrink-0 text-xs text-foreground">
                {d.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className={`h-2 rounded ${colorFor(d.label)}`}
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="w-24 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {d.count} ({share.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export default function InvestmentKpisSection() {
  const { rows, loading, error } = useMoKpiByClient();
  const [filters, setFilters] = useState<KpiFilters>(EMPTY_KPI_FILTERS);

  // Options come from ALL rows so the choices stay stable as filters change.
  const options = useMemo(() => kpiFilterOptions(rows), [rows]);
  const filtered = useMemo(() => applyKpiFilters(rows, filters), [rows, filters]);
  const kpis = useMemo(() => computeInvestmentKpis(filtered), [filtered]);
  const metaTrend = useMemo(() => metaShareTrendBreakdown(filtered), [filtered]);

  const anyFilterActive =
    filters.agency.length > 0 ||
    filters.buRegion.length > 0 ||
    filters.businessLead.length > 0 ||
    filters.gmPod.length > 0 ||
    filters.client.length > 0;

  const set = (patch: Partial<KpiFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  // ─── States ──────────────────────────────────────────────────────────────
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
        <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          Couldn&apos;t load Investment KPIs: {error}
        </div>
        <p className="text-xs text-muted-foreground">
          This view reads the admin-only <code>mo_kpi_by_client</code> collection.
          If this is a permissions error, the signed-in account needs admin
          access.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No Investment KPIs data yet — run the sync (scripts/sync-kpi-by-client.mjs).
      </div>
    );
  }

  const { labs, meta, programmatic, digitalDirect } = kpis;

  return (
    <div data-scroll-section data-scroll-label="Investment KPIs" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gauge size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Investment KPIs</h2>
      </div>

      {/* Filter bar (5 client-level filters) */}
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
        {anyFilterActive && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_KPI_FILTERS)}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {kpis.clientCount} client{kpis.clientCount === 1 ? "" : "s"} · strategy
          snapshot (RFQ 2-BL-2026, 2025 vs 2026)
        </span>
      </div>

      {/* Achieve Labs Targets */}
      <KpiGroup title="Achieve Labs Targets" columns={4}>
        <StatCard
          label="Labs Share of Total Media"
          value={pct(labs.labsShareOfTotalMedia)}
          sub="Plusco Target: 20–25%"
        />
        <StatCard
          label="Prog Labs Share of Prog"
          value={pct(labs.progLabsShareOfProg)}
        />
        <StatCard
          label="Billups Share of OOH"
          value={pct(labs.billupsShareOfOoh)}
        />
        <StatCard
          label="Billups Share of Print"
          value={pct(labs.billupsShareOfPrint)}
        />
      </KpiGroup>

      {/* Meta Divestment */}
      <KpiGroup
        title="Meta Divestment"
        subtitle="Target Meta Spend by client = (2026 Social Forecast RFQ1 × 2025 Meta Share of Social) × 0.70"
        columns={4}
        footer={<MetaShareTrendStrip data={metaTrend} />}
      >
        <StatCard
          label="Meta Share of Social"
          value={pct(meta.metaShareOfSocial.value)}
          variance={yoyVariance(meta.metaShareOfSocial.yoyPpt, "down")}
        />
        <StatCard
          label="Target Meta Share of Social"
          value={pct(meta.targetMetaShareOfSocial)}
        />
        <StatCard
          label="Other Platforms Share 2026"
          value={pct(meta.otherPlatformsShare.value)}
          variance={yoyVariance(meta.otherPlatformsShare.yoyPpt, "up")}
        />
        <StatCard label="% of Target" value={pct(meta.pctOfTarget)} />
        <StatCard label="Meta Spend" value={money(meta.metaSpend2026)} />
        <StatCard
          label="Target Meta Spend (−30%)"
          value={money(meta.targetMetaSpend2026)}
        />
        <StatCard
          label="MIQ-Social Spend Booked"
          value={money(meta.miqSocialSpend2026)}
        />
        <StatCard
          label="MIQ-Social Forecast"
          value={money(meta.miqSocialForecast2026)}
        />
      </KpiGroup>

      {/* Grow Programmatic + Decrease Digital Direct (side by side on wide screens) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <KpiGroup title="Grow Programmatic" columns={3}>
          <StatCard
            label="Prog Share of Digital"
            value={pct(programmatic.shareOfDigital.value)}
            variance={yoyVariance(programmatic.shareOfDigital.yoyPpt, "up")}
          />
          <StatCard
            label="$ Deal Partners"
            value={money(programmatic.dealSpend)}
            sub={pct(programmatic.dealPct)}
          />
          <StatCard
            label="$ Non-Deal Partners"
            value={money(programmatic.nonDealSpend)}
            sub={pct(programmatic.nonDealPct)}
          />
        </KpiGroup>

        <KpiGroup title="Decrease Digital Direct" columns={3}>
          <StatCard
            label="Digital Direct Share of Digital"
            value={pct(digitalDirect.shareOfDigital.value)}
            variance={yoyVariance(digitalDirect.shareOfDigital.yoyPpt, "down")}
          />
          <StatCard
            label="$ Deal Partners"
            value={money(digitalDirect.dealSpend)}
            sub={pct(digitalDirect.dealPct)}
          />
          <StatCard
            label="$ Non-Deal Partners"
            value={money(digitalDirect.nonDealSpend)}
            sub={pct(digitalDirect.nonDealPct)}
          />
        </KpiGroup>
      </div>

      {/* Client Download Table — driven by the SAME filtered rows, so the one
          filter bar above controls both the scorecards and the table. */}
      <InvestmentKpisTable rows={filtered} />
    </div>
  );
}
