//# filepath: components/dashboard/tabs/revenue-tab.tsx
"use client";

/**
 * Revenue tab — KPIs (total revenue, total media, revenue/media ratio), a
 * stream mix (donut), the top clients by revenue split by stream (stacked
 * bars, mirroring the Media Spend tab), a monthly stacked bar by stream, the
 * best/worst clients by revenue-to-media ratio, and a downloadable
 * per-client × stream detail table.
 * * Updated to accept `comparisonData` and calculate variance for the StatCards.
 */

import { useState } from "react";
import {
  DollarSign,
  Layers,
  Percent,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
} from "lucide-react";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import { computeVariance } from "../../../lib/types/forecaster.types";
import StatCard, { type StatVariance } from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import BarList from "../charts/bar-list";
import StackedBarChart from "../charts/stacked-bar-chart";
import HorizontalStackedBar from "../charts/horizontal-stacked-bar";
import RevenueDataTable from "../revenue-data-table";
import DimensionBreakdown, {
  type ClientDimensions,
} from "../dimension-breakdown";
import { POSITIVE_COLOR, NEGATIVE_COLOR } from "../charts/colors";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type {
  ScopeForecastData,
  RevenueMode,
} from "../../../lib/dashboard/data/use-scope-forecast-data";

/** The two selectable revenue definitions, mirroring the forecast grid rows. */
const REVENUE_MODES: { id: RevenueMode; label: string }[] = [
  { id: "blSubmission", label: "BL Submission" },
  { id: "official", label: "Official Revenue" },
];

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

const sumAll = (byKey: Record<string, Record<number, number>>) =>
  Object.values(byKey).reduce((acc, m) => acc + sumMonthlyMap(m), 0);

/**
 * Helper to compute and format the variance for the StatCards.
 */
function getVariance(
  current: number,
  reference: number | null | undefined,
  favorableUp: boolean = true,
  formatType: "money" | "pct" | "raw" = "money"
): StatVariance | null {
  if (reference == null || reference === 0) return null;
  
  const v = computeVariance(current, reference);
  if (v.absolute === 0) return { pillLabel: "0%", isFavorable: true, absoluteLabel: "0" };

  const up = v.absolute > 0;
  const isFavorable = up === favorableUp;
  const rel = v.relative !== null ? Math.round(v.relative) : 0;
  const pillLabel = rel > 0 ? `+${rel}%` : `${rel}%`;

  const absFormatted = 
    formatType === "pct" 
      ? formatPct(v.absolute) 
      : formatType === "raw" 
        ? String(v.absolute) 
        : formatCompactMoney(v.absolute);
        
  const absoluteLabel = up ? `+${absFormatted}` : absFormatted.replace("-", "−");

  return { pillLabel, isFavorable, absoluteLabel };
}

