// components/forecaster/sections/labs-target-vs-booked-table.tsx
"use client";

/**
 * Presentational table for the Labs "Target vs Booked by Partner" exec-KPI view
 * (the senior-leadership deck screenshot). Pure UI: it takes the rows + totals
 * produced by useLabsTargetVsBooked (steps 1–2) and renders them on the app's
 * own ChartCard + sortable-table chrome — no fetching, no Looker styling.
 *
 * Columns mirror the deck: Deal Type | Included in RFQ | Partner |
 * PLUSCO Labs Target | RFQ2 Labs Target | Booked to Date | % of PLUSCO | % of RFQ.
 *
 * Gating: RFQ2 target (E) and % of RFQ (H) render "—" for non-forecaster
 * partners (they carry no RFQ2 target). Forecaster ("Included in RFQ") rows get
 * the deck's amber highlight on the checkbox cell.
 *
 * Units: pctOfPlusco / pctOfRfq arrive as FRACTIONS (0.6146), so the % columns
 * multiply by 100 here via `pctText`. Money reuses the app's `pacingMoney`.
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Loader2, Table2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import { useTableSort } from "../table/use-table-sort";
import type { TableColumn } from "../table/table-column.types";
import { pacingMoney } from "./labs-pacing-data";
import type {
  LabsTargetVsBookedRow,
  LabsTargetVsBookedTotals,
} from "./labs-target-vs-booked-data";

/** Amber highlight for forecaster ("Included in RFQ") rows — echoes the deck. */
const INCLUDED_BG = "#f2c94c";
const INCLUDED_FG = "#1f2937";

/** Decimal places on the two % columns (bump to 2 to match the sheet exactly). */
const PCT_DECIMALS = 1;

/** Format a 0..1 fraction as a percent string; null → "—" (the gating dash). */
function pctText(frac: number | null): string {
  return frac === null ? "—" : `${(frac * 100).toFixed(PCT_DECIMALS)}%`;
}

/** Money or "—" for a nullable target (RFQ2 is null for non-forecaster partners). */
function moneyOrDash(value: number | null): string {
  return value === null ? "—" : pacingMoney(value);
}

type Row = LabsTargetVsBookedRow;
type Totals = LabsTargetVsBookedTotals;
type Col = TableColumn<Row, Totals>;

/** The eight deck columns, in deck order. */
export function buildLabsTargetVsBookedColumns(): Col[] {
  return [
    {
      id: "dealType",
      label: "Deal Type",
      group: "Labs",
      kind: "text",
      align: "left",
      raw: (r) => r.dealType,
      display: (r) => r.dealType,
    },
    {
      id: "included",
      label: "Included in RFQ",
      group: "Labs",
      kind: "text",
      align: "left",
      raw: (r) => (r.includedInRfq ? "Yes" : "No"),
      display: (r) => (r.includedInRfq ? "✓" : ""),
      cellStyle: (r) =>
        r.includedInRfq
          ? { backgroundColor: INCLUDED_BG, color: INCLUDED_FG, textAlign: "center" }
          : undefined,
    },
    {
      id: "partner",
      label: "Partner",
      group: "Labs",
      kind: "text",
      align: "left",
      raw: (r) => r.partner,
      display: (r) => r.partner,
      total: () => "Grand total",
      totalRaw: () => "Grand total",
    },
    {
      id: "pluscoTarget",
      label: "PLUSCO Labs Target",
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.pluscoTarget,
      display: (r) => pacingMoney(r.pluscoTarget),
      total: (t) => pacingMoney(t.pluscoTarget),
      totalRaw: (t) => t.pluscoTarget,
    },
    {
      id: "rfq2Target",
      label: "RFQ2 Labs Target",
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.rfq2Target,
      display: (r) => moneyOrDash(r.rfq2Target),
      total: (t) => moneyOrDash(t.rfq2Target),
      totalRaw: (t) => t.rfq2Target,
    },
    {
      id: "booked",
      label: "Booked to Date",
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.booked,
      display: (r) => pacingMoney(r.booked),
      total: (t) => pacingMoney(t.booked),
      totalRaw: (t) => t.booked,
    },
    {
      id: "pctOfPlusco",
      label: "% of PLUSCO Target",
      group: "Labs",
      kind: "percent",
      align: "right",
      raw: (r) => r.pctOfPlusco,
      display: (r) => pctText(r.pctOfPlusco),
      total: (t) => pctText(t.pctOfPlusco),
      totalRaw: (t) => t.pctOfPlusco,
    },
    {
      id: "pctOfRfq",
      label: "% of RFQ Target",
      group: "Labs",
      kind: "percent",
      align: "right",
      raw: (r) => r.pctOfRfq,
      display: (r) => pctText(r.pctOfRfq),
      total: (t) => pctText(t.pctOfRfq),
      totalRaw: (t) => t.pctOfRfq,
    },
  ];
}

export default function LabsTargetVsBookedTable({
  rows,
  totals,
  loading = false,
  title = "Labs — Target vs Booked by Partner",
  subtitle = "PLUSCO vs RFQ2 targets, booked to date (MIR)",
}: {
  rows: Row[];
  totals: Totals;
  loading?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const columns = useMemo(() => buildLabsTargetVsBookedColumns(), []);
  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(rows), [sortRows, rows]);

  const cellClass = (align: "left" | "right") =>
    `whitespace-nowrap px-3 py-2 ${
      align === "right" ? "text-right tabular-nums" : "text-left"
    }`;

  const body = () => {
    if (loading && rows.length === 0) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No labs target data for this selection.
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => {
                const direction = directionFor(column.id);
                return (
                  <th
                    key={column.id}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      title={`Sort by ${column.label}`}
                      className={`flex w-full items-center gap-1 transition-colors hover:text-foreground ${
                        column.align === "right" ? "justify-end" : "justify-start"
                      } ${direction ? "text-foreground" : ""}`}
                    >
                      <span className="truncate">{column.label}</span>
                      {direction === "asc" ? (
                        <ArrowUp size={12} className="shrink-0" />
                      ) : direction === "desc" ? (
                        <ArrowDown size={12} className="shrink-0" />
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.partner}
                className="border-b border-border/60 last:border-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cellClass(column.align)}
                    style={column.cellStyle?.(row)}
                  >
                    {column.display(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              {columns.map((column) => (
                <td key={column.id} className={cellClass(column.align)}>
                  {column.total ? column.total(totals) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      icon={Table2}
      action={
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={totals}
          title={title}
          sheetTitle="Labs Target vs Booked"
        />
      }
    >
      {body()}
    </ChartCard>
  );
}