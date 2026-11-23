// components/progression/milestone-tracking-summary.tsx
"use client";

/**
 * Milestones page — Section 1, "Milestone tracking": for the selected
 * checkpoint, the status totals, the breakdown by GM Pod (count per status +
 * a stacked bar) and "Milestones by client", the clients with their status.
 *
 * The totals and the GM breakdown always show every status (they ARE the
 * distribution). Milestones by client has its own multi-select status chips
 * (Validated / Flags to justify / Not validated); it opens on the clients left
 * to validate. Presentational — the page passes the rows and the status
 * selection in.
 */

import { useMemo } from "react";
import { Check, Info } from "lucide-react";
import type { ConfirmationStep } from "../../lib/constants/confirmation-steps";
import {
  breakdownByGm,
  clientsByStatus,
  countStatuses,
  MILESTONE_STATUS_ORDER,
  pct,
  statusAt,
  type MilestoneClientRow,
} from "../../lib/format/milestone-summary";
import type { RfqValidationStatus } from "../../lib/types/forecast-flags.types";
import { STATUS_META, StatusIcon } from "./milestone-status";
import SheetExportButton from "../dashboard/sheet-export-button";
import type { CellValue } from "../forecaster/table/table-export";

export default function MilestoneTrackingSummary({
  rows,
  checkpoint,
  statuses,
  onStatusesChange,
  scopeNote,
  year,
}: {
  year: number | null;
  /** Which clients the page covers (top filters), e.g. "Filtered: Region QC/East · 27 clients". */
  scopeNote: string;
  /** Active, facet-filtered clients (before the status filter). */
  rows: MilestoneClientRow[];
  checkpoint: ConfirmationStep;
  /** Status chips of Milestones by client (empty = every client). */
  statuses: RfqValidationStatus[];
  onStatusesChange: (s: RfqValidationStatus[]) => void;
}) {
  const totals = useMemo(() => countStatuses(rows, checkpoint.id), [rows, checkpoint.id]);
  const byGm = useMemo(() => breakdownByGm(rows, checkpoint.id), [rows, checkpoint.id]);
  const listed = useMemo(
    () => clientsByStatus(rows, checkpoint.id, statuses),
    [rows, checkpoint.id, statuses]
  );
  const toggleStatus = (s: RfqValidationStatus) =>
    onStatusesChange(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]);

  // Google Sheets export of the list: scope line, blank row, table.
  const buildListSheet = (): CellValue[][] => [
    [`${scopeNote} · ${checkpoint.label}`],
    [],
    ["Client", "GM", "Business Lead", "Status"],
    ...listed.map((r) => [r.clientName, r.gm, r.bl, STATUS_META[statusAt(r, checkpoint.id)].label]),
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Milestone tracking</h2>
          <p className="text-sm text-gray-500">
            Validation status at <span className="font-semibold text-gray-900">{checkpoint.label}</span>
          </p>
          <ScopeLine note={scopeNote} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Info size={13} />
          Best read once every client has been validated for this checkpoint.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Active clients"
          value={String(totals.total)}
          hint="Active this year"
        />
        {MILESTONE_STATUS_ORDER.map((s) => (
          <Tile
            key={s}
            label={STATUS_META[s].label}
            value={String(totals[s])}
            sub={`${pct(totals[s], totals.total)} of clients`}
            hint={STATUS_META[s].hint}
            swatch={STATUS_META[s].bar}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Breakdown by GM */}
        <div className="border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-900">By GM</h3>
          </div>
          {byGm.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No clients.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase tracking-wide text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2 text-left font-semibold">GM</th>
                    {MILESTONE_STATUS_ORDER.map((s) => (
                      <th key={s} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                        {STATUS_META[s].label}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-left font-semibold">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {byGm.map((g) => (
                    <tr key={g.gm} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{g.gm}</td>
                      {MILESTONE_STATUS_ORDER.map((s) => (
                        <td
                          key={s}
                          className={`px-2 py-2 text-right tabular-nums ${
                            g[s] === 0 ? "text-gray-300" : "text-gray-900"
                          }`}
                        >
                          {g[s]}
                        </td>
                      ))}
                      <td className="w-40 px-4 py-2">
                        <StackedBar counts={g} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Milestones by client — status chips (multi-select), default = left to validate. */}
        <div className="border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-900">
              Milestones by client
              <span className="ml-2 text-xs font-normal text-gray-500 tabular-nums">{listed.length}</span>
            </h3>
            <SheetExportButton
              title={`Milestones by client — ${checkpoint.label}${year ? ` ${year}` : ""}`}
              sheetTitle="Milestones by client"
              buildMatrix={buildListSheet}
              disabled={listed.length === 0}
            />
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2"
            role="group"
            aria-label="Show clients with status"
          >
            <span className="text-xs font-medium text-gray-600">Show</span>
            {MILESTONE_STATUS_ORDER.map((s) => {
              const on = statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStatus(s)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? `${STATUS_META[s].chip} border-gray-900 font-semibold`
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {on && <Check size={12} />}
                  {STATUS_META[s].label}
                  <span className="tabular-nums opacity-80">{totals[s]}</span>
                </button>
              );
            })}
            {statuses.length === 0 && <span className="text-[11px] text-gray-400">All clients</span>}
          </div>
          {listed.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {totals.total === 0
                ? "No clients."
                : statuses.length === 2 && !statuses.includes("validated")
                  ? "Every client is validated for this checkpoint."
                  : "No clients with this status."}
            </p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase tracking-wide text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2 text-left font-semibold">Client</th>
                    <th className="px-2 py-2 text-left font-semibold">GM</th>
                    <th className="px-2 py-2 text-left font-semibold">BL</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((r) => {
                    const st = statusAt(r, checkpoint.id);
                    return (
                      <tr key={r.clientId} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.clientName}</td>
                        <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{r.gm || "—"}</td>
                        <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{r.bl}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="flex items-center gap-1.5 text-xs text-gray-700">
                            <StatusIcon status={st} />
                            {STATUS_META[st].label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The page's client scope, under a section title — bold when filtered. */
export function ScopeLine({ note }: { note: string }) {
  const filtered = note.startsWith("Filtered");
  return (
    <p className={`mt-0.5 text-xs ${filtered ? "font-semibold text-gray-900" : "text-gray-500"}`}>{note}</p>
  );
}

function Tile({
  label,
  value,
  sub,
  hint,
  swatch,
}: {
  label: string;
  value: string;
  sub?: string;
  /** What the tile means, in one plain sentence (first-time users). */
  hint?: string;
  swatch?: string;
}) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {swatch && <span className={`h-2.5 w-2.5 ${swatch}`} aria-hidden="true" />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
      {hint && <div className="mt-1.5 border-t border-gray-100 pt-1.5 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}

function StackedBar({ counts }: { counts: Record<RfqValidationStatus, number> & { total: number } }) {
  if (counts.total === 0) return null;
  return (
    <div
      className="flex h-2.5 w-full bg-gray-100"
      title={MILESTONE_STATUS_ORDER.map((s) => `${STATUS_META[s].label}: ${counts[s]}`).join(" · ")}
    >
      {MILESTONE_STATUS_ORDER.map((s) =>
        counts[s] > 0 ? (
          <div
            key={s}
            className={STATUS_META[s].bar}
            style={{ width: `${(counts[s] / counts.total) * 100}%` }}
          />
        ) : null
      )}
    </div>
  );
}
