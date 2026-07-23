// components/forecaster/sections/client-revenue-columns.ts

/**
 * Column descriptors for the Client Revenue table.
 *
 * The two money headers are dynamic — they name the live submission and Type
 * selection (e.g. "RFQ2-BL · 2026") — so the descriptors are built from
 * render-time context rather than declared as constants.
 *
 * Variance $ keeps Adriana's Looker colouring: a hard red band below −$50,000,
 * otherwise a red→amber→green gradient scaled to the largest magnitude in
 * view. That scale spans the whole table, so it is closed over here rather
 * than derived per cell.
 */

import type { CSSProperties } from "react";
import type { TableColumn } from "../table/table-column.types";
import type { ClientRevenueRow } from "./client-revenue-data";
import { formatMoney } from "../../../lib/format/money";

/** Grand-total figures for the footer row. */
export interface ClientRevenueTotals {
  primary: number;
  secondary: number;
  variance: number;
  relative: number | null;
}

export type RevenueColumn = TableColumn<ClientRevenueRow, ClientRevenueTotals>;

const money = (value: number): string => {
  const formatted = formatMoney(value);
  return formatted === "—" ? formatted : `$${formatted}`;
};

const percent = (relative: number | null): string =>
  relative === null ? "—" : `${relative.toFixed(1)}%`;

/** Below this, the cell is flat red regardless of the gradient. */
const HARD_RED_THRESHOLD = -50000;

function varianceStyle(value: number, maxAbs: number): CSSProperties {
  if (value < HARD_RED_THRESHOLD) {
    return { backgroundColor: "#dc2626", color: "#fff", fontWeight: 600 };
  }
  if (maxAbs === 0) return {};

  const t = Math.max(-1, Math.min(1, value / maxAbs)); // −1 … 0 … +1
  const hue = (t + 1) * 60; // 0 red → 60 amber → 120 green
  const lightness = 90 - Math.abs(t) * 22; // deeper toward the extremes
  return { backgroundColor: `hsl(${hue} 65% ${lightness}%)`, color: "#111827" };
}

export function buildClientRevenueColumns({
  hasComparison,
  maxAbs,
  primaryLabel,
  secondaryLabel,
}: {
  hasComparison: boolean;
  /** Largest absolute variance in view — the gradient's scale. */
  maxAbs: number;
  /** Header for the primary submission, e.g. "RFQ2-BL · 2026". */
  primaryLabel: string;
  /** Header for the comparison submission. */
  secondaryLabel: string;
}): RevenueColumn[] {
  const text = (
    id: string,
    label: string,
    get: (row: ClientRevenueRow) => string
  ): RevenueColumn => ({
    id,
    label,
    group: "Client",
    kind: "text",
    align: "left",
    raw: get,
    display: (row) => get(row) || "—",
  });

  return [
    // The first column carries the footer label, since this table has no
    // pinned columns to anchor it.
    {
      ...text("client", "Client", (row) => row.name),
      total: () => "Grand total",
      totalRaw: () => "Grand total",
    },
    text("business-lead", "Business Lead", (row) => row.businessLead),
    text("fee-structure", "Fee Structure", (row) => row.feeStructure),
    text("status", "Status", (row) => row.status),
    text("notes", "Notes", (row) => row.notes),

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
      id: "secondary",
      label: secondaryLabel,
      group: "Revenue",
      kind: "money",
      align: "right",
      raw: (row) => (hasComparison ? row.secondary : null),
      display: (row) => (hasComparison ? money(row.secondary) : "—"),
      total: (totals) => (hasComparison ? money(totals.secondary) : "—"),
      totalRaw: (totals) => (hasComparison ? totals.secondary : null),
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