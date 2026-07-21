// components/progression/progression-recap-table.tsx
"use client";

/**
 * The big per-client table for the "Progression and flag recap" page: one row
 * per client with the client name, its Business Lead, a ticked column for each
 * confirmation step, and the raised flags with their justifications. Downloadable
 * as CSV (one row per client).
 *
 * Presentational only — the page fetches/computes the rows (use-progression-recap
 * + the dashboard filters) and passes them in.
 */

import { Check, Download, Flag as FlagIcon } from "lucide-react";
import { formatSigned } from "../../lib/format/money";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { Flag, FlagReviewMap } from "../../lib/types/flag.types";

export interface RecapDisplayRow {
  clientId: string;
  clientName: string;
  bl: string;
  currency: string;
  confirmed: Set<string>;
  flags: Flag[];
  reviews: FlagReviewMap;
}

const AXIS_LABEL: Record<AxisId, string> = {
  revenue: "Revenue",
  media: "Media",
  labs: "Labs",
};

/** Quote a CSV field when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One flag rendered as text: "Media · Social +150,000 CAD". */
function flagText(flag: Flag, currency: string): string {
  return `${AXIS_LABEL[flag.axis]} · ${flag.title} ${formatSigned(flag.delta)} ${currency}`;
}

/** A flag's justification as text: the note, an acknowledged marker, or a gap. */
function justificationText(flag: Flag, reviews: FlagReviewMap): string {
  const review = reviews[flag.key];
  const note = review?.note?.trim();
  if (note) return `${flag.title}: ${note}${review?.acknowledged ? " [acknowledged]" : ""}`;
  return `${flag.title}: ${review?.acknowledged ? "[acknowledged, no note]" : "not justified"}`;
}

export default function ProgressionRecapTable({
  rows,
  fileLabel,
}: {
  rows: RecapDisplayRow[];
  fileLabel?: string;
}) {
  function downloadCsv() {
    const header = [
      "Client",
      "Business Lead",
      ...CONFIRMATION_STEPS.map((s) => s.label),
      "Flags",
      "Justifications",
    ];
    const body = rows.map((r) => [
      r.clientName,
      r.bl,
      ...CONFIRMATION_STEPS.map((s) => (r.confirmed.has(s.id) ? "Yes" : "")),
      r.flags.map((f) => flagText(f, r.currency)).join(" | "),
      r.flags.map((f) => justificationText(f, r.reviews)).join(" | "),
    ]);
    const csv = [header, ...body]
      .map((row) => row.map(csvField).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `progression-recap${fileLabel ? `-${fileLabel}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border border-gray-200 bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
        <span className="text-sm font-semibold text-gray-900">
          {rows.length} client{rows.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={14} />
          Download CSV
        </button>
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
              <th className="px-3 py-2 text-left font-semibold min-w-[22rem]">
                Flags &amp; justification
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
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
                {CONFIRMATION_STEPS.map((s) => {
                  const on = r.confirmed.has(s.id);
                  return (
                    <td key={s.id} className="px-2 py-2 text-center">
                      {on ? (
                        <span
                          title="Confirmed"
                          className="inline-flex h-5 w-5 items-center justify-center bg-green-500 text-white"
                        >
                          <Check size={12} />
                        </span>
                      ) : (
                        <span className="text-gray-300">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2">
                  {r.flags.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {r.flags.map((f) => {
                        const review = r.reviews[f.key];
                        const note = review?.note?.trim();
                        const acknowledged = !!review?.acknowledged;
                        return (
                          <li key={f.key} className="leading-snug">
                            <span className="flex items-center gap-1.5 font-medium text-gray-900">
                              <FlagIcon
                                size={12}
                                className={acknowledged ? "text-green-600" : "text-red-500"}
                              />
                              {AXIS_LABEL[f.axis]} · {f.title}
                              <span className="tabular-nums text-gray-500">
                                {formatSigned(f.delta)} {r.currency}
                              </span>
                            </span>
                            <span className="block pl-[18px] text-[12px] text-gray-500">
                              {note ? note : <span className="italic text-gray-400">Not justified</span>}
                              {acknowledged && (
                                <span className="ml-1 text-green-600">· acknowledged</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
