// components/forecaster/sections/client-detail-table.tsx
"use client";

/**
 * Per-client detail table with a Media / Labs toggle and a column picker.
 *
 * The toggle no longer partitions the columns — it applies a default selection
 * over one merged list, so a Labs metric can be shown alongside Media ones.
 * Switching view re-applies that view's preset, discarding manual changes.
 *
 * Clicking a row focuses the page on that client; clicking it again clears the
 * focus. Every row stays visible either way — the table is how you switch
 * between clients, so it must never filter itself down to one.
 *
 * The Grand total is computed from the unsorted rows so it never depends on
 * display order, and stays a whole-scope total regardless of which columns
 * are on screen or which client is focused.
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  buildClientTableColumns,
  clientTablePresets,
  type ClientColumn,
} from "./client-table-columns";
import {
  computeClientTableTotals,
  type ClientTableTotals,
} from "./client-table-totals";
import { pinnedOffsets, visibleColumns } from "../table/table-column.types";
import { useTableSort } from "../table/use-table-sort";
import ColumnPicker from "../table/column-picker";
import ComparisonNote, { useSubmissionLabels } from "../table/comparison-note";
import ExportSheetButton from "../table/export-sheet-button";
import { computeClientTable, type ClientTableRow } from "./client-table-data";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

type View = "media" | "labs";

/**
 * Opaque, not a translucent tint — the frozen columns are sticky, so a
 * see-through background would let scrolled cells show underneath.
 */
const FOCUS_BG = "bg-yellow-50";

/**
 * Default column ids for a view. Column ids do not depend on the comparison
 * state, so the flag passed here is irrelevant to the result.
 */
function presetIdsFor(view: View): Set<string> {
  const columns = buildClientTableColumns({ hasComparison: false });
  const preset = clientTablePresets(columns).find((p) => p.id === view);
  return new Set(preset?.visibleIds ?? []);
}

