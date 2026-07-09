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
import type { RFQ, RFQType } from "./rfq.types";
import { RFQ_TYPE_ORDER } from "./rfq.types";

// ─── Axis identifiers and categories ─────────────────────────────────────────

export type AxisId = "media" | "revenue" | "labs";

/** Level 1 — who is allowed to edit the data. */
export type InputCategory = "BL_INPUT" | "ADMIN_INPUT";

// ─── Level 3 — Row ───────────────────────────────────────────────────────────

/** Number of free-text info fields ("levels") on a detail line. */
export const DETAIL_LEVEL_COUNT = 3;

/**
 * A breakdown line under an ADMIN_INPUT (actuals) row. Purely an annotation:
 * its budget is NOT rolled up into the parent row's total — the parent keeps its
 * own monthly values, entered independently.
 *
 * `levels` are generic, header-less info slots (always DETAIL_LEVEL_COUNT of
 * them, padded with ""). Each parent row uses them for whatever fits — a project
 * name on one row, an admin number on another — so they carry no fixed meaning.
 */
export interface RowDetail {
  detailId: string;
  /** Free-text info fields, always DETAIL_LEVEL_COUNT entries (empty = unused). */
  levels: string[];
  /** 12-month budget of this detail line (independent of the parent total). */
  months: MonthlyMap;
}

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
  /** Optional free-text note attached to the line. Absent when empty. */
  note?: string;
  /**
   * Optional breakdown lines (ADMIN_INPUT rows only). Shown when the row is
   * expanded in the grid. Absent when none have been added.
   */
  details?: RowDetail[];
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

/**
 * Per-side "last updated" stamps for an axis. BL_INPUT (buckets) and ADMIN_INPUT
 * (actuals) are tracked independently so each can show its own last-save time.
 * Stored under `axisMeta.{axisId}` on the doc that owns each side (data_entries
 * for BL and Revenue's actuals; annual_actuals for Media/Labs actuals).
 */
export interface AxisMeta {
  blUpdatedAt?: string;
  actualsUpdatedAt?: string;
}

