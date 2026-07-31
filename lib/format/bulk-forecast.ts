// lib/format/bulk-forecast.ts

/**
 * Pure, Firebase-free core of the Bulk Edit module.
 *
 * A "bulk record" is one flattened forecast line — a single client × year × RFQ
 * × axis × section (BL / Actuals) × row, carrying its 12 monthly values. The
 * Google-Sheets transport ships these as a flat table (one tab per axis); the
 * commit service turns valid records back into the per-doc `AxisData` shapes.
 *
 * Columns are described PER AXIS by the caller (a `BulkColumn[]`), so each tab
 * shows only the fields that make sense — Media/Labs have a Project column,
 * Revenue does not; the type column is labelled "Media Type" / "Stream" /
 * "Partner" and carries a human label rather than an opaque key. The canonical
 * `rowType` is resolved from that label by the service (which owns the
 * per-axis vocabularies). This module only knows the flat shape: it builds the
 * matrix from records, parses a matrix back (with per-cell coercion), and runs
 * the QA that decides — without any write — which rows are ready / errored /
 * ignored.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import { emptyMonthly, type AxisId } from "../types/forecaster.types";
import { RFQ_TYPES, type RFQType } from "../types/rfq.types";

// ─── Flat schema ─────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Section values as written in the sheet. */
export const SECTION_BL = "BL";
export const SECTION_ACTUALS = "Admin";
/** A breakdown line under an Admin row (carries the 3 levels). */
export const SECTION_DETAIL = "Detail";

/**
 * Legacy/alias spellings accepted for the Admin section on import (upper-cased):
 * sheets exported before the "Actuals" → "Admin" rename, plus common variants.
 */
const ADMIN_SECTION_ALIASES = new Set([
  "ADMIN",
  "ADMIN INPUT",
  "ADMIN-INPUT",
  "ADMIN_INPUT",
  "ACTUALS",
]);

/** Number of free-text detail "levels" (mirrors DETAIL_LEVEL_COUNT). */
export const DETAIL_LEVELS = 3;

/** RFQ placeholder for annual actuals (Media/Labs MediaOcean), which have no RFQ. */
export const ANNUAL_RFQ_SENTINEL = "ANNUAL";

const RFQ_VALUES = new Set<string>(RFQ_TYPES.map((t) => t.value));

// ─── Record shape ────────────────────────────────────────────────────────────

export type BulkSection = "BL" | "ACTUALS" | "DETAIL";

/** A single flattened forecast line, transport-agnostic. */
export interface BulkRecord {
  clientId: string;
  clientName: string;
  year: number;
  /** null for annual actuals (Media/Labs), which are not RFQ-scoped. */
  rfq: RFQType | null;
  section: BulkSection;
  /** "" for actuals and for axes with no project (Revenue). */
  bucket: string;
  /** Canonical machine value (media key / stream key / partnerId). */
  rowType: string;
  /** Human label shown in the sheet's type column. */
  label: string;
  note: string;
  /**
   * Product name shown in the Revenue "Product" column — links a Product Fees
   * line to a catalog product. "" when none. The service resolves it to/from a
   * productId (only meaningful on the Revenue axis's Product Fees rows).
   */
  product: string;
  /**
   * Resolved catalog productId — populated by the service after parse (like
   * `rowType`), from the `product` name. Absent on export/parse; the row builder
   * writes it onto the ForecastRow for Product Fees lines.
   */
  productId?: string;
  /** The 3 free-text detail levels — only meaningful for DETAIL rows. */
  levels: string[];
  months: MonthlyMap;
  /**
   * Months (1–12) whose sheet cell carries a literal 0 (not a blank) — a
   * deliberate zero. Exported from the row's stored explicit zeros; on import
   * the builders persist it where the flag has meaning (Admin rows/details,
   * the BL Commission Overwrite lines).
   */
  explicitZeros: number[];
}

// ─── Per-axis columns ────────────────────────────────────────────────────────

/** A record field a sheet column maps to. `months` are handled separately. */
export type BulkField =
  | "clientId"
  | "clientName"
  | "year"
  | "rfq"
  | "section"
  | "bucket"
  | "rowType"
  | "label"
  | "note"
  | "product"
  | "level1"
  | "level2"
  | "level3";

export interface BulkColumn {
  /** Header text shown in the sheet. */
  header: string;
  field: BulkField;
  /** Header must be present for the tab to parse. */
  required?: boolean;
}

/** Index (0-based) of the column carrying `field`, or -1. */
export function columnIndexOf(columns: BulkColumn[], field: BulkField): number {
  return columns.findIndex((c) => c.field === field);
}

