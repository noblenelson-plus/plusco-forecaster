// components/dashboard/mir-context-bar.tsx
"use client";

/**
 * The MIR (MediaOcean) tabs' header row — the same second-row style and spot
 * as DashboardDisplayBar on the other tabs (MIR has no RFQ, so there's no Time &
 * Context row above it). Shows a From → To month
 * period (MIR covers 2025 + 2026, so e.g. Apr 2025 → Mar 2026 works) with quick
 * picks, and the MIR vintage ("as of" the last sync).
 *
 * `showPeriod` is off where the picker would filter nothing (Reports, whose
 * raw-data pages carry their own Year / Month filters; the full-year KPI
 * sub-tab) — there the bar shows `note` instead.
 */

import { Calendar, Database } from "lucide-react";
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

const selectClass =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400";

export default function MirContextBar({
  period,
  onPeriodChange,
  showPeriod = true,
  note,
}: {
  period: MonthPeriod;
  onPeriodChange: (p: MonthPeriod) => void;
  showPeriod?: boolean;
  /** What applies instead, when the period picker is hidden. */
  note?: string;
}) {
  const lastSync = useLastSync();
  const now = new Date();
  const lastYear = Math.max(now.getFullYear(), MIR_FIRST_YEAR + 1);
  const options = monthKeysBetween(MIR_FIRST_YEAR, lastYear);

  const presets: { label: string; period: MonthPeriod }[] = [
    { label: `${now.getFullYear()} YTD`, period: yearToDatePeriod(now) },
    { label: "Last 12 months", period: last12MonthsPeriod(now) },
    ...[lastYear - 1, lastYear].map((y) => ({ label: `Calendar ${y}`, period: calendarYearPeriod(y) })),
  ];
  const isActive = (p: MonthPeriod) => p.from === period.from && p.to === period.to;
  const setEnd = (end: "from" | "to", k: MonthKey) =>
    onPeriodChange(normalizePeriod({ ...period, [end]: k }));

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-gray-200 bg-gray-50">
      {showPeriod ? (
        <>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            From
            <select
              className={selectClass}
              value={period.from}
              onChange={(e) => setEnd("from", Number(e.target.value))}
            >
              {options.map((k) => (
                <option key={k} value={k}>
                  {monthKeyLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            To
            <select
              className={selectClass}
              value={period.to}
              onChange={(e) => setEnd("to", Number(e.target.value))}
            >
              {options.map((k) => (
                <option key={k} value={k}>
                  {monthKeyLabel(k)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onPeriodChange(p.period)}
                className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive(p.period)
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar size={13} />
            {describePeriod(period)}
          </span>
        </>
      ) : (
        <span className="text-xs text-gray-500">{note}</span>
      )}

      <span
        className="ml-auto flex items-center gap-1.5 text-xs text-gray-500"
        title="MediaOcean (MIR) booked data — no RFQ or forecast comparison applies here."
      >
        <Database size={13} />
        MIR · as of {lastSync.labelShort ?? "latest sync"} · no RFQ
      </span>
    </div>
  );
}
