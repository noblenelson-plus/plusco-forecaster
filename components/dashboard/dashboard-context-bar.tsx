// components/dashboard/dashboard-context-bar.tsx
"use client";

/**
 * Dashboard time/context bar — Year + RFQ only. The client scope lives in the
 * separate multi-select filter bar, so the single-client selector is hidden
 * here via ForecastSelectors' `fields` prop.
 *
 * It also carries the currency indicator: the dashboard always aggregates and
 * displays amounts in CAD, converting USD clients with the year's rate.
 */

import { DollarSign, AlertTriangle } from "lucide-react";
import ForecastSelectors from "../_shared/forecast-selectors";

interface DashboardContextBarProps {
  /** USD→CAD rate applied for the selected year (undefined when none is set). */
  usdToCad?: number;
  /** Number of in-scope clients forecasting in USD (converted to CAD). */
  usdClientCount?: number;
  /** True when a USD client is in scope but no rate is configured for the year. */
  missingRate?: boolean;
}

export default function DashboardContextBar({
  usdToCad,
  usdClientCount = 0,
  missingRate = false,
}: DashboardContextBarProps = {}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50/30">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none mr-2">
        Time &amp; Context
      </span>
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
      <ForecastSelectors orientation="horizontal" theme="light" fields={["year", "rfq"]} />

      {/* Currency indicator — the dashboard always reports in CAD. */}
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
      <span
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
        title="All amounts are aggregated and displayed in CAD. USD clients are converted with the year's rate."
      >
        <DollarSign size={13} />
        All amounts in CAD
      </span>

      {usdClientCount > 0 && usdToCad != null && (
        <span className="text-xs text-gray-500">
          {usdClientCount} USD {usdClientCount > 1 ? "clients " : "client "} converted
          at 1&nbsp;USD&nbsp;=&nbsp;{usdToCad}&nbsp;CAD
        </span>
      )}

      {missingRate && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-700"
          title="No USD→CAD rate is configured for this year in Admin → Currency. USD clients are shown unconverted."
        >
          <AlertTriangle size={13} />
          Missing USD→CAD rate
        </span>
      )}
    </div>
  );
}
