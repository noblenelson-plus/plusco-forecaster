// components/forecaster/sections/meta-by-client-table.tsx
"use client";

/**
 * Meta — the "BY CLIENT" download table. One row per (dashboard-scoped) client
 * with the full Looker column set: 8 dimensions + 19 metrics, including the three
 * synced BigQuery flags (Flag_Meta_Spend_YOY / _vs_Target / Share_vs_Target).
 * Sorted by client name, with a weighted grand-total row (shares/variances
 * recomputed from summed dollars). Source: meta_social_output (via MetaSection).
 */

import { useMemo } from "react";
import { Building2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

// ─── Formatting ────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}
function money(v: number): string {
  return v ? `$${Math.round(v).toLocaleString("en-CA")}` : "$0";
}
function moneySigned(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function pctSigned(v: number | null, digits = 0): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}
function ppt(v: number | null, digits = 1): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
/** Read a column that may not be in the typed row (flags, status, scenario). */
function opt(r: KpiByClientRow, key: string): string {
  return str((r as Record<string, unknown>)[key]);
}
/** metaShare(2026) - metaShare(2025), null-safe. */
function shareVar(m26: number, s26: number, m25: number, s25: number): number | null {
  const a = safeDiv(m26, s26);
  const b = safeDiv(m25, s25);
  return a !== null && b !== null ? a - b : null;
}

interface Totals {
  meta2025: number;
  social2025: number;
  meta2026: number;
  social2026: number;
  socialForecast: number;
  targetMeta: number;
  miqForecast: number;
  other2025: number;
  other2026: number;
}

interface Col {
  header: string;
  align: "left" | "right";
  sticky?: boolean;
  cell: (r: KpiByClientRow) => string;
  total?: (t: Totals) => string;
}

const COLS: Col[] = [
  { header: "Client", align: "left", sticky: true, cell: (r) => str(r.CLIENT_NAME), total: () => "Grand total" },
  { header: "Agency", align: "left", cell: (r) => str(r.AGENCY) },
  { header: "GM Pod", align: "left", cell: (r) => str(r.GM_POD) },
  { header: "BU Region", align: "left", cell: (r) => str(r.BU_REGION) },
  { header: "Business Lead", align: "left", cell: (r) => str(r.BUSINESS_LEAD) },
  { header: "Client Status", align: "left", cell: (r) => opt(r, "CLIENT_STATUS_IN_2026") },
  { header: "Scenario", align: "left", cell: (r) => opt(r, "scenario_meta_mapping") },
  { header: "Meta Share Trend", align: "left", cell: (r) => str(r.meta_share_trend) },

  { header: "Meta 2025", align: "right", cell: (r) => money(num(r.meta_spend_2025)), total: (t) => money(t.meta2025) },
  { header: "Social 2025", align: "right", cell: (r) => money(num(r.social_spend_2025)), total: (t) => money(t.social2025) },
  { header: "Meta Share 2025", align: "right", cell: (r) => pct(safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025))), total: (t) => pct(safeDiv(t.meta2025, t.social2025)) },
  { header: "Meta 2026", align: "right", cell: (r) => money(num(r.meta_spend_2026)), total: (t) => money(t.meta2026) },
  { header: "Social 2026", align: "right", cell: (r) => money(num(r.social_spend_2026)), total: (t) => money(t.social2026) },
  { header: "Meta Share 2026", align: "right", cell: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026))), total: (t) => pct(safeDiv(t.meta2026, t.social2026)) },
  { header: "Meta Spend Var YoY $", align: "right", cell: (r) => moneySigned(num(r.meta_spend_2026) - num(r.meta_spend_2025)), total: (t) => moneySigned(t.meta2026 - t.meta2025) },
  { header: "Meta Spend Var YoY %", align: "right", cell: (r) => pctSigned(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025))), total: (t) => pctSigned(safeDiv(t.meta2026 - t.meta2025, t.meta2025)) },
  { header: "Social Forecast (RFQ)", align: "right", cell: (r) => money(num(r.social_forecast_rfq1)), total: (t) => money(t.socialForecast) },
  { header: "Target Meta Spend (-30%)", align: "right", cell: (r) => money(num(r.target_meta_spend_2026)), total: (t) => money(t.targetMeta) },
  { header: "Spend Pacing", align: "right", cell: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.target_meta_spend_2026))), total: (t) => pct(safeDiv(t.meta2026, t.targetMeta)) },
  { header: "Meta Share Var vs 2025", align: "right", cell: (r) => ppt(shareVar(num(r.meta_spend_2026), num(r.social_spend_2026), num(r.meta_spend_2025), num(r.social_spend_2025))), total: (t) => ppt(shareVar(t.meta2026, t.social2026, t.meta2025, t.social2025)) },
  { header: "MIQ-Social Forecast", align: "right", cell: (r) => money(num(r.miq_social_forecast_2026)), total: (t) => money(t.miqForecast) },
  { header: "Target Meta Share 2026", align: "right", cell: (r) => pct(safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1))), total: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)) },
  { header: "Flag Meta Spend YoY", align: "left", cell: (r) => opt(r, "Flag_Meta_Spend_YOY") },
  { header: "Flag Meta Spend vs Target", align: "left", cell: (r) => opt(r, "Flag_Meta_Spend_vs_Target") },
  { header: "Flag Meta Share vs Target", align: "left", cell: (r) => opt(r, "Flag_Meta_Share_vs_Target") },
  { header: "Other Platforms Share 2026", align: "right", cell: (r) => pct(safeDiv(num(r.other_platforms_spend_2026), num(r.social_spend_2026))), total: (t) => pct(safeDiv(t.other2026, t.social2026)) },
  { header: "Other Platform Share Var vs 2025", align: "right", cell: (r) => ppt(shareVar(num(r.other_platforms_spend_2026), num(r.social_spend_2026), num(r.other_platforms_spend_2025), num(r.social_spend_2025))), total: (t) => ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)) },
];

