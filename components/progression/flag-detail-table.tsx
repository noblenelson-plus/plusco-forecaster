// components/progression/flag-detail-table.tsx
"use client";

/**
 * Milestones page — Section 3, "Flags by client": every current flag of the
 * checkpoint's RFQ for the filtered clients, one row per flag, with its
 * amounts (in the client's currency) and the BL's justification verbatim
 * (context + comment). Follows the page filters (facets + flag category /
 * flag); adds a text search and a Justified / Not justified switch. Scrolls
 * inside ~18 rows; downloadable as CSV.
 *
 * Current flags only — a flag gone at the last validation isn't listed (no
 * per-milestone history yet). Presentational — the page loads the flags.
 */

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import {
  flagTypeOf,
  type ClientFlags,
  type FlagTypeId,
} from "../../lib/format/flag-insights";
import { flagContextLabel, type StoredFlag } from "../../lib/types/forecast-flags.types";
import { flagComparison, formatMonths } from "../flags/flag-card";
import { formatMoney, formatSigned } from "../../lib/format/money";
import type { ConfirmationStep } from "../../lib/constants/confirmation-steps";

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
  flag: StoredFlag;
  justified: boolean;
  /** Labs error — can't be justified. */
  correctOnly: boolean;
}

function subjectOf(flag: StoredFlag): string {
  if (flag.ruleId === "revenue-swing") return "Annual revenue";
  if (flag.subject === "annual") return "Full year";
  return flag.title;
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function FlagDetailTable({
  clients,
  types,
  checkpoint,
  year,
}: {
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
          comparison: flagComparison(f).replace(/^·\s*/, ""),
          flag: f,
          justified: !!f.justified,
          correctOnly: type.id === "labs_error",
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
  }, [clients, types]);

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

  function downloadCsv() {
    const header = ["Client", "GM", "Business Lead", "Flag", "On", "Current", "Reference", "Compared with", "Gap", "Currency", "Months", "Status", "Context", "Comment"];
    const body = rows.map((r) => [
      r.clientName,
      r.gm,
      r.bl,
      r.typeLabel,
      r.subject,
      Math.round(r.flag.current ?? 0),
      Math.round(r.flag.reference ?? 0),
      r.comparison,
      Math.round(r.flag.delta ?? 0),
      r.currency,
      r.flag.analyzedMonths?.length ? formatMonths(r.flag.analyzedMonths) : "",
      r.correctOnly ? "To correct" : r.justified ? "Justified" : "Not justified",
      r.flag.context ? flagContextLabel(r.flag.context) : "",
      r.flag.note ?? "",
    ]);
    const csv = [header, ...body].map((row) => row.map(csvField).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `milestone-flags-${year}-${checkpoint.targetRfq}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Flags by client</h2>
        <p className="text-sm text-gray-500">
          Current flags on <span className="font-semibold text-gray-900">{checkpoint.targetRfq} {year}</span>{" "}
          with the Business Lead&apos;s justification · amounts in the client&apos;s currency
        </p>
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
          <table className="w-full min-w-[1200px] border-collapse text-sm">
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
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-400">
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
                        {formatMoney(r.flag.current ?? 0)} vs {formatMoney(r.flag.reference ?? 0)}
                        <div className="text-[11px] text-gray-400">
                          {r.currency} · {r.comparison}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                        {formatSigned(r.flag.delta ?? 0)}
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
