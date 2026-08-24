// filepath: components/forecaster/sections/exec-kpis-by-gm-table.tsx
"use client";

/**
 * Executive Summary — "Exec KPIs by GM" matrix. Metrics are the rows (grouped
 * Labs / Meta / Billups), PlusCo Total + each GM are the columns. Built entirely
 * from the scoped mo_kpi_by_client rows grouped by GM_POD, using the same
 * portfolio math as the other tables (share = sum(numerator) / sum(denominator))
 * and the same Billups eligibility rule, so the Total column equals the sum of
 * the GM columns and the numbers reconcile with the rest of the app.
 *
 * RAG (red/amber/green) is applied only where a real goal exists: Labs Share of
 * Media (vs the Labs share goal), Meta Share (vs each column's own target share,
 * lower-is-better), and Billups OOH / Print Share (vs the Billups goal). Every
 * other cell stays neutral. Export mirrors the matrix to a Google Sheet.
 */

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import {
  ragStatus,
  ragCell,
  type RagStatus,
  type RagBands,
} from "./exec-rag";

// --- Helpers ------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
/** Billups eligibility: eligible unless an explicit negative ("n/a"/"no"/...). */
function parseEligible(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "n/a" || s === "no" || s === "not eligible");
}

type Kind = "money" | "pct" | "delta";

/** Column aggregate: every sum a metric might need, tallied once per column. */
interface Agg {
  labsSpend: number;
  totalSpend: number;
  metaTarget: number;
  metaSpend: number;
  meta25: number;
  social26: number;
  social25: number;
  socialForecast: number;
  divested: number;
  withTrend: number;
  oohEligChannel: number;
  oohEligBillups: number;
  printEligChannel: number;
  printEligBillups: number;
}

function emptyAgg(): Agg {
  return {
    labsSpend: 0,
    totalSpend: 0,
    metaTarget: 0,
    metaSpend: 0,
    meta25: 0,
    social26: 0,
    social25: 0,
    socialForecast: 0,
    divested: 0,
    withTrend: 0,
    oohEligChannel: 0,
    oohEligBillups: 0,
    printEligChannel: 0,
    printEligBillups: 0,
  };
}

