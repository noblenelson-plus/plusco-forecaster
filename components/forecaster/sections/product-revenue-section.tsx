// components/forecaster/sections/product-revenue-section.tsx
"use client";

/**
 * Product Revenue section — per-product (Product Fees) revenue for the Revenue
 * page. Renders one row per client × product (Client · Product · Business Lead ·
 * Primary · Comparison · Variance $ · Variance %) plus charts shaped for the same
 * components the Product Adoption section uses: ForecasterPieChart (Product Mix,
 * $-weighted) and the Forecaster StackedBarChart (Products by Agency / by Client,
 * distinct-product counts). Laid out as a 2×2 grid: table + client chart on top,
 * mix + agency below.
 *
 * Follows the same Type toggles / submissions as the other Revenue tables, is
 * gated by the Product Fees revenue-type filter, and narrows to the focused
 * client (selected in the Client Revenue table).
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Package, PieChart, BarChart3, Loader2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ForecasterPieChart from "../charts/pie-chart";
import StackedBarChart from "../charts/stacked-bar-chart";
import ExportSheetButton from "../table/export-sheet-button";
import { useTableSort } from "../table/use-table-sort";
import {
  computeProductRevenue,
  buildProductRevenueColumns,
  type ProductRevenueRow,
  type ProductColumn,
} from "./product-revenue-data";
import { useScopeProductRevenue } from "../../../lib/dashboard/data/use-scope-product-revenue";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useProducts } from "../../../lib/hooks/use-products";
import { formatMoney } from "../../../lib/format/money";
import type { RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Currency } from "../../../lib/types/client.types";

const modeLabel = (mode: RevenueMode) => (mode === "official" ? "OF" : "BL");

/** Matches the Client Revenue focus highlight. */
const FOCUS_BG = "bg-yellow-50";

/** Chart value formatter — "$0" for zero (formatMoney returns "—"). */
const moneyFmt = (v: number): string => {
  const f = formatMoney(v);
  return f === "—" ? "$0" : `$${f}`;
};

export default function ProductRevenueSection({
  scopedClientIds,
  primaryMode,
  secondaryMode,
  focusedClientId,
  onFocusChange,
  selectedStreams,
  currencyByClient,
  usdToCad,
  comparisonUsdToCad,
  selMonths,
}: {
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  focusedClientId: string | null;
  onFocusChange: (clientId: string | null) => void;
  selectedStreams: ReadonlySet<string>;
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  comparisonUsdToCad?: number;
  selMonths: number[];
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();
  const { products } = useProducts();

  const hasComparison = comparisonYear !== null && comparisonRFQ !== null;

  const { entries, loading } = useScopeProductRevenue({
    scopedClientIds,
    primary: { year: selectedYear, rfq: selectedRFQ?.type ?? null },
    primaryMode,
    comparison: { year: comparisonYear, rfq: comparisonRFQ?.type ?? null },
    secondaryMode,
    currencyByClient,
    usdToCad,
    comparisonUsdToCad,
    selMonths,
  });

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.productId, p.name])),
    [products]
  );

  // Focus narrows the whole section (table + charts) to one client.
  const viewEntries = useMemo(
    () => (focusedClientId ? entries.filter((e) => e.clientId === focusedClientId) : entries),
    [entries, focusedClientId]
  );

  const result = useMemo(
    () => computeProductRevenue(viewEntries, clients, usersMap, productNameById, selectedStreams),
    [viewEntries, clients, usersMap, productNameById, selectedStreams]
  );

  const primaryLabel = selectedRFQ
    ? `${selectedRFQ.type}-${modeLabel(primaryMode)} · ${selectedYear}`
    : "Primary";
  const secondaryLabel = comparisonRFQ
    ? `${comparisonRFQ.type}-${modeLabel(secondaryMode)} · ${comparisonYear}`
    : "Secondary";

  const columns = useMemo(
    () =>
      buildProductRevenueColumns({
        hasComparison,
        maxAbs: result.maxAbs,
        primaryLabel,
        secondaryLabel,
      }),
    [hasComparison, result.maxAbs, primaryLabel, secondaryLabel]
  );

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(result.rows), [sortRows, result.rows]);

  const toggleFocus = (clientId: string) => {
    onFocusChange(focusedClientId === clientId ? null : clientId);
  };

  if (loading && result.rows.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Product Revenue</h2>
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      </section>
    );
  }

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

  const headerCell = (column: ProductColumn) => {
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

  const bodyCell = (column: ProductColumn, row: ProductRevenueRow) => {
    const style = column.cellStyle?.(row);
    const text = column.display(row);

    if (style) {
      return (
        <td key={column.id} className="px-1 py-1 text-right">
          <span className="inline-block w-full rounded px-2 py-1 tabular-nums" style={style}>
            {text}
          </span>
        </td>
      );
    }

    if (column.kind === "text") {
      // Client and Product read as the row's identity, so both get solid
      // foreground text; the other text columns stay dimmed.
      const emphasize = column.id === "client" || column.id === "product";
      return (
        <td
          key={column.id}
          title={text === "—" ? undefined : text}
          className={`max-w-[200px] truncate px-3 py-2 text-left first:pl-0 ${
            emphasize ? "text-foreground" : "text-muted-foreground"
          }`}
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

  const footerCell = (column: ProductColumn) => {
    if (!column.total) return <td key={column.id} className="bg-muted" />;
    return (
      <td
        key={column.id}
        className={`whitespace-nowrap px-3 py-2 tabular-nums ${
          column.align === "right" ? "text-right" : "text-left"
        } first:pl-0 last:pr-0`}
      >
        {column.total(result.totals)}
      </td>
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Product Revenue</h2>
        <ExportSheetButton
          columns={columns}
          rows={sortedRows}
          totals={result.totals}
          title={`Product Revenue — ${primaryLabel}${hasComparison ? ` vs ${secondaryLabel}` : ""}`}
          sheetTitle="Product Revenue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Product Revenue" icon={Package} className="h-full">
        <div className="max-h-80 overflow-auto">
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
                    key={row.key}
                    onClick={() => toggleFocus(row.clientId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleFocus(row.clientId);
                      }
                    }}
                    tabIndex={0}
                    title={focused ? "Click to clear focus" : `Focus on ${row.clientName}`}
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
        <ChartCard title="Product Mix" icon={PieChart} className="h-full">
          <ForecasterPieChart segments={result.mix} valueFormat={moneyFmt} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Products by Client" icon={BarChart3} className="h-full">
          <div style={{ height: Math.max(240, result.byClient.length * 34 + 60) }}>
            <StackedBarChart rows={result.byClient} colorFor={result.colorFor} layout="horizontal" />
          </div>
        </ChartCard>
        <ChartCard title="Products by Agency" icon={BarChart3} className="h-full">
          <StackedBarChart rows={result.byAgency} colorFor={result.colorFor} layout="vertical" />
        </ChartCard>
      </div>
    </section>
  );
}