// ─── Export: records → sheet matrix ──────────────────────────────────────────

function sectionLabel(rec: BulkRecord): string {
  if (rec.section === "BL") return SECTION_BL;
  if (rec.section === "DETAIL") {
    // A detail line exports as "Admin" — its filled Levels re-detect it on
    // import. Only a detail with no level text keeps the explicit "Detail"
    // marker; exported as "Admin" it would round-trip as a parent row.
    return rec.levels.some((l) => (l ?? "").trim() !== "")
      ? SECTION_ACTUALS
      : SECTION_DETAIL;
  }
  return SECTION_ACTUALS;
}

function cellForField(rec: BulkRecord, field: BulkField): string | number {
  switch (field) {
    case "clientId": return rec.clientId;
    case "clientName": return rec.clientName;
    case "year": return rec.year;
    case "rfq":
      // Actuals and their details are annual on Media/Labs (rfq === null).
      return rec.section !== "BL" && rec.rfq === null
        ? ANNUAL_RFQ_SENTINEL
        : rec.rfq ?? "";
    case "section": return sectionLabel(rec);
    case "bucket": return rec.bucket;
    case "rowType": return rec.rowType;
    case "label": return rec.label;
    case "note": return rec.note;
    case "product": return rec.product;
    case "level1": return rec.levels[0] ?? "";
    case "level2": return rec.levels[1] ?? "";
    case "level3": return rec.levels[2] ?? "";
  }
}

/** One record → one sheet row, ordered by `columns` then the 12 months. An
 *  empty month exports as a blank cell — only a deliberate (explicit) zero
 *  writes a literal 0, so the sheet round-trips the blank/0 distinction. */
export function recordToRow(rec: BulkRecord, columns: BulkColumn[]): (string | number)[] {
  return [
    ...columns.map((c) => cellForField(rec, c.field)),
    ...MONTHS.map((m) => {
      const v = rec.months[m] ?? 0;
      if (v !== 0) return v;
      return rec.explicitZeros.includes(m) ? 0 : "";
    }),
  ];
}

/** Builds the full sheet matrix (header + one row per record) for an axis tab. */
export function buildMatrix(
  records: BulkRecord[],
  columns: BulkColumn[]
): (string | number)[][] {
  const header = [...columns.map((c) => c.header), ...MONTH_LABELS];
  return [header, ...records.map((r) => recordToRow(r, columns))];
}

// ─── Import: sheet matrix → records ──────────────────────────────────────────

/** A parsed record keeps its source row number for human-readable errors. */
export interface ParsedRecord {
  /** 1-based row number in the sheet (header is row 1, first data row is 2). */
  rowNumber: number;
  record: BulkRecord;
  /**
   * The raw Section cell when it is non-empty but not a recognized token
   * (BL / Admin+aliases / Detail). Such a row would otherwise fall through to
   * BL silently; validateRecords turns this into a blocking error instead.
   */
  unknownSection?: string;
}

export interface ParseResult {
  parsed: ParsedRecord[];
  /** Structural problems that abort the whole tab (missing header columns). */
  fatalError?: string;
}

/** Coerce a sheet cell into a number: tolerate "$", thousands commas, blanks. */
function coerceMoney(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const s = String(raw ?? "").trim();
  if (s === "") return 0;
  const cleaned = s.replace(/[$\s,]/g, "");
  return Number(cleaned);
}

/**
 * Parses a raw sheet matrix (first row = header) into bulk records, using the
 * axis `columns` to map headers to fields. Reordered/extra columns are tolerated
 * as long as the required ones are present. Numeric coercion only — semantic QA
 * is `validateRecords`. The type column maps to `label`; `rowType` is resolved
 * downstream by the service, so it is left "" here.
 */
