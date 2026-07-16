//# filepath: components/dashboard/tabs/labs-tab.tsx
"use client";

/**
 * Labs tab — the Labs/Media penetration story:
 * • KPI strip (share rate, partners, channels over cap)
 * • Labs share % by month (area, with the 25% target line)
 * • Labs share by media type (bars) · Spend by partner (bars)
 * • Recap table by media type
 * * Updated to accept `comparisonData` and calculate variance for the StatCards.
 */

import { FlaskConical, Percent, Users, AlertTriangle, CalendarRange, TrendingUp } from "lucide-react";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import { computeVariance } from "../../../lib/types/forecaster.types";
import { MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import { MEDIA_TYPE_COLORS, LABS_COLOR } from "../charts/colors";
import StatCard, { type StatVariance } from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import BarList from "../charts/bar-list";
import TrendChart from "../charts/trend-chart";
import LabsRecapTable from "../labs-recap-table";
import LabsDataTable from "../labs-data-table";
import DimensionBreakdown, {
  type ClientDimensions,
} from "../dimension-breakdown";
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

export default function LabsTab({
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
  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;

  const { labs } = data;
  if (labs.totalLabs === 0 && labs.totalPlanned === 0) {
    return <EmptyDataNotice message="No Labs or media spend has been entered for this scope yet." />;
  }

  const compLabs = comparisonData.hasContext ? comparisonData.labs : null;

  const target = labs.targetRatio;
  const onTarget = labs.ratio !== null && labs.ratio >= target;

  const partnersWithSpend = labs.byType.reduce(
    (acc, t) => acc + t.partners.filter((p) => p.annual > 0).length,
    0
  );
  
  const compPartnersWithSpend = compLabs?.byType.reduce(
    (acc, t) => acc + t.partners.filter((p) => p.annual > 0).length,
    0
  );

  const overCount = labs.byType.filter((t) => t.over).length;
  const compOverCount = compLabs?.byType.filter((t) => t.over).length;

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

  // Annual BL Labs spend per client (summed across partners), for the
  // Region / Business Lead breakdowns.
  const labsTotalByClient = new Map<string, number>();
  for (const r of data.labsDetail) {
    labsTotalByClient.set(
      r.clientId,
      (labsTotalByClient.get(r.clientId) ?? 0) + r.total
    );
  }
  const clientTotals = [...labsTotalByClient.entries()].map(
    ([clientId, total]) => ({ clientId, total })
  );

  // Top clients by Labs spend, and by Labs share (labs / planned media, per
  // client — only clients with media to compare against qualify).
  const mediaTotalByClient = new Map(
    data.mediaByClient.map((m) => [
      m.clientId,
      Object.values(m.byType).reduce((acc, mm) => acc + sumMonthlyMap(mm), 0),
    ])
  );
  const topLabsClients = clientTotals
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((c) => {
      const media = mediaTotalByClient.get(c.clientId) ?? 0;
      return {
        label: clientNameById[c.clientId] ?? c.clientId,
        value: c.total,
        color: LABS_COLOR,
        hint: media > 0 ? formatPct(c.total / media) : undefined,
      };
    });
  const topShareClients = clientTotals
    .map((c) => {
      const media = mediaTotalByClient.get(c.clientId) ?? 0;
      return {
        clientId: c.clientId,
        labsTotal: c.total,
        mediaTotal: media,
        share: media > 0 ? c.total / media : null,
      };
    })
    .filter((c): c is typeof c & { share: number } => c.share !== null && c.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 10)
    .map((c) => ({
      label: clientNameById[c.clientId] ?? c.clientId,
      value: c.share,
      color: LABS_COLOR,
      hint: `${formatCompactMoney(c.labsTotal)} / ${formatCompactMoney(c.mediaTotal)}`,
    }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FlaskConical}
          label="Total Labs spend"
          value={formatCompactMoney(labs.totalLabs)}
          sub={`${data.clientsWithData} of ${data.clientCount} clients with data`}
          variance={getVariance(labs.totalLabs, compLabs?.totalLabs)}
        />
        <StatCard
          icon={Percent}
          label="Share rate"
          value={formatPct(labs.ratio)}
          sub={`Target ${formatPct(target)}`}
          accent={onTarget ? "text-emerald-500" : "text-yellow-500"}
          variance={getVariance(labs.ratio ?? 0, compLabs?.ratio ?? 0, true, "pct")}
        />
        <StatCard
          icon={Users}
          label="Active partners"
          value={String(partnersWithSpend)}
          sub="with spend in scope"
          accent="text-indigo-500"
          variance={getVariance(partnersWithSpend, compPartnersWithSpend, true, "raw")}
        />
        <StatCard
          icon={AlertTriangle}
          label="Channels over cap"
          value={String(overCount)}
          sub="Labs above planned media"
          accent={overCount > 0 ? "text-red-500" : "text-gray-400"}
          variance={getVariance(overCount, compOverCount, false, "raw")}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Top 10 clients by Labs spend"
          subtitle="Annual BL Labs spend per client · share of their media"
          icon={TrendingUp}
        >
          {topLabsClients.length > 0 ? (
            <BarList items={topLabsClients} valueFormat={formatCompactMoney} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client Labs spend in scope.
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Top 10 clients by Labs share"
          subtitle="Labs spend as a share of the client's planned media"
          icon={Percent}
        >
          {topShareClients.length > 0 ? (
            <BarList items={topShareClients} valueFormat={(v) => formatPct(v)} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No client with both Labs and media spend in scope.
            </p>
          )}
        </ChartCard>
      </div>

      <DimensionBreakdown
        totalsByClient={clientTotals}
        dimensions={clientDimensions}
        metricLabel="BL Labs spend"
        shareDenominator={{
          totalsByClient: [...mediaTotalByClient.entries()].map(
            ([clientId, total]) => ({ clientId, total })
          ),
          label: "Labs share of media spend",
        }}
      />

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