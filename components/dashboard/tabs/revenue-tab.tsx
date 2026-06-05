// components/dashboard/tabs/revenue-tab.tsx

/**
 * Revenue tab — KPIs plus a stream mix (donut), per-stream comparison (bars)
 * and a monthly revenue trend (area). The Revenue axis is still being rolled
 * out, so an empty scope shows a gentle notice rather than blank charts.
 */

import { DollarSign, Layers, CalendarRange } from "lucide-react";
import { MONTHS } from "../../../lib/types/common.types";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import { ACCENT } from "../charts/colors";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function RevenueTab({ data }: { data: ScopeForecastData }) {
  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;
  if (data.revenue.totalAnnual === 0) {
    return (
      <EmptyDataNotice message="No revenue has been entered for the selected clients, year and submission yet." />
    );
  }

  const { revenue } = data;
  const streams = revenue.byStream.filter((s) => s.annual > 0);
  const top = [...streams].sort((a, b) => b.annual - a.annual)[0];

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
          icon={Layers}
          label="Top stream"
          value={top ? top.label : "—"}
          sub={
            top
              ? `${formatCompactMoney(top.annual)} · ${formatPct(
                  top.annual / revenue.totalAnnual
                )}`
              : undefined
          }
          accent="text-indigo-500"
        />
        <StatCard
          icon={CalendarRange}
          label="Avg / month"
          value={formatCompactMoney(revenue.totalAnnual / 12)}
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

        <ChartCard
          title="Monthly revenue"
          subtitle="Total revenue by month"
          icon={CalendarRange}
          className="lg:col-span-2"
        >
          <TrendChart
            series={[
              {
                label: "Revenue",
                color: ACCENT,
                points: monthsToPoints(revenue.monthly),
              },
            ]}
            valueFormat={formatCompactMoney}
          />
        </ChartCard>
      </div>
    </div>
  );
}
