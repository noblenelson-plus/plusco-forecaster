// lib/format/forecast-csv.ts

/**
 * CSV export for a forecast axis (Media Spend, Revenue, Labs).
 *
 * Flattens the axis data — the BL_INPUT buckets/rows first, then the
 * ADMIN_INPUT actuals (MediaOcean), then the optional MediaBox rows — into one
 * line per forecast row, with the 12 months and a row total. The file is built
 * and downloaded entirely client-side via a Blob; nothing is sent to the
 * server.
 *
 * MediaOcean breakdown: when an actuals row carries detail lines, the parent
 * row is NOT emitted — one line per detail is exported instead (its own months,
 * with the parent's type and the detail's free-text `levels` in the three
 * `Detail N` columns). Actuals rows without details export as a single line.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { AxisConfig, AxisData } from "../types/forecaster.types";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Wraps a value in quotes when it contains a comma, quote or newline. */
function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sumMonths(months: MonthlyMap): number {
  return MONTHS.reduce((acc, m) => acc + (months[m] ?? 0), 0);
}

function monthValues(months: MonthlyMap): string[] {
  return MONTHS.map((m) => String(months[m] ?? 0));
}

export interface ForecastCSVContext {
  clientName?: string;
  year?: number | null;
  rfqType?: string;
}

/**
 * MediaBox rows for the export, already converted to CAD — structurally
 * compatible with `MediaboxCadType` (declared locally so lib/format stays
 * Firebase-free). One CSV line is emitted per type × campaign.
 */
export interface MediaboxCSVTypeRow {
  /** Media type on the Media axis, LABS partner on the Labs axis. */
  label: string;
  byMonth: MonthlyMap;
  total: number;
  campaigns: { name: string; byMonth: MonthlyMap; total: number }[];
}

/** Builds the CSV text for one axis (header + one row per forecast line). */
export function buildAxisCSV(
  data: AxisData,
  config: AxisConfig,
  mediabox?: MediaboxCSVTypeRow[]
): string {
  const header = [
    "Section",
    config.bucketLabel,
    config.rowTypeLabel,
    "Label",
    "Detail 1",
    "Detail 2",
    "Detail 3",
    ...MONTH_LABELS,
    "Total",
  ];

  const rows: string[][] = [];

  // BL_INPUT — buckets → rows. No breakdown lines here (details are ADMIN only).
  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      rows.push([
        "BL Input",
        bucket.name,
        row.rowType,
        row.label,
        "", "", "",
        ...monthValues(row.months),
        String(sumMonths(row.months)),
      ]);
    }
  }

  // ADMIN_INPUT — actuals have no bucket. When a row carries detail (breakdown)
  // lines, emit one line per detail INSTEAD of the parent: the detail's own
  // months, with the parent's type and the detail's free-text `levels` spread
  // across the three Detail columns. Rows without details export as one line.
  for (const row of data.actuals) {
    const details = row.details ?? [];
    if (details.length > 0) {
      for (const detail of details) {
        rows.push([
          config.actualsLabel,
          "",
          row.rowType,
          "",
          detail.levels[0] ?? "",
          detail.levels[1] ?? "",
          detail.levels[2] ?? "",
          ...monthValues(detail.months),
          String(sumMonths(detail.months)),
        ]);
      }
    } else {
      rows.push([
        config.actualsLabel,
        "",
        row.rowType,
        row.label,
        "", "", "",
        ...monthValues(row.months),
        String(sumMonths(row.months)),
      ]);
    }
  }

  // MediaBox — one line per type × campaign, in CAD. The campaign takes the
  // bucket column and the type/partner takes the row-type column, so the file
  // pivots the same way as the BL rows.
  for (const type of mediabox ?? []) {
    if (type.campaigns.length === 0) {
      rows.push([
        "MediaBox",
        "",
        type.label,
        "",
        "", "", "",
        ...monthValues(type.byMonth),
        String(type.total),
      ]);
      continue;
    }
    for (const campaign of type.campaigns) {
      rows.push([
        "MediaBox",
        campaign.name,
        type.label,
        "",
        "", "", "",
        ...monthValues(campaign.byMonth),
        String(campaign.total),
      ]);
    }
  }

  return [header, ...rows]
    .map((cells) => cells.map(escapeCSV).join(","))
    .join("\n");
}

/** Builds a descriptive file name: e.g. `media_acme-corp_2026_rfq1.csv`. */
function buildFileName(config: AxisConfig, ctx: ForecastCSVContext): string {
  const slug = (s: string) =>
    s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const parts = [
    config.axisId,
    ctx.clientName ? slug(ctx.clientName) : null,
    ctx.year ? String(ctx.year) : null,
    ctx.rfqType ? ctx.rfqType.toLowerCase() : null,
  ].filter(Boolean);
  return `${parts.join("_")}.csv`;
}

/** Triggers a client-side CSV download of the axis data. */
export function downloadAxisCSV(
  data: AxisData,
  config: AxisConfig,
  context: ForecastCSVContext = {},
  mediabox?: MediaboxCSVTypeRow[]
): void {
  const csv = buildAxisCSV(data, config, mediabox);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFileName(config, context);
  link.click();
  URL.revokeObjectURL(url);
}
