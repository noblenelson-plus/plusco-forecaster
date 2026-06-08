// components/dashboard/tabs/media-spend-tab.tsx

/**
 * Media Spend tab — headline KPIs over a mix of charts:
 *   • Channel mix (donut)        • Digital share of media (gauge)
 *   • Digital channel detail (bars)  • Digital vs traditional monthly (trend)
 * then a per-client / per-media-type data table with CSV export.
 */

import {
  TrendingUp,
  Percent,
  Monitor,
  Building2,
} from "lucide-react";
import { MONTHS } from "../../../lib/types/common.types";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import GaugeChart from "../charts/gauge-chart";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import MediaDataTable from "../media-data-table";
import { DIGITAL_COLOR, TRADITIONAL_COLOR } from "../charts/colors";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function MediaSpendTab({
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
  if (data.media.totalAnnual === 0) return <EmptyDataNotice />;

  const { media } = data;
  const channels = media.byChannel.filter((c) => c.annual > 0);
  const digitalChannels = channels.filter((c) => c.digital);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Total media spend"
          value={formatCompactMoney(media.totalAnnual)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
        />
        <StatCard
          icon={Percent}
          label="Digital share"
          value={formatPct(media.digitalShare)}
          sub="SEM · Social · Prog · Direct"
          accent="text-indigo-500"
        />
        <StatCard
          icon={Monitor}
          label="Digital spend"
          value={formatCompactMoney(media.digitalAnnual)}
          accent="text-indigo-500"
        />
        <StatCard
          icon={Building2}
          label="Traditional spend"
          value={formatCompactMoney(media.traditionalAnnual)}
          sub="OOH · Print · TV · Radio"
          accent="text-gray-400"
        />
      </div>

      {/* Asymmetric 5-col grid: donut 60% / gauge 40% on top, bars 40% /
          trend 60% below — every chart sits at 40–60%, no full-width gaps. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <ChartCard
          title="Channel mix"
          subtitle="Annual BL spend by media channel"
          icon={TrendingUp}
          className="lg:col-span-3"
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
          title="Digital share of media"
          subtitle="Share of total media in digital channels"
          icon={Percent}
          className="lg:col-span-2"
        >
          <GaugeChart
            value={media.digitalShare ?? 0}
            variant="indigo"
            valueLabel={formatPct(media.digitalShare)}
            caption="of media is digital"
          />
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

      <MediaDataTable
        mediaByClient={data.mediaByClient}
        clientNameById={clientNameById}
        fileLabel={fileLabel}
      />
    </div>
  );
}
