// components/progression/progression-recap-table.tsx
"use client";

/**
 * The per-client "Milestones" table: one row per client, one column per
 * milestone (headed with its due month, e.g. "Prelim FINAL (Nov)"), each cell
 * an icon for that milestone's status (validated / flags to justify / not
 * validated). The selected checkpoint's column is highlighted. The body scrolls
 * inside a fixed height (~18 rows) with a sticky header and client column.
 * Exports to Google Sheets.
 *
 * Filtering lives in the page's filter bar (status applies to the checkpoint);
 * this component only renders the rows it is given.
 */

import { useState } from "react";
import SheetExportButton from "../dashboard/sheet-export-button";
import type { CellValue } from "../forecaster/table/table-export";
import { ScopeLine } from "./milestone-tracking-summary";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import { MILESTONE_STATUS_ORDER, type MilestoneClientRow } from "../../lib/format/milestone-summary";
import { STATUS_META, StatusIcon } from "./milestone-status";

export default function ProgressionRecapTable({
  rows,
  checkpointId,
  fileLabel,
  scopeNote,
}: {
  rows: MilestoneClientRow[];
  checkpointId: string;
  fileLabel?: string;
  scopeNote: string;
}) {
  // Only the checkpoint picked at the top by default (Adriana); "Show all
  // milestones" brings back every column. The export always has them all.
  const [showAll, setShowAll] = useState(false);
  const steps = showAll ? CONFIRMATION_STEPS : CONFIRMATION_STEPS.filter((s) => s.id === checkpointId);
  // Google Sheets export (shared, not a downloaded CSV): scope line, blank row, table.
  function buildSheet(): CellValue[][] {
    const header = ["Client", "GM", "Business Lead", ...CONFIRMATION_STEPS.map((s) => s.label)];
    const body = rows.map((r) => [
      r.clientName,
      r.gm,
      r.bl,
      ...CONFIRMATION_STEPS.map((s) => STATUS_META[r.statusByStep[s.id] ?? "not_validated"].label),
    ]);
    return [[scopeNote], [], header, ...body];
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Milestones by client</h2>
        <ScopeLine note={scopeNote} />
      </div>
      <div className="border border-gray-200 bg-white">
        {/* Toolbar — count, legend, Sheets export */}
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
          <label className="ml-auto mr-3 flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 accent-gray-900"
            />
            Show all milestones
          </label>
          <SheetExportButton
            title={`Milestones — ${fileLabel ?? ""}`}
            sheetTitle="Milestones"
            buildMatrix={buildSheet}
            disabled={rows.length === 0}
          />
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
                {steps.map((s) => (
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
                    colSpan={3 + steps.length}
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
                    {steps.map((s) => (
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
