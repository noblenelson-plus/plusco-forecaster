// components/forecaster/sections/product-revenue-data.ts

/**
 * Builds the per-product Product Revenue view from the self-contained
 * per-product entries (useScopeProductRevenue): the table (one row per
 * client × product), plus the three chart datasets in Adriana's mock — Product
 * Mix (donut), Products by Agency and Products by Client (horizontal stacked
 * bars).
 *
 * The charts are $-weighted (primary-submission revenue per product), to match
 * the table and read as a revenue view rather than a product count.
 *
 * The revenue-types filter still gates the whole section: Product Revenue IS the
 * Product Fees stream, so when it is deselected there is nothing to show.
 */

import { CATEGORICAL_COLORS } from "../../dashboard/charts/colors";
import { formatMoney } from "../../../lib/format/money";
import type { CSSProperties } from "react";
import type { TableColumn } from "../table/table-column.types";
import type { StackSeries, StackRow } from "../../dashboard/charts/horizontal-stacked-bar";
import type { ProductRevenueEntry } from "../../../lib/dashboard/data/use-scope-product-revenue";
import type { Client } from "../../../lib/types/client.types";

// ─── Table shapes ────────────────────────────────────────────────────────────

export interface ProductRevenueRow {
  key: string;
  clientId: string;
  clientName: string;
  businessLead: string;
  gm: string;
  productName: string;
  primary: number;
  comparison: number;
  variance: number; // primary − comparison
  relative: number | null; // variance %
}

export interface ProductRevenueTotals {
  primary: number;
  comparison: number;
  variance: number;
  relative: number | null;
}

export type ProductColumn = TableColumn<ProductRevenueRow, ProductRevenueTotals>;

// ─── Chart shapes ────────────────────────────────────────────────────────────

export interface ProductMixSegment {
  label: string;
  value: number;
  color: string;
}

export interface StackDataset {
  series: StackSeries[];
  rows: StackRow[];
}

export interface ProductRevenueResult {
  rows: ProductRevenueRow[];
  totals: ProductRevenueTotals;
  /** Largest absolute variance in view — the variance gradient's scale. */
  maxAbs: number;
  mix: ProductMixSegment[];
  byAgency: StackDataset;
  byClient: StackDataset;
}

const EMPTY: ProductRevenueResult = {
  rows: [],
  totals: { primary: 0, comparison: 0, variance: 0, relative: null },
  maxAbs: 0,
  mix: [],
  byAgency: { series: [], rows: [] },
  byClient: { series: [], rows: [] },
};

/** Max horizontal-bar rows before we cap (keeps the client chart readable). */
const MAX_CLIENT_BARS = 20;

const slug = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, "_");

