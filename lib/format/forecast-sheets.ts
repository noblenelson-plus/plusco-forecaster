// lib/format/forecast-sheets.ts

/**
 * Builds the three-tab Google Sheets export of a forecast axis (Media / Labs):
 *
 *   1. BL Submission — the editable forecast, one row per Project × Media type.
 *      Project + Media type is a stable key, so this tab is the one an upload
 *      round-trips against (Part 2); the reference tabs are never read back.
 *   2. MediaOcean    — the ADMIN_INPUT actuals, one row per campaign detail line
 *      (Channel · Campaign · Product · Estimate), or the channel row when it has
 *      no detail. Reference only.
 *   3. MediaBox      — the synced MediaBox reference, one row per Campaign ×
 *      Channel. Reference only.
 *
 * Month cells are numbers (rounded), so Sheets keeps them summable. Pure and
 * Firebase-free, like forecast-csv.ts (whose row shaping this mirrors).
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { AxisData, AxisConfig } from "../types/forecaster.types";
import type { MediaboxCSVTypeRow } from "./forecast-csv";

type Cell = string | number;

export interface SheetTab {
  sheetTitle: string;
  matrix: Cell[][];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const sum = (m: MonthlyMap): number =>
  MONTHS.reduce((acc, mo) => acc + (m[mo] ?? 0), 0);

/** 12 rounded month numbers (0 for empty) — summable in Sheets. */
const monthCells = (m: MonthlyMap): number[] =>
  MONTHS.map((mo) => Math.round(m[mo] ?? 0));

export function buildAxisSheetTabs(
  data: AxisData,
  config: AxisConfig,
  mediabox?: MediaboxCSVTypeRow[]
): SheetTab[] {
  // ── BL Submission ─────────────────────────────────────────────────────────
  const blHeader: Cell[] = [
    config.bucketLabel,
    config.rowTypeLabel,
    ...MONTH_LABELS,
    "Total",
  ];
  const blRows: Cell[][] = [];
  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      blRows.push([
        bucket.name,
        row.label,
        ...monthCells(row.months),
        Math.round(sum(row.months)),
      ]);
    }
  }

  // ── MediaOcean (ADMIN_INPUT actuals) ──────────────────────────────────────
  const moHeader: Cell[] = [
    "Channel",
    "Campaign",
    "Product",
    "Estimate",
    ...MONTH_LABELS,
    "Total",
  ];
  const moRows: Cell[][] = [];
  for (const row of data.actuals) {
    const details = row.details ?? [];
    if (details.length === 0) {
      moRows.push([
        row.label,
        "",
        "",
        "",
        ...monthCells(row.months),
        Math.round(sum(row.months)),
      ]);
      continue;
    }
    for (const d of details) {
      moRows.push([
        row.label,
        d.levels[0] ?? "",
        d.levels[1] ?? "",
        d.levels[2] ?? "",
        ...monthCells(d.months),
        Math.round(sum(d.months)),
      ]);
    }
  }

  // ── MediaBox (synced reference) ───────────────────────────────────────────
  const mbHeader: Cell[] = ["Campaign", "Channel", ...MONTH_LABELS, "Total"];
  const mbRows: Cell[][] = [];
  for (const type of mediabox ?? []) {
    if (type.campaigns.length === 0) {
      mbRows.push(["", type.label, ...monthCells(type.byMonth), Math.round(type.total)]);
      continue;
    }
    for (const campaign of type.campaigns) {
      mbRows.push([
        campaign.name,
        type.label,
        ...monthCells(campaign.byMonth),
        Math.round(campaign.total),
      ]);
    }
  }

  return [
    { sheetTitle: "BL Submission", matrix: [blHeader, ...blRows] },
    { sheetTitle: config.actualsLabel, matrix: [moHeader, ...moRows] },
    { sheetTitle: "MediaBox", matrix: [mbHeader, ...mbRows] },
  ];
}