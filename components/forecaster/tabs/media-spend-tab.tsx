// components/forecaster/tabs/media-spend-tab.tsx
"use client";

/**
 * Media Spend tab. The per-client detail table (opening on its Media preset)
 * leads, then the Total Media and Digital Media sections, and a scope-wide
 * "By client" chart (filterable by media channel) at the bottom.
 *
 * The aggregate sections follow the client focus; the detail table and the
 * By-client chart always read the full scope.
 */

import { Loader2 } from "lucide-react";
import ClientDetailTable from "../sections/client-detail-table";
import TotalMediaSection from "../sections/total-media-section";
import DigitalMediaSection from "../sections/digital-media-section";
import ClientSpendChart from "../../dashboard/client-spend-chart";
import { MEDIA_TYPES, sumMonthlyMap } from "../../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const CHANNEL_OPTIONS = MEDIA_TYPES.map((t) => ({ value: t, label: MEDIA_TYPE_LABELS[t] }));

export default function MediaSpendTab({
  data,
  comparisonData,
  scopedClientIds,
  focusData,
  focusComparisonData,
  focusedClientId,
  focusLoading,
  onFocusChange,
  clientNameById,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  focusData: ScopeForecastData;
  focusComparisonData: ScopeForecastData;
  focusedClientId: string | null;
  focusLoading: boolean;
  onFocusChange: (clientId: string | null) => void;
  clientNameById: Record<string, string>;
}) {
  const shown = focusedClientId ? focusData : data;
  const shownComparison = focusedClientId ? focusComparisonData : comparisonData;

  // Scope-wide per-client spend split by channel, for the By-client chart.
  const mediaByChannel = data.mediaByClient.map((cb) => ({
    clientId: cb.clientId,
    byFacet: Object.fromEntries(
      MEDIA_TYPES.map((t) => [t, cb.byType[t] ? sumMonthlyMap(cb.byType[t]) : 0])
    ),
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

        <div data-scroll-section data-scroll-label="Digital media">
          <DigitalMediaSection data={shown} comparisonData={shownComparison} />
        </div>

        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div data-scroll-section data-scroll-label="Spend by client">
        <ClientSpendChart
          title="By client"
          metricLabel="media spend"
          filterLabel="Media channel"
          byClient={mediaByChannel}
          facetOptions={CHANNEL_OPTIONS}
          clientNameById={clientNameById}
        />
      </div>
    </div>
  );
}