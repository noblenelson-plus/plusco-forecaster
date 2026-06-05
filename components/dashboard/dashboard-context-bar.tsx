// components/dashboard/dashboard-context-bar.tsx
"use client";

/**
 * Dashboard time/context bar — Year + RFQ only. The client scope lives in the
 * separate multi-select filter bar, so the single-client selector is hidden
 * here via ForecastSelectors' `fields` prop.
 */

import ForecastSelectors from "../_shared/forecast-selectors";

export default function DashboardContextBar() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50/30">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none mr-2">
        Time &amp; Context
      </span>
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
      <ForecastSelectors orientation="horizontal" theme="light" fields={["year", "rfq"]} />
    </div>
  );
}
