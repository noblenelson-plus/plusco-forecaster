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
import type { Client } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

type ExecSubTab =
  | "summary"
  | "investment"
  | "meta"
  | "billups"
  | "local-media";

const SUBTABS: { id: ExecSubTab; label: string }[] = [
  { id: "summary", label: "Executive Summary" },
  { id: "investment", label: "Investment Strategy KPIs" },
  { id: "meta", label: "Meta" },
  { id: "billups", label: "Billups" },
  { id: "local-media", label: "Local Media" },
];

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
}: {
  forecastData: ScopeForecastData;
  comparisonData: ScopeForecastData;
  clients: Client[];
  usersMap: Map<string, string>;
  scopedClientIds: string[];
  year: number;
  rfqLabel?: string;
}) {
  const [sub, setSub] = useState<ExecSubTab>("summary");

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — a lighter, secondary strip under the main purple tabs. */}
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

      {/* Active sub-page */}
      {sub === "summary" && (
        <ExecutiveSummarySection
          forecastData={forecastData}
          comparisonData={comparisonData}
          clients={clients}
          usersMap={usersMap}
          scopedClientIds={scopedClientIds}
          year={year}
        />
      )}

      {sub === "investment" && (
        <InvestmentKpisSection scopedClientIds={scopedClientIds} />
      )}

      {sub === "meta" && <MetaSection scopedClientIds={scopedClientIds} />}

      {sub === "billups" && (
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

      {sub === "local-media" && <ComingSoon label="Local Media" />}
    </div>
  );
}
