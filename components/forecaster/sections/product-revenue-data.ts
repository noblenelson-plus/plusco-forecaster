// components/forecaster/sections/product-revenue-data.ts

/**
 * Builds the per-product Product Revenue view from the self-contained
 * per-product entries (useScopeProductRevenue): the table (one row per
 * client × product), plus the chart datasets, shaped for the SAME components the
 * Product Adoption section uses — ForecasterPieChart (Product Mix) and the
 * Forecaster StackedBarChart (Products by Agency / by Client) — so the two
 * sections look consistent. Products reuse Adoption's PRODUCT_PALETTE, so a given
 * product is the same colour in both places.
 *
 * The pie is $-weighted (revenue share per product); the bars are distinct-
 * product COUNTS per agency / client (matching Adoption's count bars). The $
 * detail lives in the table.
 *
 * The revenue-types filter gates the whole section: Product Revenue IS the
 * Product Fees stream, so when it is deselected there is nothing to show.
 */

import { formatMoney } from "../../../lib/format/money";
import { PRODUCT_PALETTE } from "./product-adoption-data";
import type { CSSProperties } from "react";
import type { TableColumn } from "../table/table-column.types";
import type { StackedRow } from "../charts/stacked-bar-chart";
import type { ProductRevenueEntry } from "../../../lib/dashboard/data/use-scope-product-revenue";
import type { Client } from "../../../lib/types/client.types";

// ─── Table shapes ────────────────────────────────────────────────────────────

export interface ProductRevenueRow {
  key: string;
  clientId: string;
  clientName: string;
  businessLead: string;
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

export interface ProductRevenueResult {
  rows: ProductRevenueRow[];
  totals: ProductRevenueTotals;
  /** Largest absolute variance in view — the variance gradient's scale. */
  maxAbs: number;
  mix: ProductMixSegment[];
  byAgency: StackedRow[];
  byClient: StackedRow[];
  /** Product name → colour, for the shared StackedBarChart. */
  colorFor: (label: string) => string;
}

const FALLBACK_COLOR = "#94a3b8";

const EMPTY: ProductRevenueResult = {
  rows: [],
  totals: { primary: 0, comparison: 0, variance: 0, relative: null },
  maxAbs: 0,
  mix: [],
  byAgency: [],
  byClient: [],
  colorFor: () => FALLBACK_COLOR,
};

/** Max client bars before we cap (keeps the client chart readable). */
const MAX_CLIENT_BARS = 10;

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

  // Stable colour per product NAME (shared with the bars via colorFor).
  const productIds = [...new Set(entries.map((e) => e.productId))].sort();
  const colorByName = new Map<string, string>();
  productIds.forEach((id, i) => {
    colorByName.set(productName(id), PRODUCT_PALETTE[i % PRODUCT_PALETTE.length]);
  });
  const colorFor = (label: string) => colorByName.get(label) ?? FALLBACK_COLOR;

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
      color: colorFor(productName(id)),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  // ── Products by Agency / by Client (distinct-product COUNT, stacked) ──
  const countByGroup = (labelOf: (e: ProductRevenueEntry) => string): StackedRow[] => {
    const groups = new Map<string, Map<string, number>>();
    for (const e of entries) {
      if (e.primary <= 0) continue;
      const group = labelOf(e);
      const inner = groups.get(group) ?? new Map<string, number>();
      inner.set(productName(e.productId), 1); // product present = 1
      groups.set(group, inner);
    }
    return [...groups.entries()]
      .map(([name, products]) => {
        const segments = [...products.entries()].map(([label, value]) => ({ label, value }));
        const total = segments.reduce((a, s) => a + s.value, 0);
        return { name, segments, total };
      })
      .sort((a, b) => b.total - a.total);
  };

  const byAgency = countByGroup((e) => clientById.get(e.clientId)?.CL_Agency ?? "—");
  const byClient = countByGroup(
    (e) => clientById.get(e.clientId)?.CL_Name ?? e.clientId
  ).slice(0, MAX_CLIENT_BARS);

  return { rows, totals, maxAbs, mix, byAgency, byClient, colorFor };
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