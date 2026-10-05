// components/dashboard/mir-context-bar.tsx
"use client";

/**
 * Period row for Media Investments Report → Media Investments (MIR data has no
 * RFQ, so there's no Time & Context bar). A From → To month period — MIR covers
 * 2025 + 2026, so e.g. Apr 2025 → Mar 2026 works — with quick picks, and the
 * MIR vintage ("as of" the last sync) on the right.
 *
 * Styled to sit with the filter bar below it: an icon + uppercase label like
 * "FILTERS", pickers shaped like the filter dropdowns, the quick picks as one
 * segmented control like the CAD / USD toggle. Only shown where the period
 * filters something; the KPI sub-tab and Reports have no period row.
 */

import { CalendarRange, Database } from "lucide-react";
import { useLastSync } from "../../lib/dashboard/data/use-last-sync";
import {
  calendarYearPeriod,
  describePeriod,
  last12MonthsPeriod,
  monthKeyLabel,
  monthKeysBetween,
  normalizePeriod,
  yearToDatePeriod,
  type MonthKey,
  type MonthPeriod,
} from "../../lib/format/period";

/** First year of MIR data in the app (the 2025 + 2026 MIR files). */
const MIR_FIRST_YEAR = 2025;

// Same shape as the filter dropdowns' trigger (MultiSelectDropdown).
const selectClass =
  "min-w-[120px] px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400";

export default function MirContextBar({
  period,
  onPeriodChange,
}: {
  period: MonthPeriod;
  onPeriodChange: (p: MonthPeriod) => void;
}) {
  const lastSync = useLastSync();
  const now = new Date();
  const lastYear = Math.max(now.getFullYear(), MIR_FIRST_YEAR + 1);
  const options = monthKeysBetween(MIR_FIRST_YEAR, lastYear);

  const presets: { label: string; period: MonthPeriod }[] = [
    { label: "YTD", period: yearToDatePeriod(now) },
    { label: "Last 12 mo", period: last12MonthsPeriod(now) },
    ...[lastYear - 1, lastYear].map((y) => ({ label: String(y), period: calendarYearPeriod(y) })),
  ];
  const isActive = (p: MonthPeriod) => p.from === period.from && p.to === period.to;
  const setEnd = (end: "from" | "to", k: MonthKey) =>
    onPeriodChange(normalizePeriod({ ...period, [end]: k }));

  const picker = (end: "from" | "to") => (
    <select
      aria-label={end === "from" ? "Period start" : "Period end"}
      className={selectClass}
      value={period[end]}
      onChange={(e) => setEnd(end, Number(e.target.value))}
    >
      {options.map((k) => (
        <option key={k} value={k}>
          {monthKeyLabel(k)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none mr-2">
        <CalendarRange size={14} />
        Period
      </div>
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

      {picker("from")}
      <span className="text-xs text-gray-400">to</span>
      {picker("to")}

      <div
        className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold"
        role="group"
        aria-label="Quick periods"
      >
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPeriodChange(p.period)}
            title={describePeriod(p.period)}
            className={`px-3 py-1.5 transition-colors ${
              isActive(p.period)
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span
        className="ml-auto flex items-center gap-1.5 text-xs text-gray-500"
        title="MediaOcean (MIR) booked data — no RFQ or forecast comparison applies here."
      >
        <Database size={13} />
        MIR · as of {lastSync.labelShort ?? "latest sync"}
      </span>
    </div>
  );
}
