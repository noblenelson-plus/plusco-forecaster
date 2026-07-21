// components/forecaster/tabs/media-labs-tab.tsx
"use client";

/**
 * Media & Labs tab for the Forecaster dashboard. Composes the section blocks in
 * display order: strategy KPIs, the per-client detail table, then the Total
 * Media, Digital Media and Labs sections. Purely presentational — receives the
 * already-aggregated primary and variant scope data and hands each what it needs.
 */

import StrategyKpisSection from "../sections/strategy-kpis-section";
import ClientDetailTable from "../sections/client-detail-table";
import TotalMediaSection from "../sections/total-media-section";
import DigitalMediaSection from "../sections/digital-media-section";
import LabsSection from "../sections/labs-section";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function MediaLabsTab({
  data,
  comparisonData,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
}) {
  return (
    <div className="space-y-8">
      <StrategyKpisSection data={data} comparisonData={comparisonData} />
      <ClientDetailTable data={data} comparisonData={comparisonData} />
      <TotalMediaSection data={data} comparisonData={comparisonData} />
      <DigitalMediaSection data={data} comparisonData={comparisonData} />
      <LabsSection data={data} comparisonData={comparisonData} />
    </div>
  );
}