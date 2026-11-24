// components/progression/flag-detail-table.tsx
"use client";

/**
 * Milestones page — Section 3, "Flags by client": every current flag of the
 * checkpoint's RFQ for the filtered clients, one row per flag, with its
 * amounts (in the client's currency) and the BL's justification verbatim
 * (context + comment). Follows the page filters (facets + flag category /
 * flag); adds a text search and a Justified / Not justified switch. Scrolls
 * inside ~18 rows; exports to Google Sheets.
 *
 * The flags saved at the checkpoint (flag_history), plus each flag's previous
 * justification — what the BL wrote for the same flag at an earlier round of
 * the year. Presentational — the page loads the flags.
 */

import { useMemo, useState } from "react";
import SheetExportButton from "../dashboard/sheet-export-button";
import type { CellValue } from "../forecaster/table/table-export";
import { Search } from "lucide-react";
import {
  displayDelta,
  flagTypeOf,
  type ClientFlags,
  type FlagTypeId,
} from "../../lib/format/flag-insights";
import { flagContextLabel, type StoredFlag } from "../../lib/types/forecast-flags.types";
import { flagComparison, formatMonths } from "../flags/flag-card";
import { previousJustification, type PreviousJustification } from "../../lib/format/flag-history";
import { formatMoney, formatSigned } from "../../lib/format/money";
import type { ConfirmationStep } from "../../lib/constants/confirmation-steps";
import { ScopeLine } from "./milestone-tracking-summary";

type JustifiedFilter = "all" | "not_justified" | "justified";

interface DetailRow {
  key: string;
  clientName: string;
  gm: string;
  bl: string;
  currency: string;
  typeLabel: string;
  /** Channel / partner / "Annual revenue". */
  subject: string;
  comparison: string;
  /** Amounts as shown: Under-forecasting reads BL forecast vs MediaOcean, gap negative. */
  shown: { current: number; reference: number; gap: number };
  flag: StoredFlag;
  justified: boolean;
  /** Labs error — can't be justified. */
  correctOnly: boolean;
  /** Same flag justified at an earlier round of the year. */
  previous?: PreviousJustification;
}

function subjectOf(flag: StoredFlag): string {
  if (flag.ruleId === "revenue-swing") return "Annual revenue";
  if (flag.subject === "annual") return "Full year";
  return flag.title;
}

