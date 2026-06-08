// components/dashboard/tabs/labs-tab.tsx

/**
 * Labs tab — the Labs/Media penetration story:
 *   • Penetration rate vs the 25% target (gauge)
 *   • Labs share of total media (donut)
 *   • Coverage by channel (bars, with % of planned)
 *   • Labs vs media monthly (trend)
 */

import { FlaskConical, Percent, Users, AlertTriangle } from "lucide-react";
import { MONTHS } from "../../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import { MEDIA_TYPE_COLORS } from "../charts/colors";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import GaugeChart from "../charts/gauge-chart";
import DonutChart from "../charts/donut-chart";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function LabsTab({ data }: { data: ScopeForecastData }) {
  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;

  const { labs } = data;
  if (labs.totalLabs === 0 && labs.totalPlanned === 0) {
    return <EmptyDataNotice message="No Labs or media spend has been entered for this scope yet." />;
  }

  const target = labs.targetRatio;
  const onTarget = labs.ratio !== null && labs.ratio >= target;

  const partnersWithSpend = labs.byType.reduce(
    (acc, t) => acc + t.partners.filter((p) => p.annual > 0).length,
    0
  );
  const overCount = labs.byType.filter((t) => t.over).length;

  // Coverage bars — Labs spend per channel, captioned with % of planned media.
  const coverageItems = labs.byType
    .filter((t) => t.labsAnnual > 0 || t.plannedAnnual > 0)
    .map((t) => ({
      label: MEDIA_TYPE_LABELS[t.mediaType],
      value: t.labsAnnual,
      color: MEDIA_TYPE_COLORS[t.mediaType],
      hint: t.coverage !== null && isFinite(t.coverage)
        ? `${Math.round(t.coverage * 100)}% of planned`
        : t.labsAnnual > 0
          ? "no media planned"
          : undefined,
    }));

  const otherMedia = Math.max(0, labs.totalPlanned - labs.totalLabs);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FlaskConical}
          label="Total Labs spend"
          value={formatCompactMoney(labs.totalLabs)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
        />
        <StatCard
          icon={Percent}
          label="Share rate"
          value={formatPct(labs.ratio)}
          sub={`Target ${formatPct(target)}`}
          accent={onTarget ? "text-emerald-500" : "text-yellow-500"}
        />
        <StatCard
          icon={Users}
          label="Active partners"
          value={String(partnersWithSpend)}
          sub="with spend in scope"
          accent="text-indigo-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Channels over cap"
          value={String(overCount)}
          sub="Labs above planned media"
          accent={overCount > 0 ? "text-red-500" : "text-gray-400"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Share rate"
          subtitle="Labs spend as a share of planned media"
          icon={Percent}
        >
          <GaugeChart
            value={labs.ratio ?? 0}
            variant={onTarget ? "success" : "warning"}
            valueLabel={formatPct(labs.ratio)}
            caption={`of media · target ${formatPct(target)}`}
          />
        </ChartCard>

        <ChartCard
          title="Labs share of media"
          subtitle="Labs spend vs the rest of planned media"
          icon={FlaskConical}
        >
          <DonutChart
            segments={[
              { label: "Labs", value: labs.totalLabs, color: "#6366f1" },
              { label: "Other media", value: otherMedia, color: "#e2e8f0" },
            ]}
            centerValue={formatPct(labs.ratio)}
            centerLabel="Labs"
            valueFormat={formatCompactMoney}
          />
        </ChartCard>

        <ChartCard
          title="Coverage by channel"
          subtitle="Labs spend per channel · % of planned media"
          icon={FlaskConical}
          className="lg:col-span-2"
        >
          <BarList items={coverageItems} valueFormat={formatCompactMoney} />
        </ChartCard>

        <ChartCard
          title="Labs vs media — monthly"
          subtitle="Monthly Labs and total media spend"
          icon={Percent}
          className="lg:col-span-2"
        >
          <TrendChart
            series={[
              {
                label: "Labs",
                color: "#6366f1",
                points: monthsToPoints(data.labsMonthly),
              },
              {
                label: "Media",
                color: "#cbd5e1",
                points: monthsToPoints(data.media.monthly),
              },
            ]}
            valueFormat={formatCompactMoney}
          />
        </ChartCard>
      </div>
    </div>
  );
}