function aggregate(rows: KpiByClientRow[]): Agg {
  const a = emptyAgg();
  for (const r of rows) {
    a.labsSpend += num(r.labs_spend_2026);
    a.totalSpend += num(r.total_spend_2026);
    a.metaTarget += num(r.target_meta_spend_2026);
    a.metaSpend += num(r.meta_spend_2026);
    a.meta25 += num(r.meta_spend_2025);
    a.social26 += num(r.social_spend_2026);
    a.social25 += num(r.social_spend_2025);
    a.socialForecast += num(r.social_forecast_rfq1);
    const trend = String(r.meta_share_trend ?? "").trim();
    if (trend) {
      a.withTrend += 1;
      if (trend.toLowerCase().includes("divest")) a.divested += 1;
    }
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

interface MetricDef {
  group: string;
  label: string;
  kind: Kind;
  value: (a: Agg) => number | null;
  status?: (a: Agg) => RagStatus;
}

interface Cell {
  display: string;
  status: RagStatus;
}
interface MetricRow {
  group: string;
  label: string;
  cells: Record<string, Cell>; // keyed by column id ("total" + each GM)
}

function fmt(kind: Kind, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (kind === "money") return `$${Math.round(v).toLocaleString("en-CA")}`;
  return `${(v * 100).toFixed(0)}%`; // pct + delta (sign is carried naturally)
}

const TOTAL_ID = "__total__";

// --- Component ----------------------------------------------------------------

export default function ExecKpisByGmTable({
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
  const { metricRows, gms, exportColumns } = useMemo(() => {
    // Group rows by GM.
    const byGm = new Map<string, KpiByClientRow[]>();
    for (const r of rows) {
      const gm = String(r.GM_POD ?? "").trim() || "Unassigned";
      const list = byGm.get(gm);
      if (list) list.push(r);
      else byGm.set(gm, [r]);
    }
    const gms = Array.from(byGm.keys()).sort((a, b) => a.localeCompare(b));

    // One aggregate per column.
    const totalAgg = aggregate(rows);
    const gmAgg = new Map<string, Agg>();
    for (const gm of gms) gmAgg.set(gm, aggregate(byGm.get(gm)!));

    const metricDefs: MetricDef[] = [
      {
        group: "Labs",
        label: "Labs Share of Media",
        kind: "pct",
        value: (a) => safeDiv(a.labsSpend, a.totalSpend),
        status: (a) =>
          ragStatus(safeDiv(a.labsSpend, a.totalSpend), labsShareGoal, { bands }),
      },
      {
        group: "Meta",
        label: "Meta Target",
        kind: "money",
        value: (a) => a.metaTarget,
      },
      {
        group: "Meta",
        label: "Meta Spend",
        kind: "money",
        value: (a) => a.metaSpend,
      },
      {
        group: "Meta",
        label: "Meta Share",
        kind: "pct",
        value: (a) => safeDiv(a.metaSpend, a.social26),
        status: (a) =>
          ragStatus(
            safeDiv(a.metaSpend, a.social26),
            safeDiv(a.metaTarget, a.socialForecast),
            { lowerIsBetter: true, bands }
          ),
      },
      {
        group: "Meta",
        label: "Meta Share Variance YOY",
        kind: "delta",
        value: (a) => {
          const s26 = safeDiv(a.metaSpend, a.social26);
          const s25 = safeDiv(a.meta25, a.social25);
          return s26 === null || s25 === null ? null : s26 - s25;
        },
      },
      {
        group: "Meta",
        label: "% Clients Divested Meta Share",
        kind: "pct",
        value: (a) => safeDiv(a.divested, a.withTrend),
      },
      {
        group: "Billups",
        label: "Billups OOH Share",
        kind: "pct",
        value: (a) => safeDiv(a.oohEligBillups, a.oohEligChannel),
        status: (a) =>
          ragStatus(
            safeDiv(a.oohEligBillups, a.oohEligChannel),
            billupsShareGoal,
            { bands }
          ),
      },
      {
        group: "Billups",
        label: "Billups Print Share",
        kind: "pct",
        value: (a) => safeDiv(a.printEligBillups, a.printEligChannel),
        status: (a) =>
          ragStatus(
            safeDiv(a.printEligBillups, a.printEligChannel),
            billupsShareGoal,
            { bands }
          ),
      },
      {
        group: "Billups",
        label: "$ Missed",
        kind: "money",
        value: (a) =>
          a.oohEligChannel -
          a.oohEligBillups +
          (a.printEligChannel - a.printEligBillups),
      },
    ];

    const mkCell = (def: MetricDef, a: Agg): Cell => ({
      display: fmt(def.kind, def.value(a)),
      status: def.status ? def.status(a) : "neutral",
    });

    const metricRows: MetricRow[] = metricDefs.map((def) => {
      const cells: Record<string, Cell> = { [TOTAL_ID]: mkCell(def, totalAgg) };
      for (const gm of gms) cells[gm] = mkCell(def, gmAgg.get(gm)!);
      return { group: def.group, label: def.label, cells };
    });

    // Export columns: Group, Metric, PlusCo Total, then one per GM. Everything
    // is exported as its display string (the matrix mixes money/%/pt per row, so
    // a single column can't carry one numeric kind).
    const exportColumns: TableColumn<MetricRow, Record<string, never>>[] = [
      {
        id: "group",
        label: "Group",
        group: "By GM",
        kind: "text",
        align: "left",
        raw: (r) => r.group,
        display: (r) => r.group,
      },
      {
        id: "metric",
        label: "Metric",
        group: "By GM",
        kind: "text",
        align: "left",
        raw: (r) => r.label,
        display: (r) => r.label,
      },
      {
        id: "plusco_total",
        label: "PlusCo Total",
        group: "By GM",
        kind: "text",
        align: "right",
        raw: (r) => r.cells[TOTAL_ID]?.display ?? "—",
        display: (r) => r.cells[TOTAL_ID]?.display ?? "—",
      },
      ...gms.map(
        (gm): TableColumn<MetricRow, Record<string, never>> => ({
          id: gm,
          label: gm,
          group: "By GM",
          kind: "text",
          align: "right",
          raw: (r) => r.cells[gm]?.display ?? "—",
          display: (r) => r.cells[gm]?.display ?? "—",
        })
      ),
    ];

    return { metricRows, gms, exportColumns };
  }, [rows, labsShareGoal, billupsShareGoal, bands]);

  const colCount = 1 + 1 + gms.length; // metric + total + GMs

  return (
    <div data-scroll-section data-scroll-label="Exec KPIs by GM">
      <ChartCard
        title="Exec KPIs by GM"
        subtitle={`${sourceLabel} · grouped by GM`}
        icon={LayoutGrid}
        action={
          rows.length > 0 ? (
            <ExportSheetButton
              columns={exportColumns}
              rows={metricRows}
              totals={{}}
              title="Exec KPIs by GM"
              sheetTitle="Exec KPIs by GM"
              includeTotals={false}
            />
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-muted-foreground">
            No clients in scope.
          </p>
        ) : (
          <div className="-mx-2 mt-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left font-medium">
                    Metric
                  </th>
                  <th className="whitespace-nowrap bg-muted px-3 py-2.5 text-right font-semibold text-foreground">
                    PlusCo Total
                  </th>
                  {gms.map((gm) => (
                    <th
                      key={gm}
                      className="whitespace-nowrap px-3 py-2.5 text-right font-medium"
                    >
                      {gm}
                    </th>
                  ))}
                </tr>
              </thead>
              {["Labs", "Meta", "Billups"].map((group) => {
                const groupRows = metricRows.filter((m) => m.group === group);
                if (groupRows.length === 0) return null;
                return (
                  <tbody key={group}>
                    <tr>
                        <td
                          colSpan={colCount}
                          className="sticky left-0 z-10 border-b border-border bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {group}
                        </td>
                      </tr>
                      {groupRows.map((m) => (
                        <tr
                          key={m.label}
                          className="border-b border-border/60 transition-colors hover:bg-muted/40"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-left font-medium text-foreground">
                            {m.label}
                          </td>
                          <td className="whitespace-nowrap bg-muted/40 px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                            {m.cells[TOTAL_ID]?.display ?? "—"}
                          </td>
                          {gms.map((gm) => {
                            const cell = m.cells[gm];
                            const status = cell?.status ?? "neutral";
                            return (
                              <td
                                key={gm}
                                className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                  status !== "neutral"
                                    ? ragCell(status)
                                    : "text-foreground"
                                }`}
                              >
                                {cell?.display ?? "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
