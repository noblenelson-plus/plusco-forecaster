// components/forecaster/tabs/revenue-tab.tsx
"use client";

/**
 * Revenue tab for the Forecaster dashboard. Composes the Client Revenue section
 * (Product Revenue will stack below it later). Receives the scope data, the
 * in-scope client ids, and the primary/secondary BL/OF modes chosen in the
 * header — passing them through to the section.
 *
 * Focus is shared page state: clicking a row here highlights it and carries the
 * selection to the other tabs. There are no charts under this table yet, so the
 * scope data itself is not narrowed.
 */

import ClientRevenueSection from "../sections/client-revenue-section";
import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function RevenueTab({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
  focusedClientId,
  onFocusChange,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
}) {
  return (
    <div className="space-y-8">
      <ClientRevenueSection
        data={data}
        comparisonData={comparisonData}
        scopedClientIds={scopedClientIds}
        primaryMode={primaryMode}
        secondaryMode={secondaryMode}
        focusedClientId={focusedClientId}
        onFocusChange={onFocusChange}
      />
      {/* Product Revenue section will stack here next. */}
    </div>
  );
}