// components/forecaster/table/table-column.types.ts

/**
 * Shared column contract for the Forecaster's read-only tables.
 *
 * Every table used to keep its header labels, its formatted body cells and its
 * grand-total cells in three separate index-aligned arrays. Sorting, column
 * hiding and Sheets export all need those three views of a column to stay
 * together, so a column is now a single descriptor instead.
 *
 * A descriptor exposes two values per cell:
 *   - `raw`     the comparable/exportable value (sorting and Google Sheets)
 *   - `display` the formatted string the table renders
 *
 * Descriptors are built by a factory that closes over render-time context
 * (for example whether a comparison submission is selected), so the functions
 * themselves stay unary and pure.
 */
import type { CSSProperties } from "react";
export type ColumnAlign = "left" | "right";

/**
 * Cell semantics. Drives default alignment, export coercion and any
 * conditional styling. `share` is a percent that additionally carries the
 * conditional colour banding (Digital Share).
 */
export type ColumnKind = "text" | "money" | "percent" | "share";

/**
 * One column of a table.
 *
 * `Row` is the per-row source shape (e.g. ClientTableRow) and `Totals` the
 * pre-aggregated summary shape a table computes once for its footer. Totals
 * are passed in rather than derived per column because several of them are
 * weighted ratios that cannot be recovered by summing the row values.
 */
export interface TableColumn<Row, Totals> {
  /**
   * Stable identifier. Persisted in visibility and sort state and used as the
   * export header key, so it must not change once shipped.
   */
  id: string;
  /** Header text shown in the table and in the column picker. */
  label: string;
  /**
   * Picker section this column belongs to (e.g. "Media", "Labs partners").
   * Groups are rendered in first-seen order.
   */
  group: string;
  kind: ColumnKind;
  align: ColumnAlign;
  /**
   * Frozen dimension column: always visible, never offered in the picker, and
   * horizontally sticky. Requires `width`.
   */
  pinned?: boolean;
  /** Fixed pixel width. Required for pinned columns (drives the sticky offsets). */
  width?: number;
  /**
   * Comparable, unformatted value. `null` means "no value" and always sorts
   * last regardless of direction. Numbers are exported to Sheets as numbers.
   */
  raw: (row: Row) => number | string | null;
  /** The string rendered in the body cell. */
  display: (row: Row) => string;
  /**
   * The grand-total cell. Omit for columns that have no meaningful total
   * (dimension columns) — the footer renders an empty cell instead.
   */
  total?: (totals: Totals) => string;
  /** Raw grand-total value for export. Falls back to `total` when omitted. */
  totalRaw?: (totals: Totals) => number | string | null;
  /**
   * Inline style for the body cell, for colouring that cannot be expressed as
   * a fixed class — e.g. a gradient scaled to the largest value in view.
   * Cells carrying a style are rendered inside a padded span, like `share`.
   */
  cellStyle?: (row: Row) => CSSProperties | undefined;
  /** Inline style for the grand-total cell. */
  totalCellStyle?: (totals: Totals) => CSSProperties | undefined;
}

/** Convenience alias when a table's columns are handled generically. */
export type AnyTableColumn = TableColumn<never, never>;

export type SortDirection = "asc" | "desc";

/** Active sort, or `null` when the table is in its natural order. */
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

/**
 * A named default column selection. The Media / Labs toggle is expressed as
 * two presets over one merged column list, which is what lets a Labs metric be
 * switched on while the table sits in Media view.
 */
export interface ColumnPreset {
  id: string;
  label: string;
  /** Column ids checked when this preset is applied. Order is irrelevant. */
  visibleIds: string[];
}

/** Columns a user may toggle: everything that is not pinned. */
export function selectableColumns<R, T>(
  columns: TableColumn<R, T>[]
): TableColumn<R, T>[] {
  return columns.filter((c) => !c.pinned);
}

/**
 * Resolves the columns to render: pinned columns always, then the selected
 * ones in their declared order (never in click order).
 */
export function visibleColumns<R, T>(
  columns: TableColumn<R, T>[],
  visibleIds: ReadonlySet<string>
): TableColumn<R, T>[] {
  return columns.filter((c) => c.pinned || visibleIds.has(c.id));
}

/**
 * Left offset of each pinned column, in declaration order. Non-pinned columns
 * get `0` — they are never sticky, so the value is unused.
 */
export function pinnedOffsets<R, T>(columns: TableColumn<R, T>[]): number[] {
  let running = 0;
  return columns.map((c) => {
    if (!c.pinned) return 0;
    const offset = running;
    running += c.width ?? 0;
    return offset;
  });
}