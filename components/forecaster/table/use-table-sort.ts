// components/forecaster/table/use-table-sort.ts
"use client";

/**
 * Sort state for a descriptor-driven table.
 *
 * Sorting runs on each column's `raw` value, never on the formatted string —
 * "$9,873,455" sorts above "$65,841,208" alphabetically, which is the bug this
 * exists to avoid.
 *
 * Self-healing: if the sorted column disappears (the picker hides it, or the
 * column set is rebuilt because the comparison submission changed), the sort is
 * simply ignored and rows fall back to natural order. No effect, no reset.
 */

import { useCallback, useMemo, useState } from "react";
import type {
  SortDirection,
  SortState,
  TableColumn,
} from "./table-column.types";

/** Text sorts A→Z first; numbers sort largest-first, as in Looker and Sheets. */
function defaultDirection<R, T>(column: TableColumn<R, T>): SortDirection {
  return column.kind === "text" ? "asc" : "desc";
}

/** Nulls always sort last, whichever direction is active. */
function compareValues(
  a: number | string | null,
  b: number | string | null
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  return String(a).localeCompare(String(b), "en-CA", { sensitivity: "base" });
}

export interface TableSort<R, T> {
  /** Active sort, or null for natural order. */
  sort: SortState | null;
  /** Direction currently applied to a column, for the header indicator. */
  directionFor: (columnId: string) => SortDirection | null;
  /** Cycles a column: default direction → the opposite → off. */
  toggle: (column: TableColumn<R, T>) => void;
  /** Returns a sorted copy. The input array is never mutated. */
  sortRows: (rows: R[]) => R[];
}

export function useTableSort<R, T>(
  columns: TableColumn<R, T>[]
): TableSort<R, T> {
  const [sort, setSort] = useState<SortState | null>(null);

  const toggle = useCallback(
    (column: TableColumn<R, T>) => {
      setSort((current) => {
        if (current?.columnId !== column.id) {
          return { columnId: column.id, direction: defaultDirection(column) };
        }
        // Second click reverses, third click clears.
        return current.direction === defaultDirection(column)
          ? {
              columnId: column.id,
              direction: current.direction === "asc" ? "desc" : "asc",
            }
          : null;
      });
    },
    []
  );

  const directionFor = useCallback(
    (columnId: string): SortDirection | null =>
      sort?.columnId === columnId ? sort.direction : null,
    [sort]
  );

  const activeColumn = useMemo(
    () => columns.find((c) => c.id === sort?.columnId) ?? null,
    [columns, sort]
  );

  const sortRows = useCallback(
    (rows: R[]): R[] => {
      if (!sort || !activeColumn) return rows;
      const factor = sort.direction === "asc" ? 1 : -1;
      // Array.prototype.sort is stable, so equal values keep their original order.
      return rows
        .slice()
        .sort(
          (a, b) =>
            factor * compareValues(activeColumn.raw(a), activeColumn.raw(b))
        );
    },
    [sort, activeColumn]
  );

  return { sort, directionFor, toggle, sortRows };
}