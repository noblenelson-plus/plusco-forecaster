// filepath: components/forecaster/sections/meta-pacing-vs-target.tsx
"use client";

/**
 * Meta — "META PACING VS DIVESTMENT TARGET": the final Meta section. Two rows,
 * each pairing a per-client TABLE card (with a Grand-total footer) and a
 * separate "% of Clients" PIE card:
 *   • Meta Share of Social — table of the precomputed share-vs-target columns
 *     (Flag_Meta_Share_vs_Target, meta share 2026, target share, variance) +
 *     a pie over "Divestment Target Achieved / Unmet".
 *   • Meta Spend — table of the precomputed spend/target/pacing columns
 *     (meta share trend, target meta spend, spend pacing) + a pie over
 *     "Overpacing / OK".
 *
 * Table columns map straight to the synced meta_social_output fields (share and
 * pacing ratios are pre-computed and stored as fractions). The two pies reuse
 * the Looker-validated derivation from meta-pacing-pies.tsx: a client has
 * ACHIEVED its divestment target when its 2026 meta share is at or below its
 * target share, and is OVERPACING when its spend-vs-target ratio outruns the
 * share of the year elapsed. "No Data" clients are excluded from both pies.
 *
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
/** Signed dollars in Looker style: "$-179,989" / "$11,784" / "$0". */
function moneyVar(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "$0";
  return `$${r < 0 ? "-" : ""}${Math.abs(r).toLocaleString("en-CA")}`;
}
/** Percent from a 0–1 fraction; keeps a leading minus, never a leading plus. */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
/** Read a stored value by key as a string cell ("—" when blank). */
function opt(r: KpiByClientRow, key: string): string {
  return str((r as Record<string, unknown>)[key]);
}
/** Read a pre-computed 0–1 fraction by key; null when blank (0 is kept). */
function frac(r: KpiByClientRow, key: string): number | null {
  const v = (r as Record<string, unknown>)[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Sum a numeric field across rows. */
function sumField(rows: KpiByClientRow[], key: string): number {
  return rows.reduce((a, r) => a + num((r as Record<string, unknown>)[key]), 0);
}
/** Per-client share variance vs target = meta share 2026 − target meta share. */
function shareVarVsTarget(r: KpiByClientRow): number | null {
  const s = frac(r, "meta_share_of_social_2026");
  const t = frac(r, "target_meta_share_2026");
  return s !== null && t !== null ? s - t : null;
}
/** Grand-total share variance vs target, recomputed from summed dollars. */
function totalShareVarVsTarget(rows: KpiByClientRow[]): number | null {
  const share = safeDiv(sumField(rows, "meta_spend_2026"), sumField(rows, "social_spend_2026"));
  const target = safeDiv(sumField(rows, "target_meta_spend_2026"), sumField(rows, "social_forecast_rfq1"));
  return share !== null && target !== null ? share - target : null;
}

interface Col {
  header: string;
  align: "left" | "right";
  sticky?: boolean;
  cell: (r: KpiByClientRow) => string;
  total?: (rows: KpiByClientRow[]) => string;
}

/** A per-client table card (with a Grand-total footer) next to a "% of Clients" pie card. */
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
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
                {cols.map((c) => (
                  <td
                    key={c.header}
                    className={`whitespace-nowrap px-3 py-2.5 ${alignCls(c)} ${
                      c.align === "right" ? "tabular-nums" : ""
                    } ${c.sticky ? "sticky left-0 z-10 bg-gray-50" : ""}`}
                  >
                    {c.total ? c.total(rows) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>

      {/* Pie card */}
      <ChartCard title="% of Clients" icon={PieChart} className="lg:col-span-2">
        <div className="mt-2 flex min-h-[420px] flex-col justify-center">
          {total > 0 ? (
            <ForecasterPieChart
              segments={segments}
              valueFormat={(v) => `${v} clients`}
              size={300}
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

// ─── Columns ────────────────────────────────────────────────────────────────
const SHARE_COLS: Col[] = [
  {
    header: "Client",
    align: "left",
    sticky: true,
    cell: (r) => str(r.CLIENT_NAME),
    total: () => "Grand total",
  },
  {
    header: "Flag Meta Share vs Target",
    align: "left",
    cell: (r) => opt(r, "Flag_Meta_Share_vs_Target"),
    total: () => "—",
  },
  {
    header: "Meta 2025",
    align: "right",
    cell: (r) => money(num(r.meta_spend_2025)),
    total: (rs) => money(sumField(rs, "meta_spend_2025")),
  },
  {
    header: "Meta 2026",
    align: "right",
    cell: (r) => money(num(r.meta_spend_2026)),
    total: (rs) => money(sumField(rs, "meta_spend_2026")),
  },
  {
    header: "Meta Spend Var YoY $",
    align: "right",
    cell: (r) => moneyVar(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
    total: (rs) => moneyVar(sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025")),
  },
  {
    header: "Meta Spend Var YoY %",
    align: "right",
    cell: (r) => pct(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026))),
    total: (rs) => pct(safeDiv(sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025"), sumField(rs, "meta_spend_2026"))),
  },
  {
    header: "Meta Share Social 2026",
    align: "right",
    cell: (r) => pct(frac(r, "meta_share_of_social_2026")),
    total: (rs) => pct(safeDiv(sumField(rs, "meta_spend_2026"), sumField(rs, "social_spend_2026"))),
  },
  {
    header: "Target Meta Share",
    align: "right",
    cell: (r) => pct(frac(r, "target_meta_share_2026")),
    total: (rs) => pct(safeDiv(sumField(rs, "target_meta_spend_2026"), sumField(rs, "social_forecast_rfq1"))),
  },
  {
    header: "Share Variance vs Target",
    align: "right",
    cell: (r) => pct(shareVarVsTarget(r)),
    total: (rs) => pct(totalShareVarVsTarget(rs)),
  },
];

const SPEND_COLS: Col[] = [
  {
    header: "Client",
    align: "left",
    sticky: true,
    cell: (r) => str(r.CLIENT_NAME),
    total: () => "Grand total",
  },
  {
    header: "Meta Share Trend",
    align: "left",
    cell: (r) => str(r.meta_share_trend),
    total: () => "—",
  },
  {
    header: "Meta 2025",
    align: "right",
    cell: (r) => money(num(r.meta_spend_2025)),
    total: (rs) => money(sumField(rs, "meta_spend_2025")),
  },
  {
    header: "Meta 2026",
    align: "right",
    cell: (r) => money(num(r.meta_spend_2026)),
    total: (rs) => money(sumField(rs, "meta_spend_2026")),
  },
  {
    header: "Meta Spend Var YoY $",
    align: "right",
    cell: (r) => moneyVar(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
    total: (rs) => moneyVar(sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025")),
  },
  {
    header: "Meta Spend Var YoY %",
    align: "right",
    cell: (r) => pct(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026))),
    total: (rs) => pct(safeDiv(sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025"), sumField(rs, "meta_spend_2026"))),
  },
  {
    header: "Target Meta Spend 2026",
    align: "right",
    cell: (r) => money(num(r.target_meta_spend_2026)),
    total: (rs) => money(sumField(rs, "target_meta_spend_2026")),
  },
  {
    header: "Spend Pacing",
    align: "right",
    cell: (r) => pct(frac(r, "spend_pacing")),
    total: (rs) => pct(safeDiv(sumField(rs, "meta_spend_2026"), sumField(rs, "target_meta_spend_2026"))),
  },
];

// ─── Section ────────────────────────────────────────────────────────────────────
export default function MetaPacingVsTarget({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const { shareVsTarget, pacing } = useMemo(() => {
    let achieved = 0,
      unmet = 0,
      overpacing = 0,
      ok = 0;
    const pctYear = (new Date().getMonth() + 1) / 12;

    for (const r of rows) {
      const social2026 = num(r.social_spend_2026);
      const meta2026 = num(r.meta_spend_2026);
      const socialForecast = num(r.social_forecast_rfq1);
      const target = num(r.target_meta_spend_2026);

      if (social2026 > 0 && socialForecast > 0) {
        const metaShare = meta2026 / social2026;
        const targetShare = target / socialForecast;
        if (metaShare - targetShare <= 0) achieved += 1;
        else unmet += 1;
      }

      if (meta2026 > 0 && target > 0) {
        const pacingIndex = (meta2026 / target / pctYear) * 100;
        if (pacingIndex >= 100) overpacing += 1;
        else ok += 1;
      }
    }

    const shareVsTarget: PieSegment[] = [
      { label: "Divestment Target Achieved", value: achieved, color: "#10b981" },
      { label: "Divestment Target Unmet", value: unmet, color: "#6366f1" },
    ];
    const pacing: PieSegment[] = [
      { label: "Overpacing", value: overpacing, color: "#14b8a6" },
      { label: "OK", value: ok, color: "#f59e0b" },
    ];
    return { shareVsTarget, pacing };
  }, [rows]);

  return (
    <div
      data-scroll-section
      data-scroll-label="Meta pacing vs target"
      className="space-y-6"
    >
      <TableWithPie
        title="Meta Share of Social"
        icon={Percent}
        cols={SHARE_COLS}
        rows={sorted}
        segments={shareVsTarget}
      />
      <TableWithPie
        title="Meta Spend"
        icon={DollarSign}
        cols={SPEND_COLS}
        rows={sorted}
        segments={pacing}
      />
    </div>
  );
}