export default function RevenueTab({
  data,
  comparisonData,
  clientNameById,
  clientDimensions,
  fileLabel,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  clientNameById: Record<string, string>;
  clientDimensions: ClientDimensions;
  fileLabel?: string;
}) {
  // Which revenue definition to show — BL Submission (mauve, per-stream) or
  // Official Revenue (emerald, single line). Declared before the early returns
  // to keep hook order stable.
  const [mode, setMode] = useState<RevenueMode>("blSubmission");
  const isOfficial = mode === "official";

  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;

  const media = data.media;
  const view = data.revenueByMode[mode];
  const revenue = view.breakdown;
  const revenueByClient = view.byClient;

  const toggle = <RevenueModeToggle mode={mode} onChange={setMode} />;

  if (revenue.totalAnnual === 0) {
    return (
      <div className="space-y-6">
        {toggle}
        <EmptyDataNotice
          message={
            isOfficial
              ? "No official revenue has been entered for the selected clients, year and submission yet."
              : "No BL submission has been entered for the selected clients, year and submission yet."
          }
        />
      </div>
    );
  }

  const streams = revenue.byStream.filter((s) => s.annual > 0);
  const ratio = media.totalAnnual > 0 ? revenue.totalAnnual / media.totalAnnual : null;

  // Comparison data — same definition on both sides (variances stay apples-to-apples).
  const compView = comparisonData.hasContext
    ? comparisonData.revenueByMode[mode]
    : null;
  const compRevenue = compView ? compView.breakdown : null;
  const compMedia = comparisonData.hasContext ? comparisonData.media : null;
  const compRatio = compMedia && compMedia.totalAnnual > 0 && compRevenue 
    ? compRevenue.totalAnnual / compMedia.totalAnnual 
    : null;

  // Per-client Revenue / Media ratios, for the best/worst lists. Only clients
  // with media spend (a non-zero denominator) qualify.
  const revByClient = new Map(
    revenueByClient.map((r) => [r.clientId, sumAll(r.byStream)])
  );
  const ratios = data.mediaByClient
    .map((m) => {
      const mediaTotal = sumAll(m.byType);
      const rev = revByClient.get(m.clientId) ?? 0;
      return {
        clientId: m.clientId,
        name: clientNameById[m.clientId] ?? m.clientId,
        rev,
        mediaTotal,
        ratio: mediaTotal > 0 ? rev / mediaTotal : null,
      };
    })
    .filter((r): r is typeof r & { ratio: number } => r.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio);

  const toItems = (list: typeof ratios, color: string) =>
    list.map((r) => ({
      label: r.name,
      value: r.ratio,
      color,
      hint: `${formatCompactMoney(r.rev)} / ${formatCompactMoney(r.mediaTotal)}`,
    }));

  const best = toItems(ratios.slice(0, 5), POSITIVE_COLOR);
  const worst = toItems(ratios.slice(-5).reverse(), NEGATIVE_COLOR);

  // Top 10 clients by revenue, each broken down by stream for the stacked bar
  // (mirrors the Media Spend tab's top-clients chart).
  const clientRevenueSeries = revenue.byStream.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
  }));
  const topClients = revenueByClient
    .map((cb) => {
      const values: Record<string, number> = {};
      let total = 0;
      for (const s of revenue.byStream) {
        const v = cb.byStream[s.key] ? sumMonthlyMap(cb.byStream[s.key]) : 0;
        values[s.key] = v;
        total += v;
      }
      return { label: clientNameById[cb.clientId] ?? cb.clientId, total, values };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Annual BL revenue per client, for the Region / Business Lead breakdowns.
  const clientTotals = revenueByClient.map((cb) => ({
    clientId: cb.clientId,
    total: sumAll(cb.byStream),
  }));

  return (
    <div className="space-y-6">
      {toggle}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={DollarSign}
          label="Total revenue"
          value={formatCompactMoney(revenue.totalAnnual)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
          variance={getVariance(revenue.totalAnnual, compRevenue?.totalAnnual)}
        />
        <StatCard
          icon={BarChart3}
          label="Total media spend"
          value={formatCompactMoney(media.totalAnnual)}
          accent="text-indigo-500"
          variance={getVariance(media.totalAnnual, compMedia?.totalAnnual)}
        />
        <StatCard
          icon={Percent}
          label="Revenue / Media"
          value={ratio !== null ? formatPct(ratio) : "—"}
          sub="revenue per $ of media spend"
          accent="text-emerald-500"
          variance={getVariance(ratio ?? 0, compRatio ?? 0, true, "pct")}
        />
      </div>

      {/* Asymmetric 5-col grid, like Media Spend: donut 40% / top clients 60%.
          The stream-mix donut only makes sense for BL Submission — Official
          Revenue is a single line, so it is hidden and the top-clients chart
          spans the full width. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {!isOfficial && (
          <ChartCard
            title="Revenue mix"
            subtitle="Annual revenue by stream"
            icon={Layers}
            className="lg:col-span-2"
          >
            <DonutChart
              segments={streams.map((s) => ({
                label: s.label,
                value: s.annual,
                color: s.color,
              }))}
              centerValue={formatCompactMoney(revenue.totalAnnual)}
              centerLabel="Total"
              valueFormat={formatCompactMoney}
            />
          </ChartCard>
        )}

        <ChartCard
          title="Top 10 clients by revenue"
          subtitle={
            isOfficial
              ? "Largest Official Revenue"
              : "Largest BL revenue, split by stream"
          }
          icon={Users}
          className={isOfficial ? "lg:col-span-5" : "lg:col-span-3"}
        >
          {topClients.length > 0 ? (
            <HorizontalStackedBar
              series={clientRevenueSeries}
              rows={topClients}
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client revenue in scope.
            </p>
          )}
        </ChartCard>
      </div>

      <DimensionBreakdown
        totalsByClient={clientTotals}
        dimensions={clientDimensions}
        metricLabel="BL revenue"
      />

      <ChartCard
        title={isOfficial ? "Monthly official revenue" : "Monthly revenue by stream"}
        subtitle={
          isOfficial
            ? "Each bar is a month's total Official Revenue"
            : "Each bar is a month's total BL revenue, split by stream"
        }
        icon={BarChart3}
      >
        <StackedBarChart
          series={revenue.byStream.map((s) => ({
            label: s.label,
            color: s.color,
            points: monthsToPoints(revenue.monthlyByStream[s.key]),
          }))}
          valueFormat={formatCompactMoney}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Best Revenue / Media ratio"
          subtitle="Top 5 clients — most revenue per $ of media spend"
          icon={TrendingUp}
        >
          {best.length > 0 ? (
            <BarList items={best} valueFormat={(v) => formatPct(v)} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client with media spend in scope.
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Worst Revenue / Media ratio"
          subtitle="Bottom 5 clients — least revenue per $ of media spend"
          icon={TrendingDown}
        >
          {worst.length > 0 ? (
            <BarList items={worst} valueFormat={(v) => formatPct(v)} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client with media spend in scope.
            </p>
          )}
        </ChartCard>
      </div>

      <RevenueDataTable
        revenueByClient={revenueByClient}
        clientNameById={clientNameById}
        fileLabel={fileLabel}
      />
    </div>
  );
}

// ─── Revenue mode toggle (BL Submission vs Official Revenue) ──────────────────

/**
 * Segmented control mirroring the forecast grid's two revenue rows: BL
 * Submission (mauve) and Official Revenue (emerald). Flat and square, on-brand.
 */
function RevenueModeToggle({
  mode,
  onChange,
}: {
  mode: RevenueMode;
  onChange: (mode: RevenueMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Revenue basis
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
        {REVENUE_MODES.map((m) => {
          const active = m.id === mode;
          const activeBg =
            m.id === "official" ? "bg-green-500" : "bg-violet-600";
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              aria-pressed={active}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? `${activeBg} text-white`
                  : "bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}