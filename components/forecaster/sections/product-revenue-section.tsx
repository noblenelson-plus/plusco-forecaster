// components/forecaster/sections/product-revenue-section.tsx
"use client";

/**
 * Product Revenue section — the Product Fees stream, per client, with Primary
 * vs Secondary submission and variance. Reuses the Client Revenue column
 * descriptors and rendering wholesale (ProductRevenueRow is structurally the
 * same as ClientRevenueRow), so sort, export, the red→green variance gradient
 * and the dynamic headers all behave identically.
 *
 * Client-grain only: there is no per-product (Product Name) breakdown yet — the
 * scope hook sums every Product Fees line per client. The pie and product bars
 * from Adriana's mock need per-row product data (a `revenueDetail` on
 * ScopeForecastData), which is the pending Tristan item.
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Package } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import {
  computeProductRevenue,
  type ProductRevenueRow,
} from "./product-revenue-data";
import type { ClientRevenueRow } from "./client-revenue-data";
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

/** Matches the Client Revenue focus highlight. */
const FOCUS_BG = "bg-yellow-50";

export default function ProductRevenueSection({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
  focusedClientId,
  onFocusChange,
  selectedStreams,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
 focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
  selectedStreams: ReadonlySet<string>;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();

  const hasComparison = comparisonData.hasContext;

  const result = useMemo(
    () =>
      computeProductRevenue(
        data,
        comparisonData,
        clients,
        usersMap,
        selectedYear ?? new Date().getFullYear(),
        scopedClientIds,
       primaryMode,
        secondaryMode,
        hasComparison,
        selectedStreams
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
      selectedStreams,
    ]
  );

  const primaryLabel = selectedRFQ
    ? `${selectedRFQ.type}-${modeLabel(primaryMode)} · ${selectedYear}`
    : "Primary";
  const secondaryLabel = comparisonRFQ
    ? `${comparisonRFQ.type}-${modeLabel(secondaryMode)} · ${comparisonYear}`
    : "Secondary";

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

  // ProductRevenueRow and ClientRevenueRow are the same shape; the descriptors
  // read only their shared fields, so product rows are safe here.
  const rowsAsRevenue = result.rows as unknown as ClientRevenueRow[];

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(
    () => sortRows(rowsAsRevenue),
    [sortRows, rowsAsRevenue]
  );

  const toggleFocus = (clientId: string) => {
    onFocusChange(focusedClientId === clientId ? null : clientId);
  };

  if (result.rows.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Product Revenue</h2>
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No product fees for this selection.
        </div>
      </section>
    );
  }

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
        <h2 className="text-base font-semibold text-foreground">Product Revenue</h2>
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={totals}
          title={`Product Revenue — ${primaryLabel}${
            hasComparison ? ` vs ${secondaryLabel}` : ""
          }`}
          sheetTitle="Product Revenue"
        />
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Product Fees per client. Per-product detail is coming once the product
        breakdown is available.
      </p>

      <ChartCard title="Product Revenue" icon={Package}>
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