export function parseMatrix(matrix: unknown[][], columns: BulkColumn[]): ParseResult {
  if (!matrix || matrix.length < 2) {
    return { parsed: [], fatalError: "Sheet is empty or has no data rows." };
  }

  const header = matrix[0].map((c) => String(c ?? "").trim());
  const headerIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    if (!(h in headerIndex)) headerIndex[h] = i;
  });

  const missing = columns
    .filter((c) => c.required && !(c.header in headerIndex))
    .map((c) => c.header);
  if (missing.length > 0) {
    return { parsed: [], fatalError: `Missing columns: ${missing.join(", ")}` };
  }
  const monthMissing = MONTH_LABELS.filter((m) => !(m in headerIndex));
  if (monthMissing.length === 12) {
    return { parsed: [], fatalError: "No month columns (Jan–Dec) found." };
  }

  // field → header index (only for fields that have a present column)
  const fieldIndex = new Map<BulkField, number>();
  for (const c of columns) {
    if (c.header in headerIndex) fieldIndex.set(c.field, headerIndex[c.header]);
  }
  const read = (row: unknown[], field: BulkField): string => {
    const idx = fieldIndex.get(field);
    return idx === undefined ? "" : String(row[idx] ?? "").trim();
  };

  const parsed: ParsedRecord[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;

    // A blank month cell is "no data" (0, not deliberate); a literal 0 is a
    // deliberate zero, tracked in explicitZeros.
    const months = emptyMonthly();
    const explicitZeros: number[] = [];
    MONTHS.forEach((m, idx) => {
      const label = MONTH_LABELS[idx];
      if (!(label in headerIndex)) return;
      const raw = row[headerIndex[label]];
      const value = coerceMoney(raw);
      months[m] = value;
      if (value === 0 && String(raw ?? "").trim() !== "") explicitZeros.push(m);
    });

    const levels = [read(row, "level1"), read(row, "level2"), read(row, "level3")];

    // Section resolution. An Admin row carrying text in any Level column is a
    // breakdown (Detail) line — no need to write "Detail" in the sheet; the
    // explicit "Detail" value is still accepted (exports and older sheets).
    const sectionRaw = read(row, "section");
    const sectionU = sectionRaw.toUpperCase();
    const isDetailToken = sectionU === SECTION_DETAIL.toUpperCase();
    const isAdminToken = ADMIN_SECTION_ALIASES.has(sectionU);
    // Blank stays a lenient BL default; only "BL" is the explicit BL token.
    const isBLToken = sectionU === "" || sectionU === SECTION_BL.toUpperCase();
    const section: BulkSection = isDetailToken
      ? "DETAIL"
      : isAdminToken
      ? levels.some((l) => l !== "")
        ? "DETAIL"
        : "ACTUALS"
      : "BL";
    // A non-empty, unrecognized Section value would silently fall through to BL
    // above (misrouting an Admin/MediaOcean line into a BL bucket). Flag it so
    // validateRecords can block the row with a visible error instead.
    const unknownSection =
      !isDetailToken && !isAdminToken && !isBLToken ? sectionRaw : undefined;

    const rfqRaw = read(row, "rfq");
    const rfq: RFQType | null =
      rfqRaw === "" || rfqRaw.toUpperCase() === ANNUAL_RFQ_SENTINEL
        ? null
        : (rfqRaw as RFQType);

    parsed.push({
      rowNumber: i + 1,
      record: {
        clientId: read(row, "clientId"),
        clientName: read(row, "clientName"),
        year: Number(read(row, "year")),
        rfq,
        section,
        bucket: read(row, "bucket"),
        // type column maps to label; rowType resolved by the service.
        rowType: read(row, "rowType"),
        label: read(row, "label"),
        note: read(row, "note"),
        product: read(row, "product"),
        levels,
        months,
        explicitZeros,
      },
      ...(unknownSection ? { unknownSection } : {}),
    });
  }

  return { parsed };
}

// ─── QA validation (no writes) ───────────────────────────────────────────────

export type RowStatus = "ok" | "error" | "ignored";

export interface ValidatedRecord {
  rowNumber: number;
  record: BulkRecord;
  status: RowStatus;
  /** Reason for an error or an ignore. */
  message?: string;
  /**
   * A non-blocking advisory on an otherwise-valid (`ok`) row — the row is still
   * imported, but the review UI surfaces this so the user can fix it. Used when
   * a BL Product Fees line has no linked product.
   */
  warning?: string;
}

export interface BulkValidationContext {
  axisId: AxisId;
  /** true → Media/Labs (actuals are annual); false → Revenue (per-submission). */
  annualActuals: boolean;
  /** Known client ids — an unknown id is a blocking error. */
  knownClientIds: Set<string>;
  /** Allowed row types for the axis (Labs is year-dependent). */
  isRowTypeAllowed: (rowType: string, year: number) => boolean;
  /** RFQ doc status for a submission — drives the lock / missing guards. */
  rfqStatus: (year: number, rfq: RFQType) => "LOCKED" | "UNLOCKED" | "MISSING";
  /**
   * Row types that are computed and must be ignored on import — but ONLY in the
   * BL section. The Revenue Commission is auto-calculated from Media for BL_INPUT
   * only; the GAIA (Actuals) "Commission" stream is a real value and stays
   * importable.
   */
  computedRowTypes: Set<string>;
  /**
   * Row types that only exist in the BL section (Revenue's Commission
   * Overwrite has no GAIA counterpart) — an Admin/Detail line of one of these
   * is a blocking error.
   */
  blOnlyRowTypes: Set<string>;
  /**
   * The only rowType that may carry a value in the "Product" column (Revenue's
   * Product Fees). On that stream a blank Product on a BL line imports with a
   * non-blocking warning (it stays optional on the Admin/GAIA actuals); a
   * non-blank Product on any other row is a blocking error. Absent on axes
   * without a Product column.
   */
  productColumnRowType?: string;
  /** Whether a non-blank Product cell resolves to a known catalog product. */
  isKnownProduct?: (product: string) => boolean;
}

