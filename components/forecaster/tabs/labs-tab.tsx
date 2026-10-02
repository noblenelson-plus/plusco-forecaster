// components/forecaster/tabs/labs-tab.tsx
"use client";

/**
 * Labs tab (Forecaster → Labs): Labs spend — the per-client detail table
 * (opening on its Labs preset, so you can focus a client), the Labs section,
 * and a scope-wide "By client" chart filterable by Labs partner. Labs pacing
 * has its own top-level dashboard tab, so it is not repeated here.
 */

import { Loader2 } from "lucide-react";
import ClientDetailTable from "../sections/client-detail-table";
import LabsSection from "../sections/labs-section";
import ClientSpendChart from "../../dashboard/client-spend-chart";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

export default function LabsTab({
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

  // Scope-wide per-client Labs spend split by partner, for the By-client chart.
  const partnerNameById: Record<string, string> = {};
  const byClientMap = new Map<string, Record<string, number>>();
  for (const r of data.labsDetail) {
    partnerNameById[r.partnerId] = r.partnerName;
    const byFacet = byClientMap.get(r.clientId) ?? {};
    byFacet[r.partnerId] = (byFacet[r.partnerId] ?? 0) + r.total;
    byClientMap.set(r.clientId, byFacet);
  }
  const labsByPartner = [...byClientMap.entries()].map(([clientId, byFacet]) => ({
    clientId,
    byFacet,
  }));
  const partnerOptions = Object.entries(partnerNameById)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-8">
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

        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div data-scroll-section data-scroll-label="Spend by client">
        <ClientSpendChart
          title="By client"
          metricLabel="Labs spend"
          filterLabel="Labs partner"
          byClient={labsByPartner}
          facetOptions={partnerOptions}
          clientNameById={clientNameById}
        />
      </div>
    </div>
  );
}