export default function FlagDetailTable({
  clients,
  types,
  checkpoint,
  year,
  scopeNote,
}: {
  scopeNote: string;
  clients: ClientFlags[];
  types: FlagTypeId[];
  checkpoint: ConfirmationStep;
  year: number;
}) {
  const [query, setQuery] = useState("");
  const [justifiedFilter, setJustifiedFilter] = useState<JustifiedFilter>("all");

  const allRows = useMemo<DetailRow[]>(() => {
    const wanted = new Set(types);
    const rows: DetailRow[] = [];
    for (const c of clients) {
      for (const f of c.flags) {
        const type = flagTypeOf(f);
        if (!type || !wanted.has(type.id)) continue;
        rows.push({
          key: `${c.clientId}:${f.key}`,
          clientName: c.clientName,
          gm: c.gm,
          bl: c.bl ?? "",
          currency: c.currency ?? "CAD",
          typeLabel: type.label,
          subject: subjectOf(f),
          comparison: type.negate ? "BL forecast vs MediaOcean" : flagComparison(f).replace(/^·\s*/, ""),
          shown: type.negate
            ? { current: f.reference ?? 0, reference: f.current ?? 0, gap: displayDelta(f) }
            : { current: f.current ?? 0, reference: f.reference ?? 0, gap: f.delta ?? 0 },
          flag: f,
          justified: !!f.justified,
          correctOnly: type.id === "labs_error",
          previous: previousJustification(c.history, checkpoint.targetRfq, f.key),
        });
      }
    }
    const typeOrder = new Map(types.map((t, i) => [t, i]));
    return rows.sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        (typeOrder.get(flagTypeOf(a.flag)!.id) ?? 0) - (typeOrder.get(flagTypeOf(b.flag)!.id) ?? 0) ||
        Math.abs(b.flag.delta ?? 0) - Math.abs(a.flag.delta ?? 0)
    );
  }, [clients, types, checkpoint.targetRfq]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        (justifiedFilter === "all" ||
          (justifiedFilter === "justified" ? r.justified : !r.justified)) &&
        (!q ||
          [r.clientName, r.gm, r.bl, r.typeLabel, r.subject, r.flag.note ?? "", r.flag.context ? flagContextLabel(r.flag.context) : ""]
            .join(" ")
            .toLowerCase()
            .includes(q))
    );
  }, [allRows, query, justifiedFilter]);

  const clientCount = useMemo(() => new Set(rows.map((r) => r.clientName)).size, [rows]);

  // Google Sheets export (shared, not a downloaded CSV): scope line, blank row, table.
  function buildSheet(): CellValue[][] {
    const header = ["Client", "GM", "Business Lead", "Flag", "On", "Current", "Reference", "Compared with", "Gap", "Currency", "Months", "Status", "Context", "Comment", "Previous justification"];
    const body = rows.map((r) => [
      r.clientName,
      r.gm,
      r.bl,
      r.typeLabel,
      r.subject,
      Math.round(r.shown.current),
      Math.round(r.shown.reference),
      r.comparison,
      Math.round(r.shown.gap),
      r.currency,
      r.flag.analyzedMonths?.length ? formatMonths(r.flag.analyzedMonths) : "",
      r.correctOnly ? "To correct" : r.justified ? "Justified" : "Not justified",
      r.flag.context ? flagContextLabel(r.flag.context) : "",
      r.flag.note ?? "",
      r.previous
        ? `${r.previous.rfq}: ${r.previous.context ? flagContextLabel(r.previous.context) : ""}${r.previous.note ? ` — ${r.previous.note}` : ""}`
        : "",
    ]);
    return [[scopeNote], [], header, ...body];
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Flags by client</h2>
        <p className="text-sm text-gray-500">
          Flags at <span className="font-semibold text-gray-900">{checkpoint.label} {year}</span>{" "}
          with the Business Lead&apos;s justification · amounts in the client&apos;s currency
        </p>
        <ScopeLine note={scopeNote} />
      </div>

      <div className="border border-gray-200 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">
              {rows.length} flag{rows.length !== 1 ? "s" : ""} · {clientCount} client{clientCount !== 1 ? "s" : ""}
            </span>
            <div className="flex border border-gray-200" role="group" aria-label="Justification">
              {(
                [
                  ["all", "All"],
                  ["not_justified", "Not justified"],
                  ["justified", "Justified"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={justifiedFilter === id}
                  onClick={() => setJustifiedFilter(id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    justifiedFilter === id ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 border border-gray-200 px-2 py-1.5">
              <Search size={13} className="text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client, BL, comment…"
                className="w-56 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            </label>
          </div>
          <SheetExportButton
            title={`Milestone flags — ${checkpoint.label} ${year}`}
            sheetTitle="Flags"
            buildMatrix={buildSheet}
            disabled={rows.length === 0}
          />
        </div>

        <div className="max-h-[700px] overflow-auto">
          <table className="w-full min-w-[1400px] border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-900 text-left text-white">
                <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">GM</th>
                <th className="px-3 py-2 font-semibold">BL</th>
                <th className="px-3 py-2 font-semibold">Flag</th>
                <th className="px-3 py-2 font-semibold">On</th>
                <th className="px-3 py-2 text-right font-semibold">Current vs reference</th>
                <th className="px-3 py-2 text-right font-semibold">Gap</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Context</th>
                <th className="px-3 py-2 font-semibold">Comment</th>
                <th className="px-3 py-2 font-semibold">Previous justification</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-400">
                    {allRows.length === 0 ? "No flags." : "No flags match."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const bg = i % 2 ? "bg-gray-50" : "bg-white";
                  return (
                    <tr key={r.key} className={`border-b border-gray-100 align-top ${bg}`}>
                      <td className={`sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 ${bg}`}>
                        {r.clientName}
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.gm || "—"}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.bl}</td>
                      <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.typeLabel}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.subject}
                        {r.flag.analyzedMonths?.length ? (
                          <div className="text-[11px] text-gray-400">{formatMonths(r.flag.analyzedMonths)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">
                        {formatMoney(r.shown.current)} vs {formatMoney(r.shown.reference)}
                        <div className="text-[11px] text-gray-400">
                          {r.currency} · {r.comparison}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                        {formatSigned(r.shown.gap)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 text-[11px] font-semibold ${
                            r.correctOnly
                              ? "bg-red-500 text-white"
                              : r.justified
                                ? "bg-green-500 text-white"
                                : "bg-yellow-400 text-gray-900"
                          }`}
                        >
                          {r.correctOnly ? "To correct" : r.justified ? "Justified" : "Not justified"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {r.flag.context ? flagContextLabel(r.flag.context) : "—"}
                      </td>
                      <td className="min-w-[280px] px-3 py-2 text-gray-700 whitespace-pre-wrap">
                        {r.flag.note || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="min-w-[240px] px-3 py-2 text-gray-500">
                        {r.previous ? (
                          <>
                            <span className="font-semibold text-gray-700">{r.previous.rfq}</span>
                            {r.previous.context ? ` · ${flagContextLabel(r.previous.context)}` : ""}
                            {r.previous.note ? <div className="whitespace-pre-wrap">{r.previous.note}</div> : null}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