/** Conditional banding for the Digital Share column. */
function shareBg(value: number | null): string {
  if (value === null) return "";
  if (value >= 0.65) return "bg-green-100 text-green-800";
  if (value > 0.5) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export default function ClientDetailTable({
  data,
  comparisonData,
  scopedClientIds,
  focusedClientId,
  onFocusChange,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
}) {
  const [view, setView] = useState<View>("media");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() =>
    presetIdsFor("media")
  );

  const hasComparison = comparisonData.hasContext;
  const { selectedYear } = useForecastSelection();
  const { primary, comparison } = useSubmissionLabels();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();

  const rows = useMemo(
    () =>
      computeClientTable(
        data,
        comparisonData,
        clients,
        usersMap,
        selectedYear ?? new Date().getFullYear(),
        scopedClientIds
      ),
    [data, comparisonData, clients, usersMap, selectedYear, scopedClientIds]
  );

  // Totals come from the unsorted rows — display order must not affect them.
  const totals = useMemo(() => computeClientTableTotals(rows), [rows]);

  const columns = useMemo(
    () => buildClientTableColumns({ hasComparison }),
    [hasComparison]
  );

  const visible = useMemo(
    () => visibleColumns(columns, visibleIds),
    [columns, visibleIds]
  );

  const offsets = useMemo(() => pinnedOffsets(visible), [visible]);

  // Sort resolves against the visible columns, so hiding a sorted column
  // returns the rows to their natural order instead of sorting invisibly.
  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(visible);
  const sortedRows = useMemo(() => sortRows(rows), [sortRows, rows]);

  const focusedName = useMemo(
    () => rows.find((r) => r.clientId === focusedClientId)?.name ?? null,
    [rows, focusedClientId]
  );

  /** Switching view re-applies its preset, discarding manual selections. */
  const selectView = (next: View) => {
    setView(next);
    setVisibleIds(presetIdsFor(next));
  };

  /** Clicking the focused row again clears the focus. */
  const toggleFocus = (clientId: string) => {
    onFocusChange(focusedClientId === clientId ? null : clientId);
  };

  if (rows.length === 0) return null;

  const stickyStyle = (index: number, column: ClientColumn) => ({
    left: offsets[index],
    minWidth: column.width,
    maxWidth: column.width,
  });

  const headerCell = (column: ClientColumn, index: number) => {
    const direction = directionFor(column.id);
    const label = (
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
    );

    return column.pinned ? (
      <th
        key={column.id}
        className="sticky z-30 whitespace-nowrap bg-muted px-3 py-2 text-left font-medium"
        style={stickyStyle(index, column)}
      >
        {label}
      </th>
    ) : (
      <th
        key={column.id}
        className="whitespace-nowrap px-3 py-2 text-right font-medium"
      >
        {label}
      </th>
    );
  };

  const bodyCell = (
    column: ClientColumn,
    row: ClientTableRow,
    index: number,
    focused: boolean
  ) => {
    if (column.pinned) {
      const text = column.display(row);
      return (
        <td
          key={column.id}
          title={text === "—" ? undefined : text}
          className={`sticky z-10 overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-left text-foreground ${
            focused ? FOCUS_BG : "bg-card"
          }`}
          style={stickyStyle(index, column)}
        >
          {text}
        </td>
      );
    }

    if (column.kind === "share") {
      const value = column.raw(row) as number | null;
      return (
        <td key={column.id} className="px-1 py-1 text-right">
          <span
            className={`inline-block w-full rounded px-2 py-1 tabular-nums ${shareBg(value)}`}
          >
            {column.display(row)}
          </span>
        </td>
      );
    }

    return (
      <td
        key={column.id}
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground"
      >
        {column.display(row)}
      </td>
    );
  };

  const footerCell = (
    column: ClientColumn,
    totalsValue: ClientTableTotals,
    index: number
  ) => {
    if (column.pinned) {
      return (
        <td
          key={column.id}
          className="sticky z-30 whitespace-nowrap bg-muted px-3 py-2 text-left"
          style={stickyStyle(index, column)}
        >
          {index === 0 ? "Grand total" : ""}
        </td>
      );
    }

    if (column.kind === "share") {
      const value = (column.totalRaw?.(totalsValue) ?? null) as number | null;
      return (
        <td key={column.id} className="px-1 py-1 text-right">
          <span
            className={`inline-block w-full rounded px-2 py-1 tabular-nums ${shareBg(value)}`}
          >
            {column.total?.(totalsValue) ?? ""}
          </span>
        </td>
      );
    }

    return (
      <td
        key={column.id}
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
      >
        {column.total?.(totalsValue) ?? ""}
      </td>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Client detail</h2>

        <div className="flex items-center gap-2">
          <ExportSheetButton
            columns={visible}
            rows={sortedRows}
            totals={totals}
            title={`Client detail — ${primary ?? "Forecaster"}${
              comparison ? ` vs ${comparison}` : ""
            }`}
            sheetTitle="Client detail"
          />

          <ColumnPicker
            columns={columns}
            visibleIds={visibleIds}
            onChange={setVisibleIds}
            onReset={() => setVisibleIds(presetIdsFor(view))}
          />

          <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
            {(["media", "labs"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => selectView(v)}
                className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {focusedName && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Charts below show</span>
          <button
            onClick={() => onFocusChange(null)}
            title="Clear focus"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-2 py-1 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {focusedName}
            <X size={12} />
          </button>
          <span>only. The table still lists every client.</span>
        </div>
      )}

      <div className="max-h-[520px] overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              {visible.map(headerCell)}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const focused = row.clientId === focusedClientId;
              return (
                <tr
                  key={row.clientId}
                  onClick={() => toggleFocus(row.clientId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleFocus(row.clientId);
                    }
                  }}
                  tabIndex={0}
                  title={focused ? "Click to clear focus" : `Focus on ${row.name}`}
                  className={`cursor-pointer border-b border-border/60 transition-colors ${
                    focused ? FOCUS_BG : "hover:bg-muted/60"
                  }`}
                >
                  {visible.map((column, index) =>
                    bodyCell(column, row, index, focused)
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
              {visible.map((column, index) => footerCell(column, totals, index))}
            </tr>
          </tfoot>
        </table>
      </div>

      <ComparisonNote />
    </section>
  );
}