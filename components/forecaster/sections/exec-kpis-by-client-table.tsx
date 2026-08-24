// filepath: components/forecaster/sections/exec-kpis-by-client-table.tsx
"use client";

/**
 * Executive Summary — "Exec KPIs by Client" table. The client-level drill-down
 * that sits under the by-GM matrix, showing the same key metrics per client
 * (Labs share, Meta target/spend/share, Meta share YoY, trend, Billups OOH /
 * Print share, $ missed) with a Grand-total footer computed from summed dollars.
 *
 * Same source and math as the by-GM matrix (scoped mo_kpi_by_client, sum/sum
 * shares, the shared Billups eligibility rule), so Total ties to the matrix.
 * RAG (red/amber/green) colors the target metrics; the rest stay neutral.
 * Exports to Google Sheets or CSV from one shared set of column descriptors.
 */

import { useMemo } from "react";
import { Users, Download } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { Button } from "../../ui/button";
import ExportSheetButton from "../table/export-sheet-button";
import { buildExportMatrix } from "../table/table-export";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import { ragStatus, ragCell, type RagStatus, type RagBands } from "./exec-rag";

// --- Helpers ------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
function parseEligible(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "n/a" || s === "no" || s === "not eligible");
}
function moneyOf(v: number | null): string {
  return v === null ? "—" : `$${Math.round(v).toLocaleString("en-CA")}`;
}
function pctOf(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(0)}%`;
}
function textOf(v: unknown): string {
  const s = (v ?? "").toString().trim();
  return s === "" ? "—" : s;
}
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Per-client metric readers (one KpiByClientRow == one client).
const labsShare = (r: KpiByClientRow) =>
  safeDiv(num(r.labs_spend_2026), num(r.total_spend_2026));
const metaShare = (r: KpiByClientRow) =>
  safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026));
const metaShareTarget = (r: KpiByClientRow) =>
  safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1));
const metaShareVar = (r: KpiByClientRow): number | null => {
  const s26 = metaShare(r);
  const s25 = safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025));
  return s26 === null || s25 === null ? null : s26 - s25;
};
const oohShare = (r: KpiByClientRow) =>
  parseEligible(r.eligible_billups_ooh)
    ? safeDiv(num(r.billups_ooh_spend_2026), num(r.ooh_spend_2026))
    : null;
const printShare = (r: KpiByClientRow) =>
  parseEligible(r.eligible_billups_print)
    ? safeDiv(num(r.billups_print_spend_2026), num(r.print_spend_2026))
    : null;
const missed = (r: KpiByClientRow) =>
  (parseEligible(r.eligible_billups_ooh)
    ? num(r.ooh_spend_2026) - num(r.billups_ooh_spend_2026)
    : 0) +
  (parseEligible(r.eligible_billups_print)
    ? num(r.print_spend_2026) - num(r.billups_print_spend_2026)
    : 0);

/** Portfolio aggregate for the Grand-total footer (summed dollars / counts). */
interface Agg {
  labsSpend: number;
  totalSpend: number;
  metaTarget: number;
  metaSpend: number;
  meta25: number;
  social26: number;
  social25: number;
  oohEligChannel: number;
  oohEligBillups: number;
  printEligChannel: number;
  printEligBillups: number;
}
function aggregate(rows: KpiByClientRow[]): Agg {
  const a: Agg = {
    labsSpend: 0,
    totalSpend: 0,
    metaTarget: 0,
    metaSpend: 0,
    meta25: 0,
    social26: 0,
    social25: 0,
    oohEligChannel: 0,
    oohEligBillups: 0,
    printEligChannel: 0,
    printEligBillups: 0,
  };
  for (const r of rows) {
    a.labsSpend += num(r.labs_spend_2026);
    a.totalSpend += num(r.total_spend_2026);
    a.metaTarget += num(r.target_meta_spend_2026);
    a.metaSpend += num(r.meta_spend_2026);
    a.meta25 += num(r.meta_spend_2025);
    a.social26 += num(r.social_spend_2026);
    a.social25 += num(r.social_spend_2025);
    if (parseEligible(r.eligible_billups_ooh)) {
      a.oohEligChannel += num(r.ooh_spend_2026);
      a.oohEligBillups += num(r.billups_ooh_spend_2026);
    }
    if (parseEligible(r.eligible_billups_print)) {
      a.printEligChannel += num(r.print_spend_2026);
      a.printEligBillups += num(r.billups_print_spend_2026);
    }
  }
  return a;
}

type Kind = "text" | "money" | "pct" | "delta";

interface Col {
  id: string;
  label: string;
  kind: Kind;
  align: "left" | "right";
  pinned?: boolean;
  cell: (r: KpiByClientRow) => string;
  raw: (r: KpiByClientRow) => number | string | null;
  status?: (r: KpiByClientRow, goals: Goals) => RagStatus;
  foot?: (a: Agg) => string;
  footRaw?: (a: Agg) => number | null;
}

interface Goals {
  labsShareGoal: number | null;
  billupsShareGoal: number | null;
  bands?: RagBands;
}

function buildColumns(goals: Goals): Col[] {
  return [
    {
      id: "client",
      label: "Client",
      kind: "text",
      align: "left",
      pinned: true,
      cell: (r) => textOf(r.CLIENT_NAME),
      raw: (r) => textOf(r.CLIENT_NAME),
      foot: () => "Grand total",
    },
    {
      id: "gm",
      label: "GM",
      kind: "text",
      align: "left",
      cell: (r) => textOf(r.GM_POD),
      raw: (r) => textOf(r.GM_POD),
    },
    {
      id: "labs_share",
      label: "Labs Share of Media",
      kind: "pct",
      align: "right",
      cell: (r) => pctOf(labsShare(r)),
      raw: (r) => labsShare(r),
      status: (r, g) => ragStatus(labsShare(r), g.labsShareGoal, { bands: g.bands }),
      foot: (a) => pctOf(safeDiv(a.labsSpend, a.totalSpend)),
    },
    {
      id: "meta_target",
      label: "Meta Target",
      kind: "money",
      align: "right",
      cell: (r) => moneyOf(num(r.target_meta_spend_2026)),
      raw: (r) => num(r.target_meta_spend_2026),
      foot: (a) => moneyOf(a.metaTarget),
      footRaw: (a) => a.metaTarget,
    },
    {
      id: "meta_spend",
      label: "Meta Spend",
      kind: "money",
      align: "right",
      cell: (r) => moneyOf(num(r.meta_spend_2026)),
      raw: (r) => num(r.meta_spend_2026),
      foot: (a) => moneyOf(a.metaSpend),
      footRaw: (a) => a.metaSpend,
    },
    {
      id: "meta_share",
      label: "Meta Share",
      kind: "pct",
      align: "right",
      cell: (r) => pctOf(metaShare(r)),
      raw: (r) => metaShare(r),
      status: (r, g) =>
        ragStatus(metaShare(r), metaShareTarget(r), {
          lowerIsBetter: true,
          bands: g.bands,
        }),
      foot: (a) => pctOf(safeDiv(a.metaSpend, a.social26)),
    },
    {
      id: "meta_share_var",
      label: "Meta Share Var YOY",
      kind: "delta",
      align: "right",
      cell: (r) => {
        const v = metaShareVar(r);
        return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
      },
      raw: (r) => metaShareVar(r),
      foot: (a) => {
        const s26 = safeDiv(a.metaSpend, a.social26);
        const s25 = safeDiv(a.meta25, a.social25);
        const v = s26 === null || s25 === null ? null : s26 - s25;
        return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
      },
    },
    {
      id: "meta_trend",
      label: "Meta Share Trend",
      kind: "text",
      align: "left",
      cell: (r) => textOf(r.meta_share_trend),
      raw: (r) => textOf(r.meta_share_trend),
    },
    {
      id: "billups_ooh",
      label: "Billups OOH Share",
      kind: "pct",
      align: "right",
      cell: (r) => pctOf(oohShare(r)),
      raw: (r) => oohShare(r),
      status: (r, g) => ragStatus(oohShare(r), g.billupsShareGoal, { bands: g.bands }),
      foot: (a) => pctOf(safeDiv(a.oohEligBillups, a.oohEligChannel)),
    },
    {
      id: "billups_print",
      label: "Billups Print Share",
      kind: "pct",
      align: "right",
      cell: (r) => pctOf(printShare(r)),
      raw: (r) => printShare(r),
      status: (r, g) =>
        ragStatus(printShare(r), g.billupsShareGoal, { bands: g.bands }),
      foot: (a) => pctOf(safeDiv(a.printEligBillups, a.printEligChannel)),
    },
    {
      id: "missed",
      label: "$ Missed",
      kind: "money",
      align: "right",
      cell: (r) => moneyOf(missed(r)),
      raw: (r) => missed(r),
      foot: (a) =>
        moneyOf(
          a.oohEligChannel -
            a.oohEligBillups +
            (a.printEligChannel - a.printEligBillups)
        ),
      footRaw: (a) =>
        a.oohEligChannel -
        a.oohEligBillups +
        (a.printEligChannel - a.printEligBillups),
    },
  ];
}

// --- Component ----------------------------------------------------------------

export default function ExecKpisByClientTable({
  rows,
  labsShareGoal = null,
  billupsShareGoal = null,
  bands,
  sourceLabel = "Booked to date (MIR)",
}: {
  rows: KpiByClientRow[];
  labsShareGoal?: number | null;
  billupsShareGoal?: number | null;
  bands?: RagBands;
  sourceLabel?: string;
}) {
  const goals: Goals = useMemo(
    () => ({ labsShareGoal, billupsShareGoal, bands }),
    [labsShareGoal, billupsShareGoal, bands]
  );
  const columns = useMemo(() => buildColumns(goals), [goals]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => num(b.meta_spend_2026) - num(a.meta_spend_2026)),
    [rows]
  );
  const agg = useMemo(() => aggregate(rows), [rows]);

  // Export descriptors (one column per Col; money numeric, %/delta as display).
  const exportColumns = useMemo<TableColumn<KpiByClientRow, Agg>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        label: c.label,
        group: "By client",
        kind: c.kind === "money" ? "money" : c.kind === "text" ? "text" : "percent",
        align: c.align,
        pinned: c.pinned,
        width: c.pinned ? 180 : undefined,
        raw: c.raw,
        display: c.cell,
        total: c.foot ? (a: Agg) => c.foot!(a) : undefined,
        totalRaw: c.footRaw ? (a: Agg) => c.footRaw!(a) : undefined,
      })),
    [columns]
  );

  function downloadCsv() {
    const matrix = buildExportMatrix(exportColumns, sorted, agg, true);
    const csv = matrix.map((row) => row.map(csvField).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exec-kpis-by-client.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div data-scroll-section data-scroll-label="Exec KPIs by client">
      <ChartCard
        title="Exec KPIs by Client"
        subtitle={`${sourceLabel} · ${sorted.length} client${
          sorted.length === 1 ? "" : "s"
        } in scope`}
        icon={Users}
        action={
          rows.length > 0 ? (
            <div className="flex items-center gap-2">
              <ExportSheetButton
                columns={exportColumns}
                rows={sorted}
                totals={agg}
                title="Exec KPIs by Client"
                sheetTitle="Exec KPIs by Client"
                includeTotals
              />
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download />
                CSV
              </Button>
            </div>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-muted-foreground">
            No clients in scope.
          </p>
        ) : (
          <div className="-mx-2 mt-2 max-h-[560px] overflow-auto">
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
                {sorted.map((r, i) => (
                  <tr
                    key={(r.PLUSCO_CLIENT_ID ?? i).toString()}
                    className="border-b border-border/60 transition-colors hover:bg-muted/40"
                  >
                    {columns.map((c) => {
                      const status = c.status ? c.status(r, goals) : "neutral";
                      const tinted = status !== "neutral";
                      return (
                        <td
                          key={c.id}
                          title={c.pinned ? c.cell(r) : undefined}
                          className={`whitespace-nowrap px-3 py-2 ${
                            c.align === "left"
                              ? "text-left"
                              : "text-right tabular-nums"
                          } ${
                            c.pinned
                              ? "sticky left-0 z-10 max-w-[200px] truncate bg-card font-medium text-foreground"
                              : tinted
                                ? ragCell(status)
                                : "text-foreground"
                          }`}
                        >
                          {c.cell(r)}
                        </td>
                      );
                    })}
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
                      {c.foot ? c.foot(agg) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
