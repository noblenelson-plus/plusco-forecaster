// components/forecaster/sections/meta-pacing-vs-target.tsx
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
 *
 * UI — standardized to the app's table DNA: shared TableColumn descriptors, a
 * ChartCard with an "Export" action, and the semantic-token styling shared with
 * the other Meta tables. Grand-total cells are recomputed from summed dollars
 * (a Totals object built once), not averaged. Numbers/order are unchanged.
 */

import { useMemo } from "react";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import { Percent, DollarSign, PieChart } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import { num, str, money, moneyVar, pct, safeDiv, opt } from "./meta-format";

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

/** Grand totals recomputed from summed dollars — drive every footer cell. */
interface Totals {
  meta2025: number;
  meta2026: number;
  social2026: number;
  targetMeta: number;
  socialForecast: number;
}

/** Share variance vs target from summed dollars, null-safe. */
function totalShareVar(t: Totals): number | null {
  const share = safeDiv(t.meta2026, t.social2026);
  const target = safeDiv(t.targetMeta, t.socialForecast);
  return share !== null && target !== null ? share - target : null;
}

type MetaColumn = TableColumn<KpiByClientRow, Totals>;

/** A per-client table card (with a Grand-total footer) next to a "% of Clients" pie card. */
function TableWithPie({
  title,
  icon,
  columns,
  rows,
  totals,
  segments,
  exportTitle,
  sheetTitle,
}: {
  title: string;
  icon: typeof Percent;
  columns: MetaColumn[];
  rows: KpiByClientRow[];
  totals: Totals;
  segments: PieSegment[];
  exportTitle: string;
  sheetTitle: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Table card */}
      <ChartCard
        title={title}
        icon={icon}
        className="lg:col-span-3"
        action={
          <ExportSheetButton
            columns={columns}
            rows={rows}
            totals={totals}
            title={exportTitle}
            sheetTitle={sheetTitle}
            includeTotals
          />
        }
      >
        <div className="-mx-2 mt-2 max-h-[420px] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                      c.align === "left" ? "text-left" : "text-right"
                    } ${c.pinned ? "sticky left-0 z-10 bg-muted" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.PLUSCO_CLIENT_ID}
                  className="border-b border-border/60 transition-colors hover:bg-muted/60"
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      title={c.pinned ? c.display(r) : undefined}
                      className={`px-3 py-2 ${
                        c.align === "left"
                          ? "text-left text-foreground"
                          : "text-right tabular-nums text-foreground"
                      } ${
                        c.pinned
                          ? "sticky left-0 z-10 max-w-[150px] truncate bg-card font-medium text-foreground"
                          : "whitespace-nowrap"
                      }`}
                    >
                      {c.display(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 ${
                      c.align === "left" ? "text-left" : "text-right tabular-nums"
                    } ${c.pinned ? "sticky left-0 z-10 bg-muted" : ""}`}
                  >
                    {c.total ? c.total(totals) : ""}
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

// --- Columns ---
const SHARE_COLUMNS: MetaColumn[] = [
  {
    id: "client",
    label: "Client",
    group: "Meta share of social",
    kind: "text",
    align: "left",
    pinned: true,
    width: 150,
    raw: (r) => str(r.CLIENT_NAME),
    display: (r) => str(r.CLIENT_NAME),
    total: () => "Grand total",
  },
  {
    id: "flag_meta_share_vs_target",
    label: "Flag Meta Share vs Target",
    group: "Meta share of social",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "Flag_Meta_Share_vs_Target"),
    display: (r) => opt(r, "Flag_Meta_Share_vs_Target"),
    total: () => "—",
  },
  {
    id: "meta_2025",
    label: "Meta 2025",
    group: "Meta share of social",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2025),
    display: (r) => money(num(r.meta_spend_2025)),
    total: (t) => money(t.meta2025),
    totalRaw: (t) => t.meta2025,
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "Meta share of social",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026),
    display: (r) => money(num(r.meta_spend_2026)),
    total: (t) => money(t.meta2026),
    totalRaw: (t) => t.meta2026,
  },
  {
    id: "meta_var_yoy_usd",
    label: "Meta Spend Var YoY $",
    group: "Meta share of social",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026) - num(r.meta_spend_2025),
    display: (r) => moneyVar(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
    total: (t) => moneyVar(t.meta2026 - t.meta2025),
    totalRaw: (t) => t.meta2026 - t.meta2025,
  },
  {
    id: "meta_var_yoy_pct",
    label: "Meta Spend Var YoY %",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026)),
    display: (r) =>
      pct(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026))),
    total: (t) => pct(safeDiv(t.meta2026 - t.meta2025, t.meta2026)),
  },
  {
    id: "meta_share_social_2026",
    label: "Meta Share Social 2026",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => frac(r, "meta_share_of_social_2026"),
    display: (r) => pct(frac(r, "meta_share_of_social_2026")),
    total: (t) => pct(safeDiv(t.meta2026, t.social2026)),
  },
  {
    id: "target_meta_share",
    label: "Target Meta Share",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => frac(r, "target_meta_share_2026"),
    display: (r) => pct(frac(r, "target_meta_share_2026")),
    total: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
  },
  {
    id: "share_variance_vs_target",
    label: "Share Variance vs Target",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => shareVarVsTarget(r),
    display: (r) => pct(shareVarVsTarget(r)),
    total: (t) => pct(totalShareVar(t)),
  },
];

const SPEND_COLUMNS: MetaColumn[] = [
  {
    id: "client",
    label: "Client",
    group: "Meta spend",
    kind: "text",
    align: "left",
    pinned: true,
    width: 150,
    raw: (r) => str(r.CLIENT_NAME),
    display: (r) => str(r.CLIENT_NAME),
    total: () => "Grand total",
  },
  {
    id: "meta_share_trend",
    label: "Meta Share Trend",
    group: "Meta spend",
    kind: "text",
    align: "left",
    raw: (r) => str(r.meta_share_trend),
    display: (r) => str(r.meta_share_trend),
    total: () => "—",
  },
  {
    id: "meta_2025",
    label: "Meta 2025",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2025),
    display: (r) => money(num(r.meta_spend_2025)),
    total: (t) => money(t.meta2025),
    totalRaw: (t) => t.meta2025,
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026),
    display: (r) => money(num(r.meta_spend_2026)),
    total: (t) => money(t.meta2026),
    totalRaw: (t) => t.meta2026,
  },
  {
    id: "meta_var_yoy_usd",
    label: "Meta Spend Var YoY $",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026) - num(r.meta_spend_2025),
    display: (r) => moneyVar(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
    total: (t) => moneyVar(t.meta2026 - t.meta2025),
    totalRaw: (t) => t.meta2026 - t.meta2025,
  },
  {
    id: "meta_var_yoy_pct",
    label: "Meta Spend Var YoY %",
    group: "Meta spend",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026)),
    display: (r) =>
      pct(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2026))),
    total: (t) => pct(safeDiv(t.meta2026 - t.meta2025, t.meta2026)),
  },
  {
    id: "target_meta_spend_2026",
    label: "Target Meta Spend 2026",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.target_meta_spend_2026),
    display: (r) => money(num(r.target_meta_spend_2026)),
    total: (t) => money(t.targetMeta),
    totalRaw: (t) => t.targetMeta,
  },
  {
    id: "spend_pacing",
    label: "Spend Pacing",
    group: "Meta spend",
    kind: "percent",
    align: "right",
    raw: (r) => frac(r, "spend_pacing"),
    display: (r) => pct(frac(r, "spend_pacing")),
    total: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
  },
];

// --- Section ---
export default function MetaPacingVsTarget({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const totals = useMemo<Totals>(
    () => ({
      meta2025: sumField(rows, "meta_spend_2025"),
      meta2026: sumField(rows, "meta_spend_2026"),
      social2026: sumField(rows, "social_spend_2026"),
      targetMeta: sumField(rows, "target_meta_spend_2026"),
      socialForecast: sumField(rows, "social_forecast_rfq1"),
    }),
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
        columns={SHARE_COLUMNS}
        rows={sorted}
        totals={totals}
        segments={shareVsTarget}
        exportTitle="Meta — Share vs Divestment Target"
        sheetTitle="Meta share vs target"
      />
      <TableWithPie
        title="Meta Spend"
        icon={DollarSign}
        columns={SPEND_COLUMNS}
        rows={sorted}
        totals={totals}
        segments={pacing}
        exportTitle="Meta — Spend vs Divestment Target"
        sheetTitle="Meta spend vs target"
      />
    </div>
  );
}
