// components/dashboard/tabs/labs-tab.tsx

/**
 * Labs tab — the Labs/Media penetration story:
 *   • KPI strip (share rate, partners, channels over cap)
 *   • Labs share % by month (area, with the 25% target line)
 *   • Labs share by media type (bars) · Spend by partner (bars)
 *   • Recap table by media type
 */

import { FlaskConical, Percent, Users, AlertTriangle, CalendarRange } from "lucide-react";
import { MONTHS } from "../../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import { MEDIA_TYPE_COLORS, LABS_COLOR } from "../charts/colors";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import LabsRecapTable from "../labs-recap-table";
import LabsDataTable from "../labs-data-table";
import { formatCompactMoney, formatPct } from "../charts/format";
import { LoadingTab, NoContextNotice, EmptyDataNotice } from "./tab-states";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function LabsTab({
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

  // Labs share (%) per month: monthly Labs spend over monthly planned media.
  const labsPoints = monthsToPoints(data.labsMonthly);
  const mediaPoints = monthsToPoints(data.media.monthly);
  const shareByMonth = labsPoints.map((labsM, i) =>
    mediaPoints[i] > 0 ? labsM / mediaPoints[i] : 0
  );

  // Share (coverage %) per media type — only types with planned media.
  const shareByType = labs.byType
    .filter((t) => t.plannedAnnual > 0 && t.coverage !== null && isFinite(t.coverage))
    .map((t) => ({
      label: MEDIA_TYPE_LABELS[t.mediaType],
      value: t.coverage as number,
      color: MEDIA_TYPE_COLORS[t.mediaType],
      hint: formatCompactMoney(t.labsAnnual),
    }));

  // Annual spend per partner, colored by the partner's media type, busiest first.
  const partnerSpend = labs.byType
    .flatMap((t) =>
      t.partners.map((p) => ({
        label: p.name,
        value: p.annual,
        color: MEDIA_TYPE_COLORS[t.mediaType],
      }))
    )
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);

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

      <ChartCard
        title="Labs share by month"
        subtitle="Monthly Labs spend as a share of planned media"
        icon={CalendarRange}
      >
        <TrendChart
          series={[{ label: "Share", color: LABS_COLOR, points: shareByMonth }]}
          valueFormat={(v) => formatPct(v)}
          reference={{ value: target, label: `Target ${formatPct(target)}`, color: "#94a3b8" }}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Share by media type"
          subtitle="Labs spend as a share of planned media, per channel"
          icon={Percent}
        >
          {shareByType.length > 0 ? (
            <BarList items={shareByType} valueFormat={(v) => formatPct(v)} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No planned media to compare against.
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Spend by partner"
          subtitle="Annual Labs spend per partner"
          icon={Users}
        >
          {partnerSpend.length > 0 ? (
            <BarList items={partnerSpend} valueFormat={formatCompactMoney} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No partner spend in scope.
            </p>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Recap by media type"
        subtitle="Planned media, Labs spend, share and partner count per channel"
        icon={FlaskConical}
      >
        <LabsRecapTable labs={labs} />
      </ChartCard>

      <LabsDataTable
        rows={data.labsDetail}
        clientNameById={clientNameById}
        fileLabel={fileLabel}
      />
    </div>
  );
}