export function computeProductRevenue(
  entries: ProductRevenueEntry[],
  clients: Client[],
  usersMap: Map<string, string>,
  productNameById: Map<string, string>,
  selectedStreams: ReadonlySet<string> | null
): ProductRevenueResult {
  // Product Revenue is the Product Fees stream; hidden when it's filtered out.
  const productFeesOn = selectedStreams === null || selectedStreams.has("productFees");
  if (!productFeesOn || entries.length === 0) return EMPTY;

  const clientById = new Map(clients.map((c) => [c.cl_id, c]));
  const productName = (id: string) => productNameById.get(id) ?? id;

  // Stable color + stack key per product.
  const productIds = [...new Set(entries.map((e) => e.productId))].sort();
  const colorByProduct = new Map(
    productIds.map((id, i) => [id, CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]])
  );
  const keyByProduct = new Map(productIds.map((id) => [id, slug(id)]));

  // ── Table rows ──
  let totalPrimary = 0;
  let totalComparison = 0;
  let maxAbs = 0;

  const rows: ProductRevenueRow[] = entries.map((e) => {
    const client = clientById.get(e.clientId);
    const variance = e.primary - e.comparison;
    totalPrimary += e.primary;
    totalComparison += e.comparison;
    if (Math.abs(variance) > maxAbs) maxAbs = Math.abs(variance);

    return {
      key: `${e.clientId}:${e.productId}`,
      clientId: e.clientId,
      clientName: client?.CL_Name ?? e.clientId,
      businessLead: client?.CL_Business_Lead
        ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead
        : "",
      gm: client?.GM_Pod ?? "",
      productName: productName(e.productId),
      primary: e.primary,
      comparison: e.comparison,
      variance,
      relative: e.comparison > 0 ? (variance / e.comparison) * 100 : null,
    };
  });

  rows.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.productName.localeCompare(b.productName)
  );

  const totalVariance = totalPrimary - totalComparison;
  const totals: ProductRevenueTotals = {
    primary: totalPrimary,
    comparison: totalComparison,
    variance: totalVariance,
    relative: totalComparison > 0 ? (totalVariance / totalComparison) * 100 : null,
  };

  // ── Product Mix (primary $ per product) ──
  const mixMap = new Map<string, number>();
  for (const e of entries) {
    mixMap.set(e.productId, (mixMap.get(e.productId) ?? 0) + e.primary);
  }
  const mix: ProductMixSegment[] = productIds
    .map((id) => ({
      label: productName(id),
      value: mixMap.get(id) ?? 0,
      color: colorByProduct.get(id)!,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  // Shared stack series (products) for both bar charts.
  const series: StackSeries[] = productIds.map((id) => ({
    key: keyByProduct.get(id)!,
    label: productName(id),
    color: colorByProduct.get(id)!,
  }));

  // ── Products by Agency / by Client (primary $, stacked by product) ──
  const groupByPrimary = (labelOf: (e: ProductRevenueEntry) => string): StackRow[] => {
    const byLabel = new Map<string, Record<string, number>>();
    for (const e of entries) {
      if (e.primary <= 0) continue;
      const label = labelOf(e);
      const rec = byLabel.get(label) ?? {};
      const k = keyByProduct.get(e.productId)!;
      rec[k] = (rec[k] ?? 0) + e.primary;
      byLabel.set(label, rec);
    }
    const rowTotal = (values: Record<string, number>) =>
      Object.values(values).reduce((a, b) => a + b, 0);
    return [...byLabel.entries()]
      .map(([label, values]) => ({ label, values }))
      .sort((a, b) => rowTotal(b.values) - rowTotal(a.values));
  };

  const byAgency: StackDataset = {
    series,
    rows: groupByPrimary((e) => clientById.get(e.clientId)?.CL_Agency ?? "—"),
  };
  const byClient: StackDataset = {
    series,
    rows: groupByPrimary(
      (e) => clientById.get(e.clientId)?.CL_Name ?? e.clientId
    ).slice(0, MAX_CLIENT_BARS),
  };

  return { rows, totals, maxAbs, mix, byAgency, byClient };
}

// ─── Columns ─────────────────────────────────────────────────────────────────

const money = (value: number): string => {
  const formatted = formatMoney(value);
  return formatted === "—" ? formatted : `$${formatted}`;
};

const percent = (relative: number | null): string =>
  relative === null ? "—" : `${relative.toFixed(1)}%`;

/** Below this, the variance cell is flat red regardless of the gradient. */
const HARD_RED_THRESHOLD = -50000;

function varianceStyle(value: number, maxAbs: number): CSSProperties {
  if (value < HARD_RED_THRESHOLD) {
    return { backgroundColor: "#dc2626", color: "#fff", fontWeight: 600 };
  }
  if (maxAbs === 0) return {};
  const t = Math.max(-1, Math.min(1, value / maxAbs)); // −1 … 0 … +1
  const hue = (t + 1) * 60; // 0 red → 60 amber → 120 green
  const lightness = 90 - Math.abs(t) * 22;
  return { backgroundColor: `hsl(${hue} 65% ${lightness}%)`, color: "#111827" };
}

export function buildProductRevenueColumns({
  hasComparison,
  maxAbs,
  primaryLabel,
  secondaryLabel,
}: {
  hasComparison: boolean;
  maxAbs: number;
  primaryLabel: string;
  secondaryLabel: string;
}): ProductColumn[] {
  const text = (
    id: string,
    label: string,
    get: (row: ProductRevenueRow) => string
  ): ProductColumn => ({
    id,
    label,
    group: "Product",
    kind: "text",
    align: "left",
    raw: get,
    display: (row) => get(row) || "—",
  });

  return [
    {
      ...text("client", "Client", (row) => row.clientName),
      total: () => "Grand total",
      totalRaw: () => "Grand total",
    },
    text("product", "Product", (row) => row.productName),
    text("business-lead", "Business Lead", (row) => row.businessLead),
    text("gm", "GM", (row) => row.gm),
    {
      id: "primary",
      label: primaryLabel,
      group: "Revenue",
      kind: "money",
      align: "right",
      raw: (row) => row.primary,
      display: (row) => money(row.primary),
      total: (totals) => money(totals.primary),
      totalRaw: (totals) => totals.primary,
    },
    {
      id: "comparison",
      label: secondaryLabel,
      group: "Revenue",
      kind: "money",
      align: "right",
      raw: (row) => (hasComparison ? row.comparison : null),
      display: (row) => (hasComparison ? money(row.comparison) : "—"),
      total: (totals) => (hasComparison ? money(totals.comparison) : "—"),
      totalRaw: (totals) => (hasComparison ? totals.comparison : null),
    },
    {
      id: "variance",
      label: "Variance $",
      group: "Revenue",
      kind: "money",
      align: "right",
      raw: (row) => (hasComparison ? row.variance : null),
      display: (row) => (hasComparison ? money(row.variance) : "—"),
      cellStyle: (row) =>
        hasComparison ? varianceStyle(row.variance, maxAbs) : undefined,
      total: (totals) => (hasComparison ? money(totals.variance) : "—"),
      totalRaw: (totals) => (hasComparison ? totals.variance : null),
    },
    {
      id: "variance-pct",
      label: "Variance %",
      group: "Revenue",
      kind: "percent",
      align: "right",
      raw: (row) => (hasComparison ? row.relative : null),
      display: (row) => (hasComparison ? percent(row.relative) : "—"),
      total: (totals) => (hasComparison ? percent(totals.relative) : "—"),
      totalRaw: (totals) => (hasComparison ? totals.relative : null),
    },
  ];
}