/**
 * Runs the QA over parsed records. Pure: it never writes and never throws on a
 * bad row — every record comes back tagged `ok` / `error` / `ignored` with a
 * message, so the review UI can show exactly what will and won't be applied.
 */
export function validateRecords(
  parsed: ParsedRecord[],
  ctx: BulkValidationContext
): ValidatedRecord[] {
  return parsed.map(({ rowNumber, record, unknownSection }) => {
    const err = (message: string): ValidatedRecord => ({
      rowNumber,
      record,
      status: "error",
      message,
    });
    // Non-blocking advisories accumulated as the row passes; attached to the
    // final `ok` result so the row still imports.
    let warning: string | undefined;

    // An unrecognized Section value would otherwise be silently routed to BL,
    // dropping an intended Admin/MediaOcean line. Block it with a clear message.
    if (unknownSection)
      return err(
        `Unknown Section "${unknownSection}" — expected "${SECTION_BL}", "${SECTION_ACTUALS}", or "${SECTION_DETAIL}".`
      );

    if (!record.clientId) return err("Missing ClientId.");
    if (!ctx.knownClientIds.has(record.clientId))
      return err(`Unknown ClientId "${record.clientId}".`);
    if (!Number.isInteger(record.year) || record.year < 2000 || record.year > 2100)
      return err(`Invalid Year "${record.year}".`);
    if (!record.rowType) return err(`Missing or unknown type "${record.label}".`);

    // The BL Commission row is derived from Media — never imported. In the
    // Actuals section the same stream is a real GAIA value, so it is kept.
    if (record.section === "BL" && ctx.computedRowTypes.has(record.rowType)) {
      return {
        rowNumber,
        record,
        status: "ignored",
        message: `"${record.label || record.rowType}" (BL) is computed from Media — ignored.`,
      };
    }

    if (!ctx.isRowTypeAllowed(record.rowType, record.year))
      return err(`Invalid type "${record.label || record.rowType}" for ${ctx.axisId} ${record.year}.`);

    // BL-only streams (Revenue's Commission Overwrite) have no Admin/GAIA row.
    if (record.section !== "BL" && ctx.blOnlyRowTypes.has(record.rowType))
      return err(
        `"${record.label || record.rowType}" is a BL-only stream — not importable in the Admin section.`
      );

    // RFQ requirement: every line needs a real, existing RFQ — EXCEPT annual
    // actuals and their details (Media/Labs MediaOcean), which are not
    // RFQ-scoped. LOCKED submissions are NOT rejected: the Bulk tools are
    // admin-only and deliberately bypass the lock (which gates the Business
    // Leads' grid; the Firestore rules always allow admin writes).
    const isAnnual = record.section !== "BL" && ctx.annualActuals;
    if (!isAnnual) {
      if (!record.rfq) return err("Missing RFQ.");
      if (!RFQ_VALUES.has(record.rfq)) return err(`Invalid RFQ "${record.rfq}".`);
      const status = ctx.rfqStatus(record.year, record.rfq);
      if (status === "MISSING")
        return err(`RFQ ${record.year}/${record.rfq} does not exist — create it first.`);
    }

    // Product column: on the Product Fees stream a Product is expected on BL
    // lines (a blank one imports with a warning, not an error) and, when
    // present, must resolve to a known catalog product. On the Admin/GAIA
    // actuals it stays optional. A Product on any other stream is forbidden.
    if (ctx.productColumnRowType && record.rowType === ctx.productColumnRowType) {
      if (record.section === "BL" && !record.product)
        warning = "Product Fees line with no linked product.";
      if (record.product && ctx.isKnownProduct && !ctx.isKnownProduct(record.product))
        return err(`Unknown product "${record.product}".`);
    } else if (record.product) {
      return err(
        `Product "${record.product}" is only valid on a Product Fees line.`
      );
    }

    // Month values must be finite numbers.
    const badMonth = MONTHS.find((m) => !Number.isFinite(record.months[m]));
    if (badMonth !== undefined)
      return err(`Non-numeric value in month ${badMonth}.`);

    return { rowNumber, record, status: "ok", ...(warning ? { warning } : {}) };
  });
}

