// components/forecaster/tabs/labs-tab.tsx
"use client";

/**
 * Labs tab. Two sub-tabs, since both halves are equally important and the
 * pacing table was previously buried below the fold:
 *   - Labs spend  — the per-client detail table (opening on its Labs preset,
 *     so you can focus a client), the Labs section, and a scope-wide
 *     "By client" chart filterable by Labs partner.
 *   - Labs pacing — the Target vs Booked by partner table, surfaced up top.
 *
 * The Clients table lives on Labs spend only: it drives client focus for the
 * Labs section, whereas pacing is scope-wide and ignores focus. Focus still
 * persists in the background when switching sub-tabs.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ClientDetailTable from "../sections/client-detail-table";
import LabsSection from "../sections/labs-section";
import LabsPacingSection from "../sections/labs-pacing-section";
import ClientSpendChart from "../../dashboard/client-spend-chart";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Currency } from "../../../lib/types/client.types";

type LabsSubTab = "spend" | "pacing";

const SUBTABS: { id: LabsSubTab; label: string }[] = [
  { id: "spend", label: "Labs spend" },
  { id: "pacing", label: "Labs pacing" },
];

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
  currencyByClient,
  usdToCad,
  selMonths,
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
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  selMonths: number[];
}) {
  const [sub, setSub] = useState<LabsSubTab>("spend");

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
    <div className="space-y-6">
      {/* Sub-tab bar — matches the Reports / Executive KPIs sub-tab strip. */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUBTABS.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === "spend" && (
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
      )}

      {sub === "pacing" && (
        <div data-scroll-section data-scroll-label="Labs pacing">
          <LabsPacingSection
            scopedClientIds={scopedClientIds}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
            selMonths={selMonths}
          />
        </div>
      )}
    </div>
  );
}