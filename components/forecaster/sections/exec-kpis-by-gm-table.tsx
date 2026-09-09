// components/forecaster/sections/exec-kpis-by-gm-table.tsx
"use client";

/**
 * Executive Summary — "Exec KPIs by GM" matrix. Metrics are the rows (grouped
 * Labs / Billups / Meta / Digital), PlusCo Total + each GM are the columns.
 * Built from the scoped mo_kpi_by_client rows grouped by GM_POD, using the same
 * portfolio math as the other tables (share = sum(numerator) / sum(denominator))
 * and the same Billups eligibility rule, so the Total column equals the sum of
 * the GM columns and the numbers reconcile with the rest of the app.
 *
 * RAG (red/amber/green) colours the GM cells where a real goal exists: Labs Share,
 * % Target (MIR/RFQ), Meta Share (vs each column's own target share,
 * lower-is-better), and Billups OOH / Print Share. Share rows carry their YoY
 * variance inline as a small pill (favorable direction is per-metric) instead of
 * a separate row. Export mirrors the matrix.
 */

import { useMemo, useState, useEffect } from "react";
import { ArrowDown, ArrowUp, ChevronDown, LayoutGrid } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
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
  digital: number;
  digital25: number;
  ddSpend: number;
  dd25: number;
  ddNonDeal: number;
  progSpend: number;
  prog25: number;
  progNonDeal: number;
  labsTarget: number;
  labsBooked: number;
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
    digital: 0,
    digital25: 0,
    ddSpend: 0,
    dd25: 0,
    ddNonDeal: 0,
    progSpend: 0,
    prog25: 0,
    progNonDeal: 0,
    labsTarget: 0,
    labsBooked: 0,
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
    a.digital += num(r.digital_spend_2026);
    a.digital25 += num(r.digital_spend_2025);
    a.ddSpend += num(r.digital_direct_spend_2026);
    a.dd25 += num(r.digital_direct_spend_2025);
    a.ddNonDeal += num(r.dd_nondeal_spend_2026);
    a.progSpend += num(r.prog_spend_2026);
    a.prog25 += num(r.prog_spend_2025);
    a.progNonDeal += num(r.prog_nondeal_spend_2026);
    a.labsTarget += num(r.labs_target_rfq2_2026);
    a.labsBooked += num(r.labs_booked_mir_2026);
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
  /** YoY variance (percentage-point delta) shown inline as a pill on this row. */
  yoy?: (a: Agg) => number | null;
  /** Whether a given YoY delta is favorable (drives the pill's green/red). */
  yoyFavorable?: (delta: number) => boolean;
}

