// lib/types/forecaster.types.ts

/**
 * Generic data model shared by the 3 data-entry axes (Media, Revenue, Labs).
 *
 * Hierarchy:
 *   Level 1 — Category : BL_INPUT (BL entries) vs ADMIN_INPUT (admin actuals)
 *   Level 2 — Bucket   : a group of rows (project/campaign for Media)
 *   Level 3 — Row      : a typed row (media type / revenue stream / partner)
 *                        carrying 12 monthly values ($)
 *
 * Firestore storage — "data_entries" collection:
 *   Document ID: {cl_id}_{year}_{rfqType}   e.g. "CL_ACME_123_2026_RFQ0"
 *   Each axis's data lives under axes.{axisId}, which lets the service
 *   read/write any axis through a simple dot-path ("axes.media") without
 *   touching the others.
 *
 * Locking is NOT duplicated here: it is owned by the RFQ document
 * ("rfqs" collection, real-time) — a LOCKED RFQ makes every entry
 * read-only, whatever the axis.
 */

import type { MonthlyMap } from "./common.types";
import type { RFQType } from "./rfq.types";

// ─── Axis identifiers and categories ─────────────────────────────────────────

export type AxisId = "media" | "revenue" | "labs";

/** Level 1 — who is allowed to edit the data. */
export type InputCategory = "BL_INPUT" | "ADMIN_INPUT";

// ─── Level 3 — Row ───────────────────────────────────────────────────────────

/**
 * Generic data-entry row.
 * `rowType` is intentionally a free string: MediaType for Media, stream for
 * Revenue, partnerId for Labs. Each axis constrains the allowed values via its
 * AxisConfig (rowTypeOptions).
 */
export interface ForecastRow {
  rowId: string;
  rowType: string;
  /** Displayed label — derived from the type or entered (e.g. partner name). */
  label: string;
  months: MonthlyMap;
}

// ─── Level 2 — Bucket ────────────────────────────────────────────────────────

export interface ForecastBucket {
  bucketId: string;
  name: string;
  rows: ForecastRow[];
}

// ─── Axis data (BL_INPUT + ADMIN_INPUT) ──────────────────────────────────────

export interface AxisData {
  /** BL_INPUT — Business Lead entries, grouped into buckets. */
  buckets: ForecastBucket[];
  /**
   * ADMIN_INPUT — actuals injected by admins (read-only for BLs).
   * One row per rowType (media type for Media), same shape as BL rows but
   * without a bucket: actuals ignore the notion of project.
   */
  actuals: ForecastRow[];
}

// ─── Firestore "data_entries" document ───────────────────────────────────────

export interface DataEntry {
  /** = document ID: {cl_id}_{year}_{rfqType} */
  entry_id: string;
  clientId: string;
  year: number;
  rfq: RFQType;
  axes: Partial<Record<AxisId, AxisData>>;
  createdAt?: string;
  updatedAt?: string;
  lastModifiedBy?: string; // User UID
}

export function buildDataEntryId(
  clientId: string,
  year: number,
  rfq: RFQType
): string {
  return `${clientId}_${year}_${rfq}`;
}

// ─── Axis configuration (what makes the grid reusable) ───────────────────────

export interface RowTypeOption {
  value: string;
  label: string;
}

/**
 * Describes an axis's behavior for the generic grid.
 * Media: multi-bucket (projects), rows typed by media type.
 * Revenue (upcoming): implicit single bucket, rows = streams.
 * Labs (upcoming): single bucket, rows = partners.
 */
export interface AxisConfig {
  axisId: AxisId;
  /** Page / grid title — e.g. "Media Spend". */
  title: string;
  /** Label for a bucket — e.g. "Project". */
  bucketLabel: string;
  /** Label for the row type — e.g. "Media type". */
  rowTypeLabel: string;
  /** Allowed row types (Level 3). */
  rowTypeOptions: RowTypeOption[];
  /** false → a single implicit bucket; the UI hides the group notion. */
  allowMultipleBuckets: boolean;
  /** Can the same rowType value appear twice in a bucket? */
  allowDuplicateRowTypes: boolean;
  /**
   * Label for the actuals source — e.g. "MediaOcean" (Media), "GAIA" (Revenue).
   * Drives the actuals section header and the comparison selector's actuals
   * option, so renaming the source per axis is config-only.
   */
  actualsLabel: string;
}

// ─── Cell coordinates + dirty tracking ───────────────────────────────────────

