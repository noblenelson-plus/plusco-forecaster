// components/dashboard/tabs/revenue-tab.tsx

/**
 * Revenue tab — KPIs (total revenue, total media, revenue/media ratio), a
 * stream mix (donut), per-stream comparison (bars), a monthly stacked bar by
 * stream, the best/worst clients by revenue-to-media ratio, and a downloadable
 * per-client × stream detail table.
 */

import {
  DollarSign,
  Layers,
  Percent,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import BarList from "../charts/bar-list";
import StackedBarChart from "../charts/stacked-bar-chart";
import RevenueDataTable from "../revenue-data-table";
import { POSITIVE_COLOR, NEGATIVE_COLOR } from "../charts/colors";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

const sumAll = (byKey: Record<string, Record<number, number>>) =>
  Object.values(byKey).reduce((acc, m) => acc + sumMonthlyMap(m), 0);

export default function RevenueTab({
  data,
  clientNameById,
  fileLabel,
}: {
  data: ScopeForecastData;
  clientNameById: Record<string, string>;
  fileLabel?: string;
}) {
  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;
  if (data.revenue.totalAnnual === 0) {
    return (
      <EmptyDataNotice message="No revenue has been entered for the selected clients, year and submission yet." />
    );
  }

  const { revenue, media } = data;
  const streams = revenue.byStream.filter((s) => s.annual > 0);
  const ratio = media.totalAnnual > 0 ? revenue.totalAnnual / media.totalAnnual : null;

  // Per-client Revenue / Media ratios, for the best/worst lists. Only clients
  // with media spend (a non-zero denominator) qualify.
  const revByClient = new Map(
    data.revenueByClient.map((r) => [r.clientId, sumAll(r.byStream)])
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={DollarSign}
          label="Total revenue"
          value={formatCompactMoney(revenue.totalAnnual)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
        />
        <StatCard
          icon={BarChart3}
          label="Total media spend"
          value={formatCompactMoney(media.totalAnnual)}
          accent="text-indigo-500"
        />
        <StatCard
          icon={Percent}
          label="Revenue / Media"
          value={ratio !== null ? formatPct(ratio) : "—"}
          sub="revenue per $ of media spend"
          accent="text-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Revenue mix"
          subtitle="Annual revenue by stream"
          icon={Layers}
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

        <ChartCard
          title="Revenue by stream"
          subtitle="Annual total per stream"
          icon={DollarSign}
        >
          <BarList
            items={streams.map((s) => ({
              label: s.label,
              value: s.annual,
              color: s.color,
              hint:
                revenue.totalAnnual > 0
                  ? `${Math.round((s.annual / revenue.totalAnnual) * 100)}%`
                  : undefined,
            }))}
            valueFormat={formatCompactMoney}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Monthly revenue by stream"
        subtitle="Each bar is a month's total BL revenue, split by stream"
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
        revenueByClient={data.revenueByClient}
        clientNameById={clientNameById}
        fileLabel={fileLabel}
      />
    </div>
  );
}
