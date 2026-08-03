// components/forecaster/table/variance-table.tsx
"use client";

/**
 * Shared Label / Primary / Comparison / Variance $ / Variance % table.
 *
 * The Media Channels, Digital Channels and Labs Partners tables are the same
 * five columns over different row sets, so they share this component rather
 * than repeating the markup three times. Every header sorts, and the whole
 * table exports to Sheets from the card header.
 *
 * Totals are supplied by the caller — each section derives them differently
 * (scope annual totals, not a sum of the visible rows), so they are never
 * inferred from the rows here.
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { useTableSort } from "./use-table-sort";
import ExportSheetButton from "./export-sheet-button";
import type { TableColumn } from "./table-column.types";
import { formatMoney } from "../../../lib/format/money";

/** The numeric shape every variance row shares. */
export interface VarianceRow {
  primary: number;
  variant: number;
  absolute: number;
  relative: number | null;
}

/** Grand totals for the footer. */
export interface VarianceTotals {
  primary: number;
  variant: number;
  absolute: number;
  relative: number | null;
}

const money = (value: number): string => {
  const formatted = formatMoney(value);
  return formatted === "—" ? formatted : `$${formatted}`;
};

const percent = (relative: number | null): string =>
  relative === null ? "—" : `${relative.toFixed(1)}%`;

export default function VarianceTable<Row extends VarianceRow>({
  title,
  icon,
  rows,
  totals,
  getLabel,
  labelHeader,
  primaryLabel,
  variantLabel,
  hasComparison,
  exportTitle,
}: {
  /** ChartCard title, e.g. "Media Channels". */
  title: string;
  icon?: LucideIcon;
  rows: Row[];
  totals: VarianceTotals;
  /** First-column value — also the React key, so it must be unique. */
  getLabel: (row: Row) => string;
  /** First-column header, e.g. "Channel" or "Partner". */
  labelHeader: string;
  primaryLabel: string;
  variantLabel: string;
  hasComparison: boolean;
  /** Spreadsheet file name. Defaults to the card title. */
  exportTitle?: string;
}) {
  const columns = useMemo<TableColumn<Row, VarianceTotals>[]>(
    () => [
      {
        id: "label",
        label: labelHeader,
        group: "Breakdown",
        kind: "text",
        align: "left",
        raw: getLabel,
        display: getLabel,
        total: () => "Grand total",
        totalRaw: () => "Grand total",
      },
      {
        id: "primary",
        label: primaryLabel,
        group: "Values",
        kind: "money",
        align: "right",
        raw: (row) => row.primary,
        display: (row) => money(row.primary),
        total: (t) => money(t.primary),
        totalRaw: (t) => t.primary,
      },
      {
        id: "variant",
        label: variantLabel,
        group: "Values",
        kind: "money",
        align: "right",
        raw: (row) => (hasComparison ? row.variant : null),
        display: (row) => (hasComparison ? money(row.variant) : "—"),
        total: (t) => (hasComparison ? money(t.variant) : "—"),
        totalRaw: (t) => (hasComparison ? t.variant : null),
      },
      {
        id: "variance",
        label: "Variance $",
        group: "Values",
        kind: "money",
        align: "right",
        raw: (row) => (hasComparison ? row.absolute : null),
        display: (row) => (hasComparison ? money(row.absolute) : "—"),
        total: (t) => (hasComparison ? money(t.absolute) : "—"),
        totalRaw: (t) => (hasComparison ? t.absolute : null),
      },
      {
        id: "variance-pct",
        label: "Variance %",
        group: "Values",
        kind: "percent",
        align: "right",
        raw: (row) => (hasComparison ? row.relative : null),
        display: (row) => (hasComparison ? percent(row.relative) : "—"),
        total: (t) => (hasComparison ? percent(t.relative) : "—"),
        totalRaw: (t) => (hasComparison ? t.relative : null),
      },
    ],
    [getLabel, labelHeader, primaryLabel, variantLabel, hasComparison]
  );

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(rows), [sortRows, rows]);

  return (
    <ChartCard
      title={title}
      icon={icon}
      action={
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={totals}
          title={exportTitle ?? title}
          sheetTitle={title}
        />
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            {columns.map((column) => {
              const direction = directionFor(column.id);
              return (
                <th key={column.id} className="py-2 font-medium">
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
            <tr key={getLabel(row)} className="border-b border-border/60">
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={`py-2 tabular-nums ${
                    column.align === "right"
                      ? "text-right text-muted-foreground"
                      : "text-left text-foreground"
                  } ${column.id === "primary" ? "text-foreground" : ""}`}
                >
                  {column.display(row)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-border font-semibold">
            {columns.map((column) => (
              <td
                key={column.id}
                className={`py-2 tabular-nums text-foreground ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.total?.(totals) ?? ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </ChartCard>
  );
}