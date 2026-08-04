// components/forecaster/tabs/revenue-tab.tsx
"use client";

/**
 * Revenue tab — Client Revenue, Revenue Types, then Product Revenue, with a
 * revenue-types filter at the top that narrows the whole page.
 *
 * Two shared page states drive this tab:
 *  - selectedStreams: the revenue-types filter. Threaded into every section, so
 *    deselecting a type lowers the client tables and the Revenue Types split.
 *  - focusedClientId: the clicked client. The Revenue Types section (charts +
 *    totals) reads the single-client scope when focused; the client tables keep
 *    every row and just highlight the focused one, so they stay navigable.
 *
 * Order: main revenue table, the revenue-types breakdown, then product revenue
 * last (per Adriana's layout).
 */

import { Loader2 } from "lucide-react";
import ClientRevenueSection from "../sections/client-revenue-section";
import RevenueTypesSection from "../sections/revenue-types-section";
import ProductRevenueSection from "../sections/product-revenue-section";
import RevenueTypesFilter from "../sections/revenue-types-filter";
import type { StreamSlice } from "../../../lib/dashboard/data/aggregate";
import type { Currency } from "../../../lib/types/client.types";
import type {
  ScopeForecastData,
  RevenueMode,
} from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function RevenueTab({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
  focusData,
  focusComparisonData,
  focusedClientId,
  onFocusChange,
  streamSlices,
  selectedStreams,
  onStreamsChange,
  currencyByClient,
  usdToCad,
  comparisonUsdToCad,
  selMonths,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  /** Single-client scope data. Empty unless a client is focused. */
  focusData: ScopeForecastData;
  focusComparisonData: ScopeForecastData;
  focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
  /** Raw primary stream slices, for the filter's pill list. */
  streamSlices: StreamSlice[];
  selectedStreams: ReadonlySet<string>;
  onStreamsChange: (next: Set<string>) => void;
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  comparisonUsdToCad?: number;
  selMonths: number[];
}) {
  // The Revenue Types section (charts + totals) follows the focus; the client
  // tables never do — they stay full so you can switch between clients.
  const shown = focusedClientId ? focusData : data;
  const shownComparison = focusedClientId ? focusComparisonData : comparisonData;
  const focusLoading =
    !!focusedClientId && (focusData.loading || focusComparisonData.loading);

  return (
    <div className="space-y-8">
      <RevenueTypesFilter
        slices={streamSlices}
        selected={selectedStreams}
        onChange={onStreamsChange}
      />

      <ClientRevenueSection
        data={data}
        comparisonData={comparisonData}
        scopedClientIds={scopedClientIds}
        primaryMode={primaryMode}
        secondaryMode={secondaryMode}
        focusedClientId={focusedClientId}
        onFocusChange={onFocusChange}
        selectedStreams={selectedStreams}
      />

      <div className="relative">
        <RevenueTypesSection
          data={shown}
          comparisonData={shownComparison}
          primaryMode={primaryMode}
          secondaryMode={secondaryMode}
          selectedStreams={selectedStreams}
        />
        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <ProductRevenueSection
        scopedClientIds={scopedClientIds}
        primaryMode={primaryMode}
        secondaryMode={secondaryMode}
        focusedClientId={focusedClientId}
        onFocusChange={onFocusChange}
        selectedStreams={selectedStreams}
        currencyByClient={currencyByClient}
        usdToCad={usdToCad}
        comparisonUsdToCad={comparisonUsdToCad}
        selMonths={selMonths}
      />
    </div>
  );
}