// components/progression/progression-recap-table.tsx
"use client";

/**
 * The per-client "Milestones" table: one row per client, one column per
 * milestone (headed with its due month, e.g. "Prelim FINAL (Nov)"), each cell
 * an icon for that milestone's status (validated / flags to justify / not
 * validated). The selected checkpoint's column is highlighted. The body scrolls
 * inside a fixed height (~18 rows) with a sticky header and client column.
 * Downloadable as CSV.
 *
 * Filtering lives in the page's filter bar (status applies to the checkpoint);
 * this component only renders the rows it is given.
 */

import { Download } from "lucide-react";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import { MILESTONE_STATUS_ORDER, type MilestoneClientRow } from "../../lib/format/milestone-summary";
import { STATUS_META, StatusIcon } from "./milestone-status";

/** Quote a CSV field when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ProgressionRecapTable({
  rows,
  checkpointId,
  fileLabel,
}: {
  rows: MilestoneClientRow[];
  checkpointId: string;
  fileLabel?: string;
}) {
  function downloadCsv() {
    const header = ["Client", "GM", "Business Lead", ...CONFIRMATION_STEPS.map((s) => s.label)];
    const body = rows.map((r) => [
      r.clientName,
      r.gm,
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">All milestones</h2>
      <div className="border border-gray-200 bg-white">
        {/* Toolbar — count, legend, CSV */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-900">
              {rows.length} client{rows.length !== 1 ? "s" : ""}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {MILESTONE_STATUS_ORDER.map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <StatusIcon status={s} />
                  {STATUS_META[s].label}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>

        <div className="max-h-[700px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-900 text-white">
                <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2 text-left font-semibold">
                  Client
                </th>
                <th className="px-3 py-2 text-left font-semibold">GM</th>
                <th className="px-3 py-2 text-left font-semibold">BL</th>
                {CONFIRMATION_STEPS.map((s) => (
                  <th
                    key={s.id}
                    className={`px-2 py-2 text-center text-[11px] font-semibold whitespace-nowrap ${
                      s.id === checkpointId ? "bg-yellow-400 text-gray-900" : ""
                    }`}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + CONFIRMATION_STEPS.length}
                    className="px-3 py-8 text-center text-sm text-gray-400"
                  >
                    No clients match the filters.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
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
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.gm || "—"}</td>
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
    </section>
  );
}