// ─── Grouping (valid records → per-target buckets) ───────────────────────────

/** Identifies a write target derived from a group of records. */
export interface SubmissionKey {
  clientId: string;
  year: number;
  rfq: RFQType;
}

/** BL rows of one submission, grouped by bucket name (preserving order). */
export interface BLGroup extends SubmissionKey {
  /** bucket name → ordered records. */
  buckets: Map<string, BulkRecord[]>;
}

/** Per-submission actuals (Revenue GAIA) + their detail lines. */
export interface SubmissionActualsGroup extends SubmissionKey {
  rows: BulkRecord[];
  /** DETAIL rows (rowType = parent actuals type). */
  details: BulkRecord[];
}

/** Annual actuals (Media/Labs MediaOcean) + details, keyed by client + year. */
export interface AnnualActualsGroup {
  clientId: string;
  year: number;
  rows: BulkRecord[];
  details: BulkRecord[];
}

export interface GroupedRecords {
  bl: BLGroup[];
  submissionActuals: SubmissionActualsGroup[];
  annualActuals: AnnualActualsGroup[];
}

/**
 * Groups the `ok` records into the three write shapes. `ignored` and `error`
 * records are dropped here — only what will actually be written is grouped.
 * `annualActuals` is true for Media/Labs (their actuals are annual).
 */
export function groupRecords(
  validated: ValidatedRecord[],
  annualActuals: boolean
): GroupedRecords {
  const bl = new Map<string, BLGroup>();
  const subActuals = new Map<string, SubmissionActualsGroup>();
  const annActuals = new Map<string, AnnualActualsGroup>();

  for (const v of validated) {
    if (v.status !== "ok") continue;
    const r = v.record;

    if (r.section === "BL") {
      const key = `${r.clientId}|${r.year}|${r.rfq}`;
      let g = bl.get(key);
      if (!g) {
        g = { clientId: r.clientId, year: r.year, rfq: r.rfq as RFQType, buckets: new Map() };
        bl.set(key, g);
      }
      const bucketName = r.bucket || "General";
      const rows = g.buckets.get(bucketName) ?? [];
      rows.push(r);
      g.buckets.set(bucketName, rows);
      continue;
    }

    // ACTUALS or DETAIL — same target, the detail rides in the group's `details`.
    if (annualActuals) {
      const key = `${r.clientId}|${r.year}`;
      let g = annActuals.get(key);
      if (!g) {
        g = { clientId: r.clientId, year: r.year, rows: [], details: [] };
        annActuals.set(key, g);
      }
      (r.section === "DETAIL" ? g.details : g.rows).push(r);
    } else {
      const key = `${r.clientId}|${r.year}|${r.rfq}`;
      let g = subActuals.get(key);
      if (!g) {
        g = { clientId: r.clientId, year: r.year, rfq: r.rfq as RFQType, rows: [], details: [] };
        subActuals.set(key, g);
      }
      (r.section === "DETAIL" ? g.details : g.rows).push(r);
    }
  }

  return {
    bl: [...bl.values()],
    submissionActuals: [...subActuals.values()],
    annualActuals: [...annActuals.values()],
  };
}

// ─── Diff (added / replaced / deleted) ───────────────────────────────────────

export interface RowDiff {
  added: number;
  replaced: number;
  deleted: number;
}

export function emptyDiff(): RowDiff {
  return { added: 0, replaced: 0, deleted: 0 };
}

export function addDiff(a: RowDiff, b: RowDiff): RowDiff {
  return {
    added: a.added + b.added,
    replaced: a.replaced + b.replaced,
    deleted: a.deleted + b.deleted,
  };
}

export type ImportMode = "ADD" | "REPLACE";

/**
 * Computes the row-level diff of an incoming set against an existing set, under
 * the chosen mode. Both sides are described only by their match keys (e.g.
 * `bucket rowType` for multi-bucket BL, or `rowType` for single-bucket).
 *   ADD     → upsert: matches are replaced, new keys added, nothing deleted.
 *   REPLACE → the target is overwritten: matches replaced, new added, and any
 *             existing key absent from the incoming set is deleted.
 */
export function diffKeys(
  existingKeys: string[],
  incomingKeys: string[],
  mode: ImportMode
): RowDiff {
  const existing = new Set(existingKeys);
  const incoming = new Set(incomingKeys);
  let added = 0;
  let replaced = 0;
  for (const k of incoming) {
    if (existing.has(k)) replaced++;
    else added++;
  }
  let deleted = 0;
  if (mode === "REPLACE") {
    for (const k of existing) if (!incoming.has(k)) deleted++;
  }
  return { added, replaced, deleted };
}