interface YoyPill {
  label: string;
  favorable: boolean;
}
interface Cell {
  display: string;
  status: RagStatus;
  yoy: YoyPill | null;
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

/** Inline YoY delta as percentage points, e.g. "+2pt" / "-11pt". */
function fmtYoy(delta: number): string {
  const pt = Math.round(delta * 100);
  return `${pt >= 0 ? "+" : ""}${pt}pt`;
}

const TOTAL_ID = "__total__";
const HIDDEN_KEY = "execKpisByGm.hiddenMetrics";

/** Dropdown of checkboxes to show/hide metric rows (grouped by section). */
function MetricsMenu({
  metrics,
  hidden,
  onToggle,
  onReset,
}: {
  metrics: { group: string; label: string }[];
  hidden: Set<string>;
  onToggle: (label: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(metrics.map((m) => m.group))];
  const hiddenCount = hidden.size;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
      >
        Metrics{hiddenCount > 0 ? ` (${metrics.length - hiddenCount}/${metrics.length})` : ""}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 max-h-96 w-64 overflow-auto rounded-xl border border-border bg-card p-2 shadow-lg">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-semibold text-foreground">Show metrics</span>
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Reset
              </button>
            </div>
            {groups.map((g) => (
              <div key={g} className="mt-1">
                <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g}
                </div>
                {metrics
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <label
                      key={m.label}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-foreground hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(m.label)}
                        onChange={() => onToggle(m.label)}
                      />
                      {m.label}
                    </label>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
    const { metricRows, gms, exportColumns, groupOrder, allMetrics } = useMemo(() => {
    // Group rows by GM.
    const byGm = new Map<string, KpiByClientRow[]>();
    for (const r of rows) {
      const gm = String(r.GM_POD ?? "").trim() || "Unassigned";
      const list = byGm.get(gm);
      if (list) list.push(r);
      else byGm.set(gm, [r]);
    }
    const gms = Array.from(byGm.keys()).sort((a, b) => a.localeCompare(b));

    const totalAgg = aggregate(rows);
    const gmAgg = new Map<string, Agg>();
    for (const gm of gms) gmAgg.set(gm, aggregate(byGm.get(gm)!));

    const metricDefs: MetricDef[] = [
      // ── Labs ──────────────────────────────────────────────────────────────
      {
        group: "Labs",
        label: "Labs Share of Media",
        kind: "pct",
        value: (a) => safeDiv(a.labsSpend, a.totalSpend),
        status: (a) =>
          ragStatus(safeDiv(a.labsSpend, a.totalSpend), labsShareGoal, { bands }),
      },
      {
        group: "Labs",
        label: "Labs RFQ Target (RFQ2)",
        kind: "money",
        value: (a) => a.labsTarget,
      },
      {
        group: "Labs",
        label: "Labs Booked to Date (MIR)",
        kind: "money",
        value: (a) => a.labsBooked,
      },
      {
        group: "Labs",
        label: "% Target (MIR/RFQ)",
        kind: "pct",
        value: (a) => safeDiv(a.labsBooked, a.labsTarget),
        status: (a) => ragStatus(safeDiv(a.labsBooked, a.labsTarget), 1, { bands }),
      },
      // ── Billups ───────────────────────────────────────────────────────────
      {
        group: "Billups",
        label: "Billups OOH Share",
        kind: "pct",
        value: (a) => safeDiv(a.oohEligBillups, a.oohEligChannel),
        status: (a) =>
          ragStatus(safeDiv(a.oohEligBillups, a.oohEligChannel), billupsShareGoal, { bands }),
      },
      {
        group: "Billups",
        label: "Billups Print Share",
        kind: "pct",
        value: (a) => safeDiv(a.printEligBillups, a.printEligChannel),
        status: (a) =>
          ragStatus(safeDiv(a.printEligBillups, a.printEligChannel), billupsShareGoal, { bands }),
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
      // ── Meta ──────────────────────────────────────────────────────────────
      {
        group: "Meta",
        label: "Meta Target",
        kind: "money",
        value: (a) => a.metaTarget,
      },
      {
        group: "Meta",
        label: "Meta Target Share",
        kind: "pct",
        value: (a) => safeDiv(a.metaTarget, a.socialForecast),
        // Divestment: target share below last year's actual is favorable.
        yoy: (a) => {
          const t26 = safeDiv(a.metaTarget, a.socialForecast);
          const s25 = safeDiv(a.meta25, a.social25);
          return t26 === null || s25 === null ? null : t26 - s25;
        },
        yoyFavorable: (d) => d < 0,
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
        // Lower Meta share YoY is favorable (divestment).
        yoy: (a) => {
          const s26 = safeDiv(a.metaSpend, a.social26);
          const s25 = safeDiv(a.meta25, a.social25);
          return s26 === null || s25 === null ? null : s26 - s25;
        },
        yoyFavorable: (d) => d < 0,
      },
      {
        group: "Meta",
        label: "% Clients Divested Meta Share",
        kind: "pct",
        value: (a) => safeDiv(a.divested, a.withTrend),
      },
      // ── Digital ───────────────────────────────────────────────────────────
      {
        group: "Digital",
        label: "Digital Direct Share of Digital",
        kind: "pct",
        value: (a) => safeDiv(a.ddSpend, a.digital),
        // Strategy = decrease Digital Direct → a lower share YoY is favorable.
        yoy: (a) => {
          const s26 = safeDiv(a.ddSpend, a.digital);
          const s25 = safeDiv(a.dd25, a.digital25);
          return s26 === null || s25 === null ? null : s26 - s25;
        },
        yoyFavorable: (d) => d < 0,
      },
      {
        group: "Digital",
        label: "Digital Direct $ Non-Deal",
        kind: "money",
        value: (a) => a.ddNonDeal,
      },
      {
        group: "Digital",
        label: "Prog Share of Digital",
        kind: "pct",
        value: (a) => safeDiv(a.progSpend, a.digital),
        // Strategy = grow Programmatic → a higher share YoY is favorable.
        yoy: (a) => {
          const s26 = safeDiv(a.progSpend, a.digital);
          const s25 = safeDiv(a.prog25, a.digital25);
          return s26 === null || s25 === null ? null : s26 - s25;
        },
        yoyFavorable: (d) => d > 0,
      },
      {
        group: "Digital",
        label: "Prog $ Non-Deal",
        kind: "money",
        value: (a) => a.progNonDeal,
      },
    ];

    const mkCell = (def: MetricDef, a: Agg): Cell => {
      const yoyDelta = def.yoy ? def.yoy(a) : null;
      return {
        display: fmt(def.kind, def.value(a)),
        status: def.status ? def.status(a) : "neutral",
        yoy:
          yoyDelta != null && Number.isFinite(yoyDelta)
            ? {
                label: fmtYoy(yoyDelta),
                favorable: def.yoyFavorable ? def.yoyFavorable(yoyDelta) : yoyDelta >= 0,
              }
            : null,
      };
    };

    // Section order follows metricDefs (no hard-coded list to drift).
    const groupOrder = [...new Set(metricDefs.map((d) => d.group))];

    const metricRows: MetricRow[] = metricDefs.map((def) => {
      const cells: Record<string, Cell> = { [TOTAL_ID]: mkCell(def, totalAgg) };
      for (const gm of gms) cells[gm] = mkCell(def, gmAgg.get(gm)!);
      return { group: def.group, label: def.label, cells };
    });

    // Export: value display + (when present) the YoY delta appended, so the sheet
    // keeps the variance that the inline pill shows on screen.
    const exportDisplay = (c: Cell | undefined): string => {
      if (!c) return "—";
      return c.yoy ? `${c.display} (${c.yoy.label} YoY)` : c.display;
    };
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
        raw: (r) => exportDisplay(r.cells[TOTAL_ID]),
        display: (r) => exportDisplay(r.cells[TOTAL_ID]),
      },
      ...gms.map(
        (gm): TableColumn<MetricRow, Record<string, never>> => ({
          id: gm,
          label: gm,
          group: "By GM",
          kind: "text",
          align: "right",
          raw: (r) => exportDisplay(r.cells[gm]),
          display: (r) => exportDisplay(r.cells[gm]),
        })
      ),
    ];

        const allMetrics = metricDefs.map((d) => ({ group: d.group, label: d.label }));
    return { metricRows, gms, exportColumns, groupOrder, allMetrics };
  }, [rows, labsShareGoal, billupsShareGoal, bands]);

    // Persisted show/hide selection for metric rows.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch {
      /* ignore */
    }
  }, [hidden]);
  const toggleMetric = (label: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const resetMetrics = () => setHidden(new Set());

  const colCount = 1 + 1 + gms.length; // metric + total + GMs

  const YoyBadge = ({ yoy }: { yoy: YoyPill }) => (
    <span
      className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold ${
        yoy.favorable
          ? "bg-emerald-500/10 text-emerald-700"
          : "bg-rose-500/10 text-rose-700"
      }`}
    >
      {yoy.label.startsWith("-") ? <ArrowDown size={9} /> : <ArrowUp size={9} />}
      {yoy.label}
    </span>
  );

  return (
    <div data-scroll-section data-scroll-label="Exec KPIs by GM">
      <ChartCard
        title="Exec KPIs by GM"
        subtitle={`${sourceLabel} · grouped by GM`}
        icon={LayoutGrid}
                action={
          rows.length > 0 ? (
            <div className="flex items-center gap-2">
              <MetricsMenu
                metrics={allMetrics}
                hidden={hidden}
                onToggle={toggleMetric}
                onReset={resetMetrics}
              />
              <ExportSheetButton
                columns={exportColumns}
                rows={metricRows}
                totals={{}}
                title="Exec KPIs by GM"
                sheetTitle="Exec KPIs by GM"
                includeTotals={false}
              />
            </div>
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
              {groupOrder.map((group) => {
                               const groupRows = metricRows.filter(
                  (m) => m.group === group && !hidden.has(m.label)
                );
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
                          {m.cells[TOTAL_ID]?.yoy && (
                            <YoyBadge yoy={m.cells[TOTAL_ID]!.yoy!} />
                          )}
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
                              {cell?.yoy && <YoyBadge yoy={cell.yoy} />}
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