export interface DataEntry {
  /** = document ID: {cl_id}_{year}_{rfqType} */
  entry_id: string;
  clientId: string;
  year: number;
  rfq: RFQType;
  axes: Partial<Record<AxisId, AxisData>>;
  /** Per-axis, per-side last-save timestamps (BL for every axis; actuals for
   *  per-submission axes like Revenue). */
  axisMeta?: Partial<Record<AxisId, AxisMeta>>;
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

// ─── Annual actuals (Media / Labs ADMIN_INPUT) ───────────────────────────────

/**
 * Firestore "annual_actuals" document — one per {client, year}.
 *
 * For axes with `annualActuals` (Media, Labs), the ADMIN_INPUT (actuals) is a
 * single annual value shared by every submission of the year, rather than one
 * copy per RFQ. Each axis's actuals rows live under axes.{axisId}, mirroring
 * the data_entries dot-path so the same ForecastRow shape and helpers apply.
 * Revenue is absent here — its GAIA actuals stay per-submission in data_entries.
 */
export interface AnnualActuals {
  /** = document ID: {cl_id}_{year} */
  entry_id: string;
  clientId: string;
  year: number;
  axes: Partial<Record<AxisId, ForecastRow[]>>;
  /** Per-axis last-save timestamp for the annual actuals (only actualsUpdatedAt). */
  axisMeta?: Partial<Record<AxisId, AxisMeta>>;
  createdAt?: string;
  updatedAt?: string;
  lastModifiedBy?: string; // User UID
}

export function buildAnnualActualsId(clientId: string, year: number): string {
  return `${clientId}_${year}`;
}

// ─── Axis configuration (what makes the grid reusable) ───────────────────────

export interface RowTypeOption {
  value: string;
  /** Stored on the row when added (e.g. the partner name). */
  label: string;
  /** Optional secondary text shown only in the add dropdown (e.g. media type). */
  hint?: string;
  /**
   * Optional description — disambiguates options that share a label (e.g. two
   * Labs partners with the same name and media type). Shown in the add dropdown
   * and the comparison panel.
   */
  description?: string;
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
  /**
   * true → ADMIN_INPUT (actuals) is a single annual value per {client, year},
   * stored in the "annual_actuals" collection and shared across every
   * submission of the year (Media, Labs). false → actuals are per-submission,
   * stored in the data_entries axis like the BL_INPUT (Revenue's GAIA).
   */
  annualActuals: boolean;
}

// ─── Cell coordinates + dirty tracking ───────────────────────────────────────

/**
 * Coordinate of an editable cell.
 * BL_INPUT  → bucketId + rowId set.
 * ADMIN_INPUT (actuals) → bucketId null, rowId = id of the actuals row.
 * A detail-line budget cell sets `detailId` on top of an ADMIN_INPUT coord.
 */
export interface CellCoord {
  category: InputCategory;
  bucketId: string | null;
  rowId: string | null;
  /** Set only for a detail-line cell — the parent stays in `rowId`. */
  detailId?: string | null;
  month: number;
}

/** Serialized key for the dirty map — stable and debug-readable. */
export function buildCellKey(coord: CellCoord): string {
  return `${coord.category}:${coord.bucketId ?? "-"}:${coord.rowId ?? "-"}:${coord.detailId ?? "-"}:${coord.month}`;
}

/** Map cell → new value, pending Save. */
export type DirtyMap = Map<string, number>;

// ─── Comparison ──────────────────────────────────────────────────────────────

/**
 * A comparison always opposes a base (the current submission's BL_INPUT) to a
 * reference described by `(year, rfq, side)` — any submission of any year, on
 * either side:
 *   (any submission, BL_INPUT)    → BL vs BL (cross-year allowed)
 *   (any submission, ADMIN_INPUT) → BL vs actuals
 * For annual-actuals axes (Media, Labs) the ADMIN_INPUT side resolves to the
 * year's single annual MediaOcean — `rfq` is then irrelevant. For Revenue the
 * ADMIN_INPUT side is that submission's GAIA actuals.
 * It is always aggregated to the total per rowType × month (no project).
 */
export type ComparisonSide = InputCategory;

export interface ComparisonRef {
  year: number;
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

// ─── Default comparison reference ("previous submission") ────────────────────

/** Chronological rank of a submission across years: year first, then RFQ order. */
function rfqRank(year: number, rfq: RFQType): number {
  return year * 10 + RFQ_TYPE_ORDER[rfq];
}

/**
 * The submission immediately preceding `(year, rfq)` among the existing RFQs
 * (any year), ordered by year then RFQ_TYPE_ORDER. null when none precedes it.
 */
export function previousRFQ(
  allRfqs: Pick<RFQ, "year" | "type">[],
  year: number,
  rfq: RFQType
): { year: number; rfq: RFQType } | null {
  const currentRank = rfqRank(year, rfq);
  let best: { year: number; rfq: RFQType; rank: number } | null = null;
  for (const r of allRfqs) {
    const rank = rfqRank(r.year, r.type);
    if (rank >= currentRank) continue;
    if (!best || rank > best.rank) best = { year: r.year, rfq: r.type, rank };
  }
  return best ? { year: best.year, rfq: best.rfq } : null;
}

/**
 * Default comparison for a freshly selected submission: the previous submission,
 * on the side that fits the axis — BL Input for Media/Labs, GAIA (ADMIN_INPUT)
 * for Revenue. null when there is no earlier submission to compare against.
 */
export function defaultComparisonRef(
  config: AxisConfig,
  currentYear: number,
  currentRfq: RFQType,
  allRfqs: Pick<RFQ, "year" | "type">[]
): ComparisonRef | null {
  const prev = previousRFQ(allRfqs, currentYear, currentRfq);
  if (!prev) return null;
  const side: ComparisonSide =
    config.axisId === "revenue" ? "ADMIN_INPUT" : "BL_INPUT";
  return { year: prev.year, rfq: prev.rfq, side };
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

/** Name of the auto-managed lone project (Media/Labs). */
export const GENERAL_PROJECT_NAME = "General";

/**
 * Media/Labs normalizer: a single project is always present and named "General".
 * With no buckets it seeds one; with exactly one it forces the "General" name
 * (the lone project's name is auto-managed and locked in the UI). Two or more
 * buckets are left untouched — names become user-controlled again. Used as the
 * grid's `normalizeLoaded`, so the result is part of the clean snapshot and the
 * seeded/renamed project never reads as an unsaved change. The bucket name is a
 * display-only label (comparison aggregates by rowType, ignoring projects), so
 * forcing it is safe.
 */
export function ensureSingleProjectGeneral(data: AxisData): AxisData {
  if (data.buckets.length === 0) {
    return { ...data, buckets: [newBucket(GENERAL_PROJECT_NAME)] };
  }
  if (
    data.buckets.length === 1 &&
    data.buckets[0].name !== GENERAL_PROJECT_NAME
  ) {
    return {
      ...data,
      buckets: [{ ...data.buckets[0], name: GENERAL_PROJECT_NAME }],
    };
  }
  return data;
}

export function newRow(rowType: string, label: string): ForecastRow {
  return { rowId: localId("rw"), rowType, label, months: emptyMonthly() };
}

export function newDetail(): RowDetail {
  return {
    detailId: localId("dt"),
    levels: Array.from({ length: DETAIL_LEVEL_COUNT }, () => ""),
    months: emptyMonthly(),
  };
}

// ─── ADMIN_INPUT detail roll-up ──────────────────────────────────────────────

/** Sum of a detail set's 12-month budgets. */
export function detailMonthTotals(details: RowDetail[]): MonthlyMap {
  const totals = emptyMonthly();
  for (const d of details)
    for (const m of MONTHS) totals[m] += d.months[m] ?? 0;
  return totals;
}

/**
 * An ADMIN_INPUT row carrying detail lines derives its months from them
 * (row = sum of its details); its cells are read-only in the grid. A row
 * without details keeps its hand-entered months. Returns the same reference
 * when there is nothing to derive.
 */
export function rollUpDetailMonths(row: ForecastRow): ForecastRow {
  if (!row.details || row.details.length === 0) return row;
  return { ...row, months: detailMonthTotals(row.details) };
}

/** Applies the detail roll-up to a whole actuals set. */
export function rollUpActuals(rows: ForecastRow[]): ForecastRow[] {
  return rows.map(rollUpDetailMonths);
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
  // MediaOcean is a single annual figure, shared across the year's submissions.
  annualActuals: true,
};

// ─── Labs axis config ────────────────────────────────────────────────────────

import type { LabsPartner } from "./labs.types";

/**
 * Labs mirrors Media (multi-bucket projects, MediaOcean actuals), with one
 * difference: its row types are not a static list but the lab partners
 * configured for the selected year in admin/labs. Hence a factory rather than a
 * constant — the page rebuilds it from the year's partners.
 *
 * `rowType` carries the partner id (stable across RFQ docs, so comparison still
 * matches by bucket name + rowType); the label is the partner name, captured on
 * the row at add-time, so a row keeps its name even if the partner is later
 * removed from the year's config (it then shows as "not configured" in the grid).
 *
 * Two partners may share a name and media type (distinguished only by their
 * description), so the description rides along on each option to tell them apart
 * in the add dropdown and the comparison panel.
 */
export function buildLabsAxisConfig(partners: LabsPartner[]): AxisConfig {
  return {
    axisId: "labs",
    title: "Labs",
    bucketLabel: "Project",
    rowTypeLabel: "Partner",
    rowTypeOptions: partners.map((p) => ({
      value: p.partnerId,
      label: p.name,
      hint: MEDIA_TYPE_LABELS[p.mediaType],
      description: p.description,
    })),
    allowMultipleBuckets: true,
    // The same partner twice in one project makes no sense — forbidden.
    allowDuplicateRowTypes: false,
    // Labs actuals come from MediaOcean, like Media.
    actualsLabel: "MediaOcean",
    // Like Media, MediaOcean is annual — one value per year, shared across RFQs.
    annualActuals: true,
  };
}

// ─── Revenue axis config ─────────────────────────────────────────────────────

/**
 * Revenue stream identifiers. Aligned with the dashboard's stream keys
 * (lib/dashboard/data/aggregate.ts) so the same `rowType` values flow through
 * the grid, the comparison panel and the dashboard.
 *
 * Unlike Media/Labs, Revenue has no project notion: a single implicit bucket
 * holds one fixed row per BL stream, and the grid offers no add/remove. The
 * Commission BL row is computed (media spend × commission rate), not entered —
 * see lib/format/revenue-commission.ts.
 */
export type RevenueStream =
  | "retainer"
  | "commission"
  | "projectFees"
  | "productFees"
  | "unallocated"
  | "accrual"
  | "gaiaForecast";

export const REVENUE_STREAM_LABELS: Record<RevenueStream, string> = {
  retainer: "Retainer",
  commission: "Commission",
  projectFees: "Project Fees",
  productFees: "Product Fees",
  unallocated: "Unallocated",
  accrual: "Accrual",
  gaiaForecast: "Official Revenue",
};

/** The Commission BL row is calculated — read-only, never hand-entered. */
export const REVENUE_COMMISSION_TYPE: RevenueStream = "commission";

/**
 * The Accrual BL row is a fixed line used to report revenue — such as
 * commission — that was not captured in GAIA during locked (closed) months.
 * Like Commission it is always present (seeded by `ensureRevenueShape`) and
 * cannot be removed, but unlike Commission its values are hand-entered.
 */
export const REVENUE_ACCRUAL_TYPE: RevenueStream = "accrual";

/**
 * Official Revenue (stored as `gaiaForecast`) — the hand-entered official
 * figure, admin-only like the other ADMIN_INPUT streams. It IS the Official
 * Revenue directly (no prioritization); the grid renders it as the single
 * editable emerald row at the bottom of the table, separate from the GAIA
 * detail streams. The key stays `gaiaForecast` for data compatibility — only
 * the display label changed to "Official Revenue".
 */
export const REVENUE_GAIA_FORECAST_TYPE: RevenueStream = "gaiaForecast";

/** BL Input streams, in display order. */
export const REVENUE_BL_STREAMS: RevenueStream[] = [
  "retainer",
  "commission",
  "projectFees",
  "productFees",
  "accrual",
];

/**
 * BL Input streams the user may add extra lines of. Commission is excluded
 * (it is the single computed row); the four base streams are always seeded by
 * `ensureRevenueShape`, but these three can have multiple lines.
 */
export const REVENUE_BL_ADDABLE_STREAMS: RevenueStream[] = [
  "retainer",
  "projectFees",
  "productFees",
];

/**
 * Admin Input (GAIA) streams — the Official Revenue source-of-truth line
 * (`gaiaForecast`, rendered separately at the bottom of the grid), then the BL
 * four plus Unallocated and Accrual. The order here also drives the seeded
 * actuals row order (ensureRevenueShape).
 */
export const REVENUE_ADMIN_STREAMS: RevenueStream[] = [
  "gaiaForecast",
  "retainer",
  "commission",
  "projectFees",
  "productFees",
  "unallocated",
  "accrual",
];

export const REVENUE_AXIS_CONFIG: AxisConfig = {
  axisId: "revenue",
  title: "Revenue",
  bucketLabel: "Revenue",
  rowTypeLabel: "Stream",
  // Every stream is listed so the comparison panel can order and label them;
  // the grid itself seeds the fixed rows and exposes no add/remove UI.
  rowTypeOptions: REVENUE_ADMIN_STREAMS.map((s) => ({
    value: s,
    label: REVENUE_STREAM_LABELS[s],
  })),
  allowMultipleBuckets: false,
  // BL Input may hold several lines of the addable streams (Retainer, Project
  // Fees, Product Fees); the grid limits which types can actually be added.
  allowDuplicateRowTypes: true,
  // Revenue actuals come from GAIA (Finance), not MediaOcean.
  actualsLabel: "GAIA",
  // GAIA is captured per submission (the roll-up logic is submission-specific).
  annualActuals: false,
};