// components/forecaster/sections/exec-kpis-tabs.tsx
"use client";

/**
 * Executive KPIs — sub-tab container. Splits the (formerly very long) Exec KPIs
 * page into navigable sub-pages so each area reads on its own:
 *   Executive Summary · Investment Strategy KPIs · Meta · Billups · Local Media
 *
 * Summary and Billups take the page's forecast scope (dashboard filters +
 * currency already applied). Investment Strategy KPIs, Meta and Billups are all
 * scoped by the same global scopedClientIds, so one filter bar drives every
 * sub-page. Local Media is a placeholder for now.
 */

import { useState } from "react";
import ExecutiveSummarySection from "./executive-summary-section";
import InvestmentKpisSection from "./investment-kpis-section";
import BillupsSection from "./billups-section";
import MetaSection from "./meta-section";
import LabsPacingSection from "./labs-pacing-section";
import LabsTargetVsBookedSection from "./labs-target-vs-booked-section";
import type { Client, Currency } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import {
  EXEC_KPIS_SUBTABS,
  visibleSubtabs,
  type ExecSubTab,
} from "../dashboard-pages.config";


const NO_HIDDEN: ReadonlySet<string> = new Set();

/** Placeholder for sub-pages not built yet. */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
      {label} — coming soon
    </div>
  );
}

export default function ExecKpisTabs({
  forecastData,
  comparisonData,
  clients,
  usersMap,
    scopedClientIds,
  year,
  rfqLabel,
  currencyByClient,
  usdToCad,
  hidden = NO_HIDDEN,
}: {
  forecastData: ScopeForecastData;
  comparisonData: ScopeForecastData;
  clients: Client[];
  usersMap: Map<string, string>;
    scopedClientIds: string[];
  year: number;
  rfqLabel?: string;
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  /** Page ids hidden by an admin (Admin → Dashboard Pages). */
  hidden?: ReadonlySet<string>;
}) {
  const [sub, setSub] = useState<ExecSubTab>("summary");
  const subtabs = visibleSubtabs("exec-kpis", EXEC_KPIS_SUBTABS, hidden);
  // If an admin hid the chosen sub-tab, show the first visible one instead.
  const active = subtabs.some((t) => t.id === sub) ? sub : (subtabs[0]?.id ?? sub);

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — a lighter, secondary strip under the main purple tabs. */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {subtabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active sub-page */}
      {active === "summary" && (
        <ExecutiveSummarySection
          forecastData={forecastData}
          comparisonData={comparisonData}
          clients={clients}
          usersMap={usersMap}
          scopedClientIds={scopedClientIds}
          year={year}
        />
      )}

      {active === "investment" && (
        <InvestmentKpisSection scopedClientIds={scopedClientIds} />
      )}

            {active === "meta" && <MetaSection scopedClientIds={scopedClientIds} />}

            {active === "labs-pacing" && (
        <div className="space-y-8">
          <LabsTargetVsBookedSection
            scopedClientIds={scopedClientIds}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
          />
          <LabsPacingSection
            scopedClientIds={scopedClientIds}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
            showPodBreakdown
          />
        </div>
      )}

      {active === "billups" && (
        <BillupsSection
          forecastData={forecastData}
          comparisonData={comparisonData}
          clients={clients}
          usersMap={usersMap}
          scopedClientIds={scopedClientIds}
          year={year}
          rfqLabel={rfqLabel}
        />
      )}

      {active === "local-media" && <ComingSoon label="Local Media" />}
    </div>
  );
}
