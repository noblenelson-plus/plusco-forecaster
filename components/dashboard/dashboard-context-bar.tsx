// components/dashboard/dashboard-context-bar.tsx
"use client";

/**
 * Dashboard time/context bar — primary Year + RFQ on the left, a "vs" divider,
 * and a second comparison Year + RFQ on the right. The second pair is a
 * placeholder for now: its selection is written to useComparisonSelection but
 * no chart or table consumes it yet. Variance below each scorecard will read
 * from that store later.
 *
 * The single-client selector lives in the multi-select filter bar, so both
 * pairs hide the client field via ForecastSelectors' `fields` prop.
 */

import ForecastSelectors from "../_shared/forecast-selectors";
import { useComparisonSelection } from "../../lib/stores/comparison-selection.store";

export default function DashboardContextBar() {
  const {
    comparisonYear,
    comparisonRFQ,
    setComparisonYear,
    setComparisonRFQ,
  } = useComparisonSelection();

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50/30">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none mr-2">
        Time &amp; Context
      </span>
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

      {/* Primary scope — drives every chart and table on the dashboard. */}
      <ForecastSelectors orientation="horizontal" theme="light" fields={["year", "rfq"]} />

      {/* "vs" divider — same label styling as "Time & Context" so the two
          groups read as parallel halves. */}
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 select-none mx-1">
        vs
      </span>

      {/* Comparison scope — placeholder for variance, not consumed yet. */}
      <ForecastSelectors
        orientation="horizontal"
        theme="light"
        fields={["year", "rfq"]}
        override={{
          year: comparisonYear,
          rfq: comparisonRFQ,
          setYear: setComparisonYear,
          setRFQ: setComparisonRFQ,
        }}
      />
    </div>
  );
}