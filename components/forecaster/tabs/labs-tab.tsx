// components/forecaster/tabs/labs-tab.tsx
"use client";

/**
 * Labs tab. The per-client detail table (opening on its Labs preset) leads, so
 * you can focus a client, then the Labs section, the monthly Labs-share trend,
 * the share-by-media-type and recap cards, and the Region / Business Lead
 * breakdown (Labs spend, shown as a share of each group's planned media).
 *
 * The aggregate cards follow the client focus; the detail table and the
 * scope-wide breakdown always read the full scope.
 */

import { Loader2, CalendarRange, Percent, FlaskConical } from "lucide-react";
import StrategyKpisSection from "../sections/strategy-kpis-section";
import ClientDetailTable from "../sections/client-detail-table";
import LabsSection from "../sections/labs-section";
import ChartCard from "../../dashboard/charts/chart-card";
import TrendChart from "../../dashboard/charts/trend-chart";
import BarList from "../../dashboard/charts/bar-list";
import LabsRecapTable from "../../dashboard/labs-recap-table";
import DimensionBreakdown, {
  type ClientDimensions,
} from "../../dashboard/dimension-breakdown";
import { LABS_COLOR, MEDIA_TYPE_COLORS } from "../../dashboard/charts/colors";
import { formatCompactMoney, formatPct } from "../../dashboard/charts/format";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function LabsTab({
  data,
  comparisonData,
  scopedClientIds,
  focusData,
  focusComparisonData,
  focusedClientId,
  focusLoading,
  onFocusChange,
  clientDimensions,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  focusData: ScopeForecastData;
  focusComparisonData: ScopeForecastData;
  focusedClientId: string | null;
  focusLoading: boolean;
  onFocusChange: (clientId: string | null) => void;
  clientDimensions: ClientDimensions;
}) {
  const shown = focusedClientId ? focusData : data;
  const shownComparison = focusedClientId ? focusComparisonData : comparisonData;
  const labs = shown.labs;

  // Monthly Labs share (%): monthly Labs spend over monthly planned media.
  const labsPoints = monthsToPoints(shown.labsMonthly);
  const mediaPoints = monthsToPoints(shown.media.monthly);
  const shareByMonth = labsPoints.map((labsM, i) =>
    mediaPoints[i] > 0 ? labsM / mediaPoints[i] : 0
  );
  const target = labs.targetRatio;

  const shareByType = labs.byType
    .filter((t) => t.plannedAnnual > 0 && t.coverage !== null && isFinite(t.coverage))
    .map((t) => ({
      label: MEDIA_TYPE_LABELS[t.mediaType],
      value: t.coverage as number,
      color: MEDIA_TYPE_COLORS[t.mediaType],
      hint: formatCompactMoney(t.labsAnnual),
    }));

  // Scope-wide per-client totals for the Region / Business Lead breakdown.
  const mediaTotalsByClient = data.mediaByClient.map((cb) => ({
    clientId: cb.clientId,
    total: Object.values(cb.byType).reduce((acc, m) => acc + sumMonthlyMap(m), 0),
  }));
  const labsTotalMap = new Map<string, number>();
  for (const r of data.labsDetail) {
    labsTotalMap.set(r.clientId, (labsTotalMap.get(r.clientId) ?? 0) + r.total);
  }
  const labsTotalsByClient = [...labsTotalMap.entries()].map(
    ([clientId, total]) => ({ clientId, total })
  );

  return (
    <div className="space-y-8">
      <div data-scroll-section data-scroll-label="Strategy KPIs" className="relative">
        <StrategyKpisSection data={shown} comparisonData={shownComparison} />
        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div data-scroll-section data-scroll-label="Clients">
        <ClientDetailTable
          data={data}
          comparisonData={comparisonData}
          scopedClientIds={scopedClientIds}
          focusedClientId={focusedClientId}
          onFocusChange={onFocusChange}
          defaultView="labs"
        />
      </div>

      <div className="relative space-y-8">
        <div data-scroll-section data-scroll-label="Labs">
          <LabsSection
            data={shown}
            comparisonData={shownComparison}
            scopedClientIds={scopedClientIds}
            focusedClientId={focusedClientId}
          />
        </div>

        <div data-scroll-section data-scroll-label="Labs monthly">
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
        </div>

        <div data-scroll-section data-scroll-label="Share & recap" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            title="Recap by media type"
            subtitle="Planned media, Labs spend, share and partner count per channel"
            icon={FlaskConical}
          >
            <LabsRecapTable labs={labs} />
          </ChartCard>
        </div>

        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div data-scroll-section data-scroll-label="By region / BL">
        <DimensionBreakdown
          totalsByClient={labsTotalsByClient}
          dimensions={clientDimensions}
          metricLabel="BL Labs spend"
          shareDenominator={{ totalsByClient: mediaTotalsByClient, label: "Labs share of media spend" }}
        />
      </div>
    </div>
  );
}
