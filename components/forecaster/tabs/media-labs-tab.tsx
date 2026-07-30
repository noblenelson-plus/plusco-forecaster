// components/forecaster/tabs/media-labs-tab.tsx
"use client";

/**
 * Media & Labs tab for the Forecaster dashboard. Composes the section blocks in
 * display order: strategy KPIs, the per-client detail table, then the Total
 * Media, Digital Media and Labs sections. Purely presentational — receives the
 * already-aggregated primary and variant scope data plus the in-scope client
 * ids (so the detail table can show the full roster, including $0 clients).
 *
 * When a client is focused, every block except the detail table reads from the
 * single-client scope. The table itself keeps all rows and highlights the
 * focused one, so it stays usable for switching between clients.
 */

import { Loader2 } from "lucide-react";
import StrategyKpisSection from "../sections/strategy-kpis-section";
import ClientDetailTable from "../sections/client-detail-table";
import TotalMediaSection from "../sections/total-media-section";
import DigitalMediaSection from "../sections/digital-media-section";
import LabsSection from "../sections/labs-section";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function MediaLabsTab({
  data,
  comparisonData,
  scopedClientIds,
  focusData,
  focusComparisonData,
  focusedClientId,
  focusLoading,
  onFocusChange,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  /** Single-client scope data. Empty unless a client is focused. */
  focusData: ScopeForecastData;
  focusComparisonData: ScopeForecastData;
  focusedClientId: string | null;
  focusLoading: boolean;
  onFocusChange: (clientId: string | null) => void;
}) {
  // Charts and KPIs follow the focus; the detail table never does.
  const shown = focusedClientId ? focusData : data;
  const shownComparison = focusedClientId ? focusComparisonData : comparisonData;

  return (
    <div className="space-y-8">
      <div className="relative">
        <StrategyKpisSection data={shown} comparisonData={shownComparison} />
        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <ClientDetailTable
        data={data}
        comparisonData={comparisonData}
        scopedClientIds={scopedClientIds}
        focusedClientId={focusedClientId}
        onFocusChange={onFocusChange}
      />

      <div className="relative space-y-8">
        <TotalMediaSection data={shown} comparisonData={shownComparison} />
        <DigitalMediaSection data={shown} comparisonData={shownComparison} />
<LabsSection
          data={shown}
          comparisonData={shownComparison}
          scopedClientIds={scopedClientIds}
          focusedClientId={focusedClientId}
        />        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}