// components/forecaster/table/text-table.tsx
"use client";

/**
 * Shared sortable/exportable table for text-only detail lists.
 *
 * The Product Overview and Product Adoption tables are the same list of
 * dimension columns with no numeric footer, so they share this component.
 * Rows carry their own `key`, and columns are declared with a compact spec
 * that is expanded into descriptors internally.
 *
 * No grand-total row — counts live in the KPI strip above these tables, and a
 * "Grand total" line under a list of product names would be meaningless.
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { useTableSort } from "./use-table-sort";
import ExportSheetButton from "./export-sheet-button";
import type { TableColumn } from "./table-column.types";

/** Every row must supply a stable React key. */
export interface KeyedRow {
  key: string;
}

/** Compact column declaration, expanded into a descriptor internally. */
export interface TextColumnSpec<Row> {
  id: string;
  label: string;
  get: (row: Row) => string;
  /** Render in muted grey rather than foreground. */
  muted?: boolean;
  /** Truncate beyond this width, with the full value on hover. */
  maxWidth?: number;
}

export default function TextTable<Row extends KeyedRow>({
  title,
  subtitle,
  icon,
  rows,
  columns: specs,
  maxHeight = 360,
  exportTitle,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  rows: Row[];
  columns: TextColumnSpec<Row>[];
  /** Scroll container height in pixels. */
  maxHeight?: number;
  /** Spreadsheet file name. Defaults to the card title. */
  exportTitle?: string;
}) {
  const columns = useMemo<TableColumn<Row, null>[]>(
    () =>
      specs.map((spec) => ({
        id: spec.id,
        label: spec.label,
        group: "Details",
        kind: "text",
        align: "left",
        raw: spec.get,
        display: (row) => spec.get(row) || "—",
      })),
    [specs]
  );

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(rows), [sortRows, rows]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      action={
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={null}
          includeTotals={false}
          title={exportTitle ?? title}
          sheetTitle={title}
        />
      }
    >
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              {columns.map((column) => {
                const direction = directionFor(column.id);
                return (
                  <th
                    key={column.id}
                    className="px-3 py-2 text-left font-medium first:pl-0 last:pr-0"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      title={`Sort by ${column.label}`}
                      className={`flex w-full items-center gap-1 transition-colors hover:text-foreground ${
                        direction ? "text-foreground" : ""
                      }`}
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
              <tr key={row.key} className="border-b border-border/60">
                {columns.map((column, index) => {
                  const spec = specs[index];
                  const text = column.display(row);
                  return (
                    <td
                      key={column.id}
                      title={text === "—" ? undefined : text}
                      className={`truncate px-3 py-2 text-left first:pl-0 last:pr-0 ${
                        spec.muted ? "text-muted-foreground" : "text-foreground"
                      }`}
                      style={spec.maxWidth ? { maxWidth: spec.maxWidth } : undefined}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}