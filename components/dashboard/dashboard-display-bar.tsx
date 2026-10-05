// components/dashboard/dashboard-display-bar.tsx
"use client";

/**
 * The dashboard's second header row: the Months filter (where the tab uses
 * it), the "All amounts in CAD" note with the USD→CAD conversion applied, a
 * missing-rate warning, and the CAD / USD view toggle on the right.
 *
 * Shown on the forecast-based tabs (Forecaster, Labs Pacing, Exec KPI). The
 * MIR tabs don't use it: MIR amounts are always CAD, and the toggle there would
 * only narrow the clients to USD ones.
 */

import { DollarSign, AlertTriangle } from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import type { Currency } from "../../lib/types/client.types";

const MONTH_OPTIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].map((label, i) => ({ value: String(i + 1), label }));

export default function DashboardDisplayBar({
  months,
  onMonthsChange,
  usdToCad,
  usdClientCount = 0,
  missingRate = false,
  viewCurrency,
  onViewCurrencyChange,
}: {
  /** Month filter (1..12; empty = all). Omit `onMonthsChange` to hide it. */
  months?: number[];
  onMonthsChange?: (months: number[]) => void;
  /** USD→CAD rate applied for the selected year (undefined when none is set). */
  usdToCad?: number;
  /** Number of in-scope clients forecasting in USD (converted to CAD). */
  usdClientCount?: number;
  /** True when a USD client is in scope but no rate is configured for the year. */
  missingRate?: boolean;
  viewCurrency: Currency;
  onViewCurrencyChange: (c: Currency) => void;
}) {
  const usdView = viewCurrency === "USD";

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-gray-200 bg-gray-50">
      {/* Month filter — restricts every chart/table to the ticked months
          (applied to both scopes). Empty selection = the full year. */}
      {onMonthsChange && (
        <>
          <MultiSelectDropdown
            label="Months"
            options={MONTH_OPTIONS}
            selectedValues={(months ?? []).map(String)}
            onChange={(vals) => onMonthsChange(vals.map(Number))}
          />
          <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
        </>
      )}

      {/* Currency note — CAD view converts USD clients; USD view shows USD
          clients in their native dollars. */}
      <span
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-green-500 bg-green-500 text-white"
        title={
          usdView
            ? "USD view: only USD clients, shown in native USD."
            : "All amounts are aggregated and displayed in CAD. USD clients are converted with the year's rate."
        }
      >
        <DollarSign size={13} />
        {usdView ? "USD clients, in USD" : "All amounts in CAD"}
      </span>

      {!usdView && usdClientCount > 0 && usdToCad != null && (
        <span className="text-xs text-gray-500">
          {usdClientCount} USD {usdClientCount > 1 ? "clients " : "client "} converted
          at 1&nbsp;USD&nbsp;=&nbsp;{usdToCad}&nbsp;CAD
        </span>
      )}

      {missingRate && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-yellow-400 bg-yellow-400 text-gray-900"
          title="No USD→CAD rate is configured for this year in Admin → Currency. USD clients are shown unconverted."
        >
          <AlertTriangle size={13} />
          Missing USD→CAD rate
        </span>
      )}

      {/* View toggle, right-aligned. */}
      <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
        {(["CAD", "USD"] as Currency[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onViewCurrencyChange(c)}
            className={`px-3 py-1.5 transition-colors ${
              viewCurrency === c
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
