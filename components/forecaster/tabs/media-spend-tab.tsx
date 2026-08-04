// components/forecaster/tabs/media-spend-tab.tsx
"use client";

/**
 * Media Spend tab. The per-client detail table (opening on its Media preset)
 * leads, then the Total Media and Digital Media sections, the monthly media
 * trends and the Region / Business Lead breakdown.
 *
 * The aggregate sections follow the client focus; the detail table and the
 * scope-wide Region / Business Lead breakdown always read the full scope.
 */

import { Loader2, TrendingUp, BarChart3 } from "lucide-react";
import ClientDetailTable from "../sections/client-detail-table";
import TotalMediaSection from "../sections/total-media-section";
import DigitalMediaSection from "../sections/digital-media-section";
import ChartCard from "../../dashboard/charts/chart-card";
import TrendChart from "../../dashboard/charts/trend-chart";
import StackedBarChart from "../../dashboard/charts/stacked-bar-chart";
import DimensionBreakdown, {
  type ClientDimensions,
} from "../../dashboard/dimension-breakdown";
import { DIGITAL_COLOR, TRADITIONAL_COLOR } from "../../dashboard/charts/colors";
import { formatCompactMoney } from "../../dashboard/charts/format";
import { MONTHS, sumMonthlyMap } from "../../../lib/types/common.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const monthsToPoints = (m: Record<number, number>) => MONTHS.map((k) => m[k] ?? 0);

export default function MediaSpendTab({
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
  const media = shown.media;

  const mediaTotalsByClient = data.mediaByClient.map((cb) => ({
    clientId: cb.clientId,
    total: Object.values(cb.byType).reduce((acc, m) => acc + sumMonthlyMap(m), 0),
  }));

  return (
    <div className="space-y-8">
      <div data-scroll-section data-scroll-label="Clients">
        <ClientDetailTable
          data={data}
          comparisonData={comparisonData}
          scopedClientIds={scopedClientIds}
          focusedClientId={focusedClientId}
          onFocusChange={onFocusChange}
          defaultView="media"
        />
      </div>

      <div className="relative space-y-8">
        <div data-scroll-section data-scroll-label="Total media">
          <TotalMediaSection data={shown} comparisonData={shownComparison} />
        </div>

        {/* Total-media breakdown sits right under Total Media so it clearly
            belongs to it (always scope-wide, whatever the focus). */}
        <div data-scroll-section data-scroll-label="By region / BL">
          <DimensionBreakdown
            totalsByClient={mediaTotalsByClient}
            dimensions={clientDimensions}
            metricLabel="BL media spend"
          />
        </div>

        <div data-scroll-section data-scroll-label="Monthly trends" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
            title="Monthly spend — digital vs traditional"
            subtitle="BL media spend by month"
            icon={TrendingUp}
          >
            <TrendChart
              series={[
                { label: "Digital", color: DIGITAL_COLOR, points: monthsToPoints(media.digitalMonthly) },
                { label: "Traditional", color: TRADITIONAL_COLOR, points: monthsToPoints(media.traditionalMonthly) },
              ]}
              valueFormat={formatCompactMoney}
            />
          </ChartCard>

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
        </div>

        <div data-scroll-section data-scroll-label="Digital media">
          <DigitalMediaSection data={shown} comparisonData={shownComparison} />
        </div>

        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
