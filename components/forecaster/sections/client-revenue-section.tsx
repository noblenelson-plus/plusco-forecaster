// components/forecaster/sections/client-revenue-section.tsx
"use client";

/**
 * Client Revenue section — per-client Primary vs Secondary submission table
 * with variance, rendered from the descriptors in client-revenue-columns.ts.
 *
 * Every header sorts; the whole table exports to Sheets in the order shown.
 * The Grand-total row is pinned to the bottom and computed from the unsorted
 * rows, so display order never affects it. Column headers reflect the live
 * submission + Type selection.
 *
 * Clicking a row sets the page-wide focus. There are no charts under this
 * table, so the effect here is the highlight — the selection carries to the
 * Media & Labs tab, where it drives the charts.
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Table } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { computeClientRevenue, type ClientRevenueRow } from "./client-revenue-data";
import {
  buildClientRevenueColumns,
  type ClientRevenueTotals,
  type RevenueColumn,
} from "./client-revenue-columns";
import { useTableSort } from "../table/use-table-sort";
import ExportSheetButton from "../table/export-sheet-button";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type {
  ScopeForecastData,
  RevenueMode,
} from "../../../lib/dashboard/data/use-scope-forecast-data";

const modeLabel = (mode: RevenueMode) => (mode === "official" ? "OF" : "BL");

/** Matches the client detail table's focus highlight. */
const FOCUS_BG = "bg-yellow-50";

export default function ClientRevenueSection({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
  focusedClientId,
  onFocusChange,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();

  const hasComparison = comparisonData.hasContext;

  const result = useMemo(
    () =>
      computeClientRevenue(
        data,
        comparisonData,
        clients,
        usersMap,
        selectedYear ?? new Date().getFullYear(),
        scopedClientIds,
        primaryMode,
        secondaryMode,
        hasComparison
      ),
    [
      data,
      comparisonData,
      clients,
      usersMap,
      selectedYear,
      scopedClientIds,
      primaryMode,
      secondaryMode,
      hasComparison,
    ]
  );

  const primaryLabel = selectedRFQ
    ? `${selectedRFQ.type}-${modeLabel(primaryMode)} · ${selectedYear}`
    : "Primary";
  const secondaryLabel = comparisonRFQ
    ? `${comparisonRFQ.type}-${modeLabel(secondaryMode)} · ${comparisonYear}`
    : "Secondary";

  // The gradient scale spans the whole table, so it comes from the full row set.
  const maxAbs = useMemo(
    () => result.rows.reduce((max, row) => Math.max(max, Math.abs(row.variance)), 0),
    [result.rows]
  );

  const totals = useMemo<ClientRevenueTotals>(() => {
    const variance = result.totalPrimary - result.totalSecondary;
    return {
      primary: result.totalPrimary,
      secondary: result.totalSecondary,
      variance,
      relative:
        result.totalSecondary > 0 ? (variance / result.totalSecondary) * 100 : null,
    };
  }, [result.totalPrimary, result.totalSecondary]);

  const columns = useMemo(
    () =>
      buildClientRevenueColumns({
        hasComparison,
        maxAbs,
        primaryLabel,
        secondaryLabel,
      }),
    [hasComparison, maxAbs, primaryLabel, secondaryLabel]
  );

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(result.rows), [sortRows, result.rows]);

  /** Clicking the focused row again clears the focus. */
  const toggleFocus = (clientId: string) => {
    onFocusChange(focusedClientId === clientId ? null : clientId);
  };

  if (result.rows.length === 0) return null;

  const headerCell = (column: RevenueColumn) => {
    const direction = directionFor(column.id);
    return (
      <th
        key={column.id}
        className="whitespace-nowrap px-3 py-2 font-medium first:pr-3 first:pl-0 last:pr-0 last:pl-3"
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
  };

  const bodyCell = (column: RevenueColumn, row: ClientRevenueRow) => {
    const style = column.cellStyle?.(row);
    const text = column.display(row);

    if (style) {
      return (
        <td key={column.id} className="px-1 py-1 text-right">
          <span
            className="inline-block w-full rounded px-2 py-1 tabular-nums"
            style={style}
          >
            {text}
          </span>
        </td>
      );
    }

    if (column.kind === "text") {
      return (
        <td
          key={column.id}
          title={text === "—" ? undefined : text}
          className="max-w-[200px] truncate px-3 py-2 text-left text-muted-foreground first:pl-0 first:text-foreground"
        >
          {text}
        </td>
      );
    }

    return (
      <td
        key={column.id}
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground last:pr-0"
      >
        {text}
      </td>
    );
  };

  const footerCell = (column: RevenueColumn) => {
    if (!column.total) return <td key={column.id} className="bg-muted" />;
    return (
      <td
        key={column.id}
        className={`whitespace-nowrap px-3 py-2 tabular-nums ${
          column.align === "right" ? "text-right" : "text-left"
        } first:pl-0 last:pr-0`}
      >
        {column.total(totals)}
      </td>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Client Revenue</h2>
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={totals}
          title={`Client Revenue — ${primaryLabel}${
            hasComparison ? ` vs ${secondaryLabel}` : ""
          }`}
          sheetTitle="Client Revenue"
        />
      </div>

      <ChartCard title="Client Revenue" icon={Table}>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                {columns.map(headerCell)}
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
                    {columns.map((column) => bodyCell(column, row))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {columns.map(footerCell)}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </section>
  );
}