/**
 * Coordinate of an editable cell.
 * BL_INPUT  → bucketId + rowId set.
 * ADMIN_INPUT (actuals) → bucketId null, rowId = id of the actuals row.
 */
export interface CellCoord {
  category: InputCategory;
  bucketId: string | null;
  rowId: string | null;
  month: number;
}

/** Serialized key for the dirty map — stable and debug-readable. */
export function buildCellKey(coord: CellCoord): string {
  return `${coord.category}:${coord.bucketId ?? "-"}:${coord.rowId ?? "-"}:${coord.month}`;
}

/** Map cell → new value, pending Save. */
export type DirtyMap = Map<string, number>;

// ─── Comparison ──────────────────────────────────────────────────────────────

/**
 * A comparison always opposes a base (the current RFQ's BL_INPUT) to a
 * reference described by `(rfq, side)`. The 3 cases collapse into one:
 *   (other RFQ, BL_INPUT)      → BL vs BL
 *   (current RFQ, ADMIN_INPUT) → BL vs actuals (same RFQ)
 *   (other RFQ, ADMIN_INPUT)   → BL vs actuals (other RFQ)
 * It is always aggregated to the total per rowType × month (no project).
 */
export type ComparisonSide = InputCategory;

export interface ComparisonRef {
  rfq: RFQType;
  side: ComparisonSide;
}

/**
 * Monthly total per rowType for a given side of an AxisData.
 *   BL_INPUT    → aggregates all rows across all buckets (no project).
 *   ADMIN_INPUT → aggregates the actuals rows.
 * Multiple rows of the same type are summed.
 */
export function aggregateByType(
  data: AxisData,
  side: ComparisonSide
): Record<string, MonthlyMap> {
  const rows =
    side === "ADMIN_INPUT" ? data.actuals : data.buckets.flatMap((b) => b.rows);
  const totals: Record<string, MonthlyMap> = {};
  rows.forEach((row) => {
    const acc = (totals[row.rowType] ??= emptyMonthly());
    MONTHS.forEach((m) => {
      acc[m] += row.months[m] ?? 0;
    });
  });
  return totals;
}

export interface CellVariance {
  current: number;
  reference: number;
  absolute: number;        // current − reference
  /** As a % of the reference — null when reference = 0 (division impossible). */
  relative: number | null;
}

export function computeVariance(
  current: number,
  reference: number
): CellVariance {
  const absolute = current - reference;
  return {
    current,
    reference,
    absolute,
    relative: reference !== 0 ? (absolute / reference) * 100 : null,
  };
}

// ─── Factories ───────────────────────────────────────────────────────────────

import { MONTHS } from "./common.types";

export function emptyMonthly(): MonthlyMap {
  return Object.fromEntries(MONTHS.map((m) => [m, 0]));
}

export function emptyAxisData(): AxisData {
  return { buckets: [], actuals: [] };
}

let idCounter = 0;
/** Short client-side unique ID — enough for elements nested inside the doc. */
function localId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function newBucket(name: string): ForecastBucket {
  return { bucketId: localId("bk"), name, rows: [] };
}

export function newRow(rowType: string, label: string): ForecastRow {
  return { rowId: localId("rw"), rowType, label, months: emptyMonthly() };
}

export function newDataEntry(
  clientId: string,
  year: number,
  rfq: RFQType
): DataEntry {
  return {
    entry_id: buildDataEntryId(clientId, year, rfq),
    clientId,
    year,
    rfq,
    axes: {},
  };
}

// ─── Media axis config ───────────────────────────────────────────────────────

import { MEDIA_TYPES, type MediaType } from "./common.types";

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  social: "Social",
  programmatic: "Programmatic",
  ooh: "OOH",
  print: "Print",
  tv: "TV",
  radio: "Radio",
  sem: "SEM",
  digitalDirect: "Digital Direct",
};

export const MEDIA_AXIS_CONFIG: AxisConfig = {
  axisId: "media",
  title: "Media Spend",
  bucketLabel: "Project",
  rowTypeLabel: "Media type",
  rowTypeOptions: MEDIA_TYPES.map((t) => ({
    value: t,
    label: MEDIA_TYPE_LABELS[t],
  })),
  allowMultipleBuckets: true,
  // Two "Social" rows in the same project make no sense — forbidden.
  allowDuplicateRowTypes: false,
  // Media actuals come from MediaOcean. (Revenue's source will be "GAIA".)
  actualsLabel: "MediaOcean",
};