// components/progression/progression-recap-table.tsx
"use client";

/**
 * The per-client "Milestones" table: one row per client, one column per
 * milestone step, each cell an icon showing that step's validation status
 * (not validated / validated / flags to justify / BL data changed / MediaOcean
 * changed). A legend explains the icons, and every column can be filtered by
 * status (independently — filters combine with AND). Downloadable as CSV.
 *
 * Presentational only — the page fetches/derives the rows and passes them in.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Minus, Pencil, RefreshCw } from "lucide-react";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import type { RfqValidationStatus } from "../../lib/types/forecast-flags.types";

export interface RecapDisplayRow {
  clientId: string;
  clientName: string;
  bl: string;
  currency: string;
  statusByStep: Record<string, RfqValidationStatus>;
}

/** Icon + chip styling + label for each status, in legend order. */
const STATUS_META: Record<
  RfqValidationStatus,
  { label: string; short: string; icon: typeof Check; chip: string }
> = {
  not_validated: { label: "Not validated", short: "Not validated", icon: Minus, chip: "bg-gray-100 text-gray-400" },
  validated: { label: "Validated", short: "Validated", icon: Check, chip: "bg-green-500 text-white" },
  failed: { label: "Flags to justify", short: "Flags to justify", icon: AlertTriangle, chip: "bg-yellow-400 text-gray-900" },
  stale_bl: { label: "BL data changed", short: "BL changed", icon: Pencil, chip: "bg-yellow-400 text-gray-900" },
  stale_mo: { label: "MediaOcean changed", short: "MO changed", icon: RefreshCw, chip: "bg-yellow-400 text-gray-900" },
};

const STATUS_ORDER: RfqValidationStatus[] = [
  "not_validated",
  "validated",
  "failed",
  "stale_bl",
  "stale_mo",
];

/** Quote a CSV field when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function StatusIcon({ status }: { status: RfqValidationStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={`inline-flex h-5 w-5 items-center justify-center ${meta.chip}`}
    >
      <Icon size={12} />
    </span>
  );
}

export default function ProgressionRecapTable({
  rows,
  fileLabel,
}: {
  rows: RecapDisplayRow[];
  fileLabel?: string;
}) {
  // Per-column status filter: step id → required status (absent = no filter).
  const [filters, setFilters] = useState<Record<string, RfqValidationStatus | "">>({});

  const activeFilters = useMemo(
    () =>
      Object.entries(filters).filter(([, v]) => v !== "") as [
        string,
        RfqValidationStatus,
      ][],
    [filters]
  );

  const visibleRows = useMemo(
    () =>
      activeFilters.length === 0
        ? rows
        : rows.filter((r) =>
            activeFilters.every(([stepId, status]) => r.statusByStep[stepId] === status)
          ),
    [rows, activeFilters]
  );

  const setFilter = (stepId: string, value: RfqValidationStatus | "") =>
    setFilters((prev) => ({ ...prev, [stepId]: value }));

  function downloadCsv() {
    const header = ["Client", "Business Lead", ...CONFIRMATION_STEPS.map((s) => s.label)];
    const body = visibleRows.map((r) => [
      r.clientName,
      r.bl,
      ...CONFIRMATION_STEPS.map((s) => STATUS_META[r.statusByStep[s.id] ?? "not_validated"].label),
    ]);
    const csv = [header, ...body].map((row) => row.map(csvField).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `milestones${fileLabel ? `-${fileLabel}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border border-gray-200 bg-white">
      {/* Toolbar — count, legend, CSV */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-900">
            {activeFilters.length > 0
              ? `${visibleRows.length} of ${rows.length} client${rows.length !== 1 ? "s" : ""}`
              : `${rows.length} client${rows.length !== 1 ? "s" : ""}`}
          </span>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                <StatusIcon status={s} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visibleRows.length === 0}
            className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2 text-left font-semibold">
                Client
              </th>
              <th className="px-3 py-2 text-left font-semibold">BL</th>
              {CONFIRMATION_STEPS.map((s) => (
                <th
                  key={s.id}
                  title={s.label}
                  className="px-2 py-2 text-center text-[11px] font-semibold whitespace-nowrap"
                >
                  {s.short}
                </th>
              ))}
            </tr>
            {/* Per-column status filter row */}
            <tr className="bg-gray-50 text-gray-700">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 text-left text-[11px] font-medium text-gray-400">
                Filter by status
              </th>
              <th className="bg-gray-50" />
              {CONFIRMATION_STEPS.map((s) => (
                <th key={s.id} className="px-1.5 py-1.5 text-center">
                  <select
                    value={filters[s.id] ?? ""}
                    onChange={(e) => setFilter(s.id, e.target.value as RfqValidationStatus | "")}
                    aria-label={`Filter ${s.label} by status`}
                    className={`w-full border px-1 py-1 text-[11px] focus:outline-none ${
                      filters[s.id]
                        ? "border-gray-900 bg-white font-medium text-gray-900"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    <option value="">All</option>
                    {STATUS_ORDER.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st].short}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + CONFIRMATION_STEPS.length}
                  className="px-3 py-8 text-center text-sm text-gray-400"
                >
                  No clients match the active status filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((r, i) => (
                <tr
                  key={r.clientId}
                  className={`border-b border-gray-100 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
                >
                  <td
                    className={`sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 ${
                      i % 2 ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    {r.clientName}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.bl}</td>
                  {CONFIRMATION_STEPS.map((s) => (
                    <td key={s.id} className="px-2 py-2 text-center">
                      <StatusIcon status={r.statusByStep[s.id] ?? "not_validated"} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