export default function MetaByClientTable({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const total = useMemo<Totals>(() => {
    const t: Totals = {
      meta2025: 0,
      social2025: 0,
      meta2026: 0,
      social2026: 0,
      socialForecast: 0,
      targetMeta: 0,
      miqForecast: 0,
      other2025: 0,
      other2026: 0,
    };
    for (const r of rows) {
      t.meta2025 += num(r.meta_spend_2025);
      t.social2025 += num(r.social_spend_2025);
      t.meta2026 += num(r.meta_spend_2026);
      t.social2026 += num(r.social_spend_2026);
      t.socialForecast += num(r.social_forecast_rfq1);
      t.targetMeta += num(r.target_meta_spend_2026);
      t.miqForecast += num(r.miq_social_forecast_2026);
      t.other2025 += num(r.other_platforms_spend_2025);
      t.other2026 += num(r.other_platforms_spend_2026);
    }
    return t;
  }, [rows]);

  const alignCls = (c: Col) => (c.align === "left" ? "text-left" : "text-right");

  return (
    <div data-scroll-section data-scroll-label="Meta by client">
      <ChartCard title="By Client" icon={Building2}>
        <div className="-mx-2 mt-2 max-h-[560px] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                {COLS.map((c) => (
                  <th
                    key={c.header}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${alignCls(c)} ${
                      c.sticky ? "sticky left-0 z-10 bg-gray-50" : ""
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.PLUSCO_CLIENT_ID} className="border-b border-gray-100 hover:bg-gray-50">
                  {COLS.map((c) => (
                    <td
                      key={c.header}
                      className={`whitespace-nowrap px-3 py-2 ${alignCls(c)} ${
                        c.align === "right" ? "tabular-nums text-gray-700" : "text-gray-700"
                      } ${c.sticky ? "sticky left-0 z-10 bg-white font-medium text-gray-900" : ""}`}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t border-gray-300 bg-gray-100 font-semibold text-gray-900">
                {COLS.map((c) => (
                  <td
                    key={c.header}
                    className={`whitespace-nowrap px-3 py-2.5 ${alignCls(c)} ${
                      c.align === "right" ? "tabular-nums" : ""
                    } ${c.sticky ? "sticky left-0 z-10 bg-gray-100" : ""}`}
                  >
                    {c.total ? c.total(total) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
