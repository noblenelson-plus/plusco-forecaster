//# filepath: components/dashboard/tabs/media-spend-tab.tsx
"use client";

/**
 * Media Spend tab — headline KPIs over a mix of charts:
 * • Channel mix (donut)          • Top 10 clients by spend, by type (stacked)
 * • Digital channel detail (bars)  • Digital vs traditional monthly (trend)
 * then a per-client / per-media-type data table with CSV export.
 * * Updated to accept `comparisonData` and calculate variance for the StatCards.
 */

import {
  TrendingUp,
  Percent,
  Monitor,
  Building2,
  BarChart3,
  Users,
} from "lucide-react";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import { computeVariance } from "../../../lib/types/forecaster.types";
import StatCard, { type StatVariance } from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import StackedBarChart from "../charts/stacked-bar-chart";
import HorizontalStackedBar from "../charts/horizontal-stacked-bar";
import MediaDataTable from "../media-data-table";
import { DIGITAL_COLOR, TRADITIONAL_COLOR } from "../charts/colors";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

/**
 * Helper to compute and format the variance for the StatCards.
 */
function getVariance(
  current: number,
  reference: number | null | undefined,
  favorableUp: boolean = true,
  isPct: boolean = false
): StatVariance | null {
  if (reference == null || reference === 0) return null;
  
  const v = computeVariance(current, reference);
  if (v.absolute === 0) return { pillLabel: "0%", isFavorable: true, absoluteLabel: "0" };

  const up = v.absolute > 0;
  const isFavorable = up === favorableUp;
  const rel = v.relative !== null ? Math.round(v.relative) : 0;
  const pillLabel = rel > 0 ? `+${rel}%` : `${rel}%`;

  const absFormatted = isPct ? formatPct(v.absolute) : formatCompactMoney(v.absolute);
  const absoluteLabel = up ? `+${absFormatted}` : absFormatted.replace("-", "−");

  return { pillLabel, isFavorable, absoluteLabel };
}

export default function MediaSpendTab({
  data,
  comparisonData,
  clientNameById,
  fileLabel,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  clientNameById: Record<string, string>;
  fileLabel?: string;
}) {
  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;
  if (data.media.totalAnnual === 0) return <EmptyDataNotice />;

  const { media } = data;
  const compMedia = comparisonData.hasContext ? comparisonData.media : null;

  const channels = media.byChannel.filter((c) => c.annual > 0);
  const digitalChannels = channels.filter((c) => c.digital);

  // Top 10 spending clients, each broken down by media type for the stacked bar.
  const clientSpendSeries = media.byChannel.map((c) => ({
    key: c.mediaType,
    label: c.label,
    color: c.color,
  }));
  const topClients = data.mediaByClient
    .map((cb) => {
      const values: Record<string, number> = {};
      let total = 0;
      for (const c of media.byChannel) {
        const v = cb.byType[c.mediaType] ? sumMonthlyMap(cb.byType[c.mediaType]) : 0;
        values[c.mediaType] = v;
        total += v;
      }
      return { label: clientNameById[cb.clientId] ?? cb.clientId, total, values };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Total media spend"
          value={formatCompactMoney(media.totalAnnual)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
          variance={getVariance(media.totalAnnual, compMedia?.totalAnnual)}
        />
        <StatCard
          icon={Percent}
          label="Digital share"
          value={formatPct(media.digitalShare)}
          sub="SEM · Social · Prog · Direct"
          accent="text-indigo-500"
          variance={getVariance(media.digitalShare ?? 0, compMedia?.digitalShare ?? 0, true, true)}
        />
        <StatCard
          icon={Monitor}
          label="Digital spend"
          value={formatCompactMoney(media.digitalAnnual)}
          accent="text-indigo-500"
          variance={getVariance(media.digitalAnnual, compMedia?.digitalAnnual)}
        />
        <StatCard
          icon={Building2}
          label="Traditional spend"
          value={formatCompactMoney(media.traditionalAnnual)}
          sub="OOH · Print · TV · Radio"
          accent="text-gray-400"
          variance={getVariance(media.traditionalAnnual, compMedia?.traditionalAnnual)}
        />
      </div>

      {/* Asymmetric 5-col grid: donut 40% / top-clients 60% on top, bars 40% /
          trend 60% below — every chart sits at 40–60%, no full-width gaps. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <ChartCard
          title="Channel mix"
          subtitle="Annual BL spend by media channel"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          <DonutChart
            segments={channels.map((c) => ({
              label: c.label,
              value: c.annual,
              color: c.color,
            }))}
            centerValue={formatCompactMoney(media.totalAnnual)}
            centerLabel="Total"
            valueFormat={formatCompactMoney}
          />
        </ChartCard>

        <ChartCard
          title="Top 10 clients by spend"
          subtitle="Largest BL media spenders, split by media type"
          icon={Users}
          className="lg:col-span-3"
        >
          {topClients.length > 0 ? (
            <HorizontalStackedBar
              series={clientSpendSeries}
              rows={topClients}
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client spend in scope.
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Digital channels"
          subtitle="Spend per digital channel · share of total media"
          icon={Monitor}
          className="lg:col-span-2"
        >
          {digitalChannels.length > 0 ? (
            <BarList
              items={digitalChannels.map((c) => ({
                label: c.label,
                value: c.annual,
                color: c.color,
                hint:
                  media.totalAnnual > 0
                    ? `${Math.round((c.annual / media.totalAnnual) * 100)}%`
                    : undefined,
              }))}
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-gray-400">
              No digital spend in scope.
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Monthly spend — digital vs traditional"
          subtitle="BL media spend by month"
          icon={TrendingUp}
          className="lg:col-span-3"
        >
          <TrendChart
            series={[
              {
                label: "Digital",
                color: DIGITAL_COLOR,
                points: monthsToPoints(media.digitalMonthly),
              },
              {
                label: "Traditional",
                color: TRADITIONAL_COLOR,
                points: monthsToPoints(media.traditionalMonthly),
              },
            ]}
            valueFormat={formatCompactMoney}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Monthly spend by media type"
        subtitle="Each bar is a month's total BL spend, split by channel"
        icon={BarChart3}
      >
        <StackedBarChart
          series={media.byChannel.map((c) => ({
            label: c.label,
            color: c.color,
            points: monthsToPoints(media.monthlyByType[c.mediaType]),
          }))}
          valueFormat={formatCompactMoney}
        />
      </ChartCard>

      <MediaDataTable
        mediaByClient={data.mediaByClient}
        clientNameById={clientNameById}
        fileLabel={fileLabel}
      />
    </div>
  );
}