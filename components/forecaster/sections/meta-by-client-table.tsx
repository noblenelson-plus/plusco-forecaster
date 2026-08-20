// components/forecaster/sections/meta-by-client-table.tsx
"use client";

/**
 * Meta — Phase 4a: the "BY CLIENT" download table. One row per (dashboard-
 * scoped) client with its dimensions + the Meta divestment spend columns, sorted
 * by client name, with a weighted grand-total row. This mirrors the Looker
 * "BY CLIENT - download table".
 */

import { useMemo } from "react";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: number): string {
  return v ? `$${Math.round(v).toLocaleString("en-CA")}` : "$0";
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
/** Best-effort read of a column that may not be in the typed row. */
function opt(r: KpiByClientRow, key: string): string {
  const v = (r as Record<string, unknown>)[key];
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

const HEADERS = [
  "Client",
  "Agency",
  "GM Pod",
  "BU Region",
  "Business Lead",
  "Client Status",
  "Scenario",
  "Meta Share Trend",
  "Meta 2025",
  "Social 2025",
  "Meta Share 2025",
  "Meta 2026",
  "Social 2026",
  "Meta Share 2026",
];

export default function MetaByClientTable({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const total = useMemo(() => {
    let meta2025 = 0,
      social2025 = 0,
      meta2026 = 0,
      social2026 = 0;
    for (const r of rows) {
      meta2025 += num(r.meta_spend_2025);
      social2025 += num(r.social_spend_2025);
      meta2026 += num(r.meta_spend_2026);
      social2026 += num(r.social_spend_2026);
    }
    return { meta2025, social2025, meta2026, social2026 };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta by client" className="space-y-3">
      <h3 className="text-base font-bold text-foreground">By Client</h3>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              {HEADERS.map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                    i === 0
                      ? "sticky left-0 z-10 bg-gray-50 text-left"
                      : i <= 7
                      ? "text-left"
                      : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const metaShare2025 = safeDiv(
                num(r.meta_spend_2025),
                num(r.social_spend_2025)
              );
              const metaShare2026 = safeDiv(
                num(r.meta_spend_2026),
                num(r.social_spend_2026)
              );
              return (
                <tr
                  key={r.PLUSCO_CLIENT_ID}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left font-medium text-gray-900">
                    {r.CLIENT_NAME || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {r.AGENCY || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {r.GM_POD || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {r.BU_REGION || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {r.BUSINESS_LEAD || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {opt(r, "CLIENT_STATUS_IN_2026")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {opt(r, "scenario_meta_mapping")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {r.meta_share_trend || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {money(num(r.meta_spend_2025))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {money(num(r.social_spend_2025))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {pct(metaShare2025)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {money(num(r.meta_spend_2026))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {money(num(r.social_spend_2026))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {pct(metaShare2026)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t border-gray-300 bg-gray-100 font-semibold text-gray-900">
              <td className="sticky left-0 z-10 bg-gray-100 px-3 py-2.5 text-left">
                Grand total
              </td>
              <td colSpan={7} className="bg-gray-100" />
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {money(total.meta2025)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {money(total.social2025)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {pct(safeDiv(total.meta2025, total.social2025))}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {money(total.meta2026)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {money(total.social2026)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {pct(safeDiv(total.meta2026, total.social2026))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
