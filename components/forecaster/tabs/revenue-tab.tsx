// components/forecaster/tabs/revenue-tab.tsx
"use client";

/**
 * Revenue tab for the Forecaster dashboard. Composes the Client Revenue section
 * (Product Revenue will stack below it later). Receives the scope data, the
 * in-scope client ids, and the primary/secondary BL/OF modes chosen in the
 * header — passing them through to the section.
 */

import ClientRevenueSection from "../sections/client-revenue-section";
import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function RevenueTab({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
}) {
  return (
    <div className="space-y-8">
      <ClientRevenueSection
        data={data}
        comparisonData={comparisonData}
        scopedClientIds={scopedClientIds}
        primaryMode={primaryMode}
        secondaryMode={secondaryMode}
      />
      {/* Product Revenue section will stack here next. */}
    </div>
  );
}