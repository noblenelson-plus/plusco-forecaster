// components/forecaster/sections/meta-pacing-yoy.tsx
"use client";

/**
 * Meta — "META PACING YOY": two rows, each pairing a per-client TABLE card with a
 * separate PIE card (keyed off the authoritative synced BigQuery flags):
 *   • Meta Share of Social — table + pie over meta_share_trend
 *     (Divested / Flat / Increasing).
 *   • Meta Spend — table + pie over Flag_Meta_Spend_YOY
 *     (YOY Divestment of min. 30% / Divestment Shortfall; "No Data" excluded).
 * Source: meta_social_output (via MetaSection), already dashboard-scoped.
 */

import { useMemo } from "react";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import { Percent, DollarSign, PieChart } from "lucide-react";
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
function opt(r: KpiByClientRow, key: string): string {
  return str((r as Record<string, unknown>)[key]);
}
function shareVar(m26: number, s26: number, m25: number, s25: number): number | null {
  const a = safeDiv(m26, s26);
  const b = safeDiv(m25, s25);
  return a !== null && b !== null ? a - b : null;
}

interface Col {
  header: string;
  align: "left" | "right";
  sticky?: boolean;
  cell: (r: KpiByClientRow) => string;
}

/** A per-client table card next to a separate "% of Clients" pie card. */
function TableWithPie({
  title,
  icon,
  cols,
  rows,
  segments,
}: {
  title: string;
  icon: typeof Percent;
  cols: Col[];
  rows: KpiByClientRow[];
  segments: PieSegment[];
}) {
  const alignCls = (c: Col) => (c.align === "left" ? "text-left" : "text-right");
  const total = segments.reduce((a, s) => a + s.value, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Table card */}
      <ChartCard title={title} icon={icon} className="lg:col-span-3">
        <div className="-mx-2 mt-2 max-h-[420px] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                {cols.map((c) => (
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
              {rows.map((r) => (
                <tr
                  key={r.PLUSCO_CLIENT_ID}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  {cols.map((c) => (
                    <td
                      key={c.header}
                      title={c.sticky ? c.cell(r) : undefined}
                      className={`px-3 py-2 ${alignCls(c)} ${
                        c.align === "right" ? "tabular-nums text-gray-700" : "text-gray-700"
                      } ${
                        c.sticky
                          ? "sticky left-0 z-10 max-w-[150px] truncate bg-white font-medium text-gray-900"
                          : "whitespace-nowrap"
                      }`}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Pie card */}
      <ChartCard title="% of Clients" icon={PieChart} className="lg:col-span-2">
        <div className="mt-2">
          {total > 0 ? (
            <ForecasterPieChart
              segments={segments}
              valueFormat={(v) => `${v} clients`}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
              No clients in scope
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

const SHARE_COLS: Col[] = [
  { header: "Client", align: "left", sticky: true, cell: (r) => str(r.CLIENT_NAME) },
  { header: "Scenario", align: "left", cell: (r) => opt(r, "scenario_meta_mapping") },
  { header: "Meta Share Trend", align: "left", cell: (r) => str(r.meta_share_trend) },
  { header: "Meta Share 2026", align: "right", cell: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026))) },
  { header: "Meta Share 2025", align: "right", cell: (r) => pct(safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025))) },
  { header: "Meta Share Variance", align: "right", cell: (r) => ppt(shareVar(num(r.meta_spend_2026), num(r.social_spend_2026), num(r.meta_spend_2025), num(r.social_spend_2025))) },
  { header: "Target Meta Share", align: "right", cell: (r) => pct(safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1))) },
];

const SPEND_COLS: Col[] = [
  { header: "Client", align: "left", sticky: true, cell: (r) => str(r.CLIENT_NAME) },
  { header: "Flag Meta Spend YoY", align: "left", cell: (r) => opt(r, "Flag_Meta_Spend_YOY") },
  { header: "Meta 2026", align: "right", cell: (r) => money(num(r.meta_spend_2026)) },
  { header: "Meta 2025", align: "right", cell: (r) => money(num(r.meta_spend_2025)) },
  { header: "Meta Spend Var YoY $", align: "right", cell: (r) => moneySigned(num(r.meta_spend_2026) - num(r.meta_spend_2025)) },
  { header: "Meta Spend Var YoY %", align: "right", cell: (r) => pctSigned(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025))) },
];

export default function MetaPacingYoy({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const { shareSegments, spendSegments } = useMemo(() => {
    let divested = 0,
      flat = 0,
      increasing = 0,
      yoyDivest = 0,
      shortfall = 0;

    for (const r of rows) {
      const trend = String(r.meta_share_trend ?? "").toLowerCase();
      if (trend.includes("divest")) divested += 1;
      else if (trend.includes("flat")) flat += 1;
      else if (trend.includes("increas")) increasing += 1;

      const flag = String(
        (r as Record<string, unknown>).Flag_Meta_Spend_YOY ?? ""
      ).toLowerCase();
      if (flag.includes("yoy divestment")) yoyDivest += 1;
      else if (flag.includes("shortfall")) shortfall += 1;
      // "No Data" is intentionally excluded from the pie.
    }

    const shareSegments: PieSegment[] = [
      { label: "Divested", value: divested, color: "#6366f1" },
      { label: "Flat", value: flat, color: "#f59e0b" },
      { label: "Increasing", value: increasing, color: "#a855f7" },
    ];
    const spendSegments: PieSegment[] = [
      { label: "YOY Divestment", value: yoyDivest, color: "#14b8a6" },
      { label: "Shortfall", value: shortfall, color: "#f59e0b" },
    ];
    return { shareSegments, spendSegments };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta pacing YoY" className="space-y-6">
      <TableWithPie
        title="Meta Share of Social"
        icon={Percent}
        cols={SHARE_COLS}
        rows={sorted}
        segments={shareSegments}
      />
      <TableWithPie
        title="Meta Spend"
        icon={DollarSign}
        cols={SPEND_COLS}
        rows={sorted}
        segments={spendSegments}
      />
    </div>
  );
}
