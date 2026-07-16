// lib/services/bulk-import-service.ts

/**
 * Orchestration for the Bulk Edit module — the only layer that talks to both
 * Firestore and Google Sheets. It:
 *   • EXPORT: fetches the in-scope forecast data, flattens it (lib/format/
 *     bulk-forecast) and pushes one tab per axis to a new sheet.
 *   • IMPORT: pulls those tabs back, runs the QA (pure validation), computes the
 *     add/replace diff against the live data, and — on confirm — writes BL +
 *     actuals across the 3 axes, re-syncing the derived Revenue commission and
 *     stamping each side's "last updated".
 *
 * It reuses the existing single-submission services (data-entry-service,
 * annual-actuals-service, revenue-commission) so the storage rules — annual
 * MediaOcean actuals, per-submission GAIA, computed commission, last-updated
 * stamps — stay defined in one place.
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { Client } from "../types/client.types";
import type { LabsPartner } from "../types/labs.types";
import {
  MEDIA_TYPES,
  MONTHS,
  type MediaType,
  type MonthlyMap,
} from "../types/common.types";
import {
  type AxisData,
  type AxisId,
  type ForecastBucket,
  type ForecastRow,
  type RowDetail,
  emptyMonthly,
  newBucket,
  newRow,
  newDetail,
  detailMonthTotals,
  detailExplicitZeros,
  DETAIL_LEVEL_COUNT,
  MEDIA_AXIS_CONFIG,
  MEDIA_TYPE_LABELS,
  REVENUE_AXIS_CONFIG,
  REVENUE_ALL_STREAMS,
  REVENUE_STREAM_LABELS,
  REVENUE_COMMISSION_TYPE,
  REVENUE_COMMISSION_OVERWRITE_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  buildLabsAxisConfig,
  type AxisConfig,
  type RevenueStream,
} from "../types/forecaster.types";
import {
  type RFQType,
  type RFQ,
  RFQ_TYPES,
  RFQ_TYPE_ORDER,
  buildRFQId,
} from "../types/rfq.types";
import { fetchRFQs } from "./rfq-service";
import {
  fetchDataEntry,
  fetchAxisData,
  saveAxisData,
  saveAxisActuals,
  syncRevenueCommission,
} from "./data-entry-service";
import {
  fetchAnnualActualsEntry,
  fetchAnnualActuals,
  saveAnnualActuals,
} from "./annual-actuals-service";
import { ensureRevenueShape } from "../format/revenue-commission";
import {
  type BulkRecord,
  type BulkColumn,
  type GroupedRecords,
  type ValidatedRecord,
  type ImportMode,
  type RowDiff,
  type BLGroup,
  buildMatrix,
  parseMatrix,
  validateRecords,
  groupRecords,
  diffKeys,
  addDiff,
  emptyDiff,
  columnIndexOf,
  SECTION_BL,
  SECTION_ACTUALS,
  SECTION_DETAIL,
  ANNUAL_RFQ_SENTINEL,
} from "../format/bulk-forecast";
import * as sheets from "./google-sheets-service";

// ─── Axis registry (tab title ↔ axis + config) ──────────────────────────────

const AXIS_TABS: { axisId: AxisId; tab: string }[] = [
  { axisId: "media", tab: "Media" },
  { axisId: "revenue", tab: "Revenue" },
  { axisId: "labs", tab: "Labs" },
];

// ─── Per-axis sheet columns ──────────────────────────────────────────────────

/**
 * Each axis tab shows only the columns it needs. The type column carries a
 * human label (Media type / stream / partner name) rather than the opaque key;
 * every axis carries a Project column (Revenue BL rows without one land in
 * "General"). `rowType` is intentionally
 * absent from the sheet — it is resolved from the label on import.
 */
const COMMON_HEAD: BulkColumn[] = [
  { header: "ClientId", field: "clientId", required: true },
  { header: "ClientName", field: "clientName" },
  { header: "Year", field: "year", required: true },
  { header: "RFQ", field: "rfq" },
  { header: "Section", field: "section", required: true },
];

/** The 3 detail-level columns, shared by every axis (used by Detail rows only). */
const DETAIL_COLS: BulkColumn[] = [
  { header: "Level 1", field: "level1" },
  { header: "Level 2", field: "level2" },
  { header: "Level 3", field: "level3" },
];

const AXIS_COLUMNS: Record<AxisId, BulkColumn[]> = {
  media: [
    ...COMMON_HEAD,
    { header: "Project", field: "bucket" },
    { header: "Media Type", field: "label", required: true },
    { header: "Note", field: "note" },
    ...DETAIL_COLS,
  ],
  revenue: [
    ...COMMON_HEAD,
    { header: "Project", field: "bucket" },
    { header: "Stream", field: "label", required: true },
    { header: "Note", field: "note" },
    ...DETAIL_COLS,
  ],
  labs: [
    ...COMMON_HEAD,
    { header: "Project", field: "bucket" },
    { header: "Partner", field: "label", required: true },
    { header: "Note", field: "note" },
    ...DETAIL_COLS,
  ],
};

const norm = (s: string) => s.trim().toLowerCase();

/** Allowed type-column dropdown values for an axis (within the export scope). */
function typeOptions(axisId: AxisId, ref: BulkReference, years: number[]): string[] {
  if (axisId === "media")
    return MEDIA_TYPES.map((t) => MEDIA_TYPE_LABELS[t]);
  if (axisId === "revenue")
    return REVENUE_ALL_STREAMS.map((s) => REVENUE_STREAM_LABELS[s]);
  // labs — union of partner names across the in-scope years
  const names = new Set<string>();
  for (const y of years) {
    const byId = ref.partnersByYear.get(y);
    if (byId) for (const name of byId.values()) names.add(name);
  }
  return [...names].sort();
}

/**
 * Resolves the canonical rowType from the sheet's type label. Accepts either the
 * human label (Social, Retainer, a partner name) or the canonical key itself.
 * Returns "" when nothing matches, so the QA reports a clear "unknown type".
 */
function resolveRowType(
  axisId: AxisId,
  label: string,
  year: number,
  ref: BulkReference
): string {
  const n = norm(label);
  if (!n) return "";

  if (axisId === "media") {
    if ((MEDIA_TYPES as string[]).some((t) => norm(t) === n)) return n;
    const hit = MEDIA_TYPES.find((t) => norm(MEDIA_TYPE_LABELS[t]) === n);
    return hit ?? "";
  }
  if (axisId === "revenue") {
    if ((REVENUE_ALL_STREAMS as string[]).some((s) => norm(s) === n)) return n;
    // Legacy label — the `gaiaForecast` stream was exported as "GAIA Revenue"
    // before it was renamed to "Official Revenue"; keep old sheets importable.
    if (n === "gaia revenue") return REVENUE_GAIA_FORECAST_TYPE;
    const hit = REVENUE_ALL_STREAMS.find(
      (s) => norm(REVENUE_STREAM_LABELS[s]) === n
    );
    return hit ?? "";
  }
  // labs — partner name (or id) for the year
  const byId = ref.partnersByYear.get(year);
  if (byId) {
    if (byId.has(label.trim())) return label.trim(); // exact partnerId
    for (const [id, name] of byId) if (norm(name) === n) return id;
  }
  return "";
}

// ─── Reference data (clients, RFQs, labs partners) ───────────────────────────

export interface BulkReference {
  clients: Client[];
  clientsById: Map<string, Client>;
  rfqs: RFQ[];
  rfqStatusByKey: Map<string, "LOCKED" | "UNLOCKED">; // key `${year}_${rfq}`
  partnersByYear: Map<number, Map<string, string>>; // year → (partnerId → name)
}

/** Loads the reference data needed for both export scoping and import QA. */
export async function loadBulkReference(): Promise<BulkReference> {
  const [clientSnap, rfqs, partnerSnap] = await Promise.all([
    getDocs(collection(db, "clients")),
    fetchRFQs(),
    getDocs(collection(db, "labs_partners")),
  ]);

  const clients = clientSnap.docs
    .map((d) => ({ cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) }))
    .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
  const clientsById = new Map(clients.map((c) => [c.cl_id, c]));

  const rfqStatusByKey = new Map<string, "LOCKED" | "UNLOCKED">();
  for (const r of rfqs) {
    rfqStatusByKey.set(buildRFQId(r.year, r.type), r.status === "LOCKED" ? "LOCKED" : "UNLOCKED");
  }

  const partnersByYear = new Map<number, Map<string, string>>();
  partnerSnap.docs.forEach((d) => {
    const p = { partnerId: d.id, ...(d.data() as Omit<LabsPartner, "partnerId">) };
    const byId = partnersByYear.get(p.year) ?? new Map<string, string>();
    byId.set(p.partnerId, p.name);
    partnersByYear.set(p.year, byId);
  });

  return { clients, clientsById, rfqs, rfqStatusByKey, partnersByYear };
}

// ─── Per-axis label + validation helpers ─────────────────────────────────────

function labelResolver(axisId: AxisId, ref: BulkReference) {
  return (rowType: string, year: number): string => {
    if (axisId === "media") return MEDIA_TYPE_LABELS[rowType as MediaType] ?? rowType;
    if (axisId === "revenue")
      return REVENUE_STREAM_LABELS[rowType as RevenueStream] ?? rowType;
    // labs — partner name for the year
    return ref.partnersByYear.get(year)?.get(rowType) ?? rowType;
  };
}

function rowTypeChecker(axisId: AxisId, ref: BulkReference) {
  return (rowType: string, year: number): boolean => {
    if (axisId === "media") return (MEDIA_TYPES as string[]).includes(rowType);
    if (axisId === "revenue")
      return (REVENUE_ALL_STREAMS as string[]).includes(rowType);
    return ref.partnersByYear.get(year)?.has(rowType) ?? false;
  };
}

function isAnnualAxis(axisId: AxisId): boolean {
  return axisId === "media" || axisId === "labs";
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════════════════

export interface ExportScope {
  clientIds: string[];
  years: number[];
  rfqs: RFQType[];
  axes: AxisId[];
  /** Include BL_INPUT lines. */
  includeBL: boolean;
  /** Include ADMIN_INPUT (actuals) lines. */
  includeActuals: boolean;
}

function blRecordsFromAxis(
  client: Client,
  year: number,
  rfq: RFQType,
  data: AxisData
): BulkRecord[] {
  const out: BulkRecord[] = [];
  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      out.push({
        clientId: client.cl_id,
        clientName: client.CL_Name,
        year,
        rfq,
        section: "BL",
        bucket: bucket.name,
        rowType: row.rowType,
        label: row.label,
        note: row.note ?? "",
        levels: ["", "", ""],
        months: { ...emptyMonthly(), ...row.months },
        explicitZeros: liveExplicitZeros(row),
      });
    }
  }
  return out;
}

/** A row's (or detail's) explicit zeros, dropping months whose stored value is
 *  no longer 0 (a later non-zero entry supersedes the flag). */
function liveExplicitZeros(row: {
  months: MonthlyMap;
  explicitZeros?: number[];
}): number[] {
  return (row.explicitZeros ?? []).filter((m) => (row.months[m] ?? 0) === 0);
}

/**
 * Flattens actuals rows, emitting each parent row followed by its detail lines
 * (Section "Detail", same rowType/label, the 3 levels and the detail's months).
 */
function actualsRecordsFromRows(
  client: Client,
  year: number,
  rfq: RFQType | null,
  rows: ForecastRow[]
): BulkRecord[] {
  const out: BulkRecord[] = [];
  for (const row of rows) {
    out.push({
      clientId: client.cl_id,
      clientName: client.CL_Name,
      year,
      rfq,
      section: "ACTUALS",
      bucket: "",
      rowType: row.rowType,
      label: row.label,
      note: row.note ?? "",
      levels: ["", "", ""],
      months: { ...emptyMonthly(), ...row.months },
      explicitZeros: liveExplicitZeros(row),
    });
    for (const detail of row.details ?? []) {
      out.push({
        clientId: client.cl_id,
        clientName: client.CL_Name,
        year,
        rfq,
        section: "DETAIL",
        bucket: "",
        rowType: row.rowType,
        label: row.label,
        note: "",
        levels: [
          detail.levels[0] ?? "",
          detail.levels[1] ?? "",
          detail.levels[2] ?? "",
        ],
        months: { ...emptyMonthly(), ...detail.months },
        explicitZeros: liveExplicitZeros(detail),
      });
    }
  }
  return out;
}

/**
 * Fetches every in-scope forecast line and returns the records grouped per axis.
 * Reads run in parallel per submission / per client-year.
 */
export async function fetchExportRecords(
  scope: ExportScope,
  ref: BulkReference
): Promise<Record<AxisId, BulkRecord[]>> {
  const result: Record<AxisId, BulkRecord[]> = { media: [], revenue: [], labs: [] };

  const clients = scope.clientIds
    .map((id) => ref.clientsById.get(id))
    .filter((c): c is Client => !!c);

  // BL (all axes) + Revenue actuals live in data_entries — one read per submission.
  if (scope.includeBL || (scope.includeActuals && scope.axes.includes("revenue"))) {
    const tasks: Promise<void>[] = [];
    for (const client of clients) {
      for (const year of scope.years) {
        for (const rfq of scope.rfqs) {
          tasks.push(
            (async () => {
              const entry = await fetchDataEntry(client.cl_id, year, rfq);
              if (!entry) return;
              for (const axisId of scope.axes) {
                const data = entry.axes?.[axisId];
                if (!data) continue;
                if (scope.includeBL && Array.isArray(data.buckets)) {
                  result[axisId].push(...blRecordsFromAxis(client, year, rfq, data));
                }
                if (
                  scope.includeActuals &&
                  axisId === "revenue" &&
                  Array.isArray(data.actuals)
                ) {
                  result.revenue.push(
                    ...actualsRecordsFromRows(client, year, rfq, data.actuals)
                  );
                }
              }
            })()
          );
        }
      }
    }
    await Promise.all(tasks);
  }

  // Annual actuals (Media / Labs MediaOcean) — one read per client-year.
  if (scope.includeActuals && scope.axes.some((a) => isAnnualAxis(a))) {
    const tasks: Promise<void>[] = [];
    for (const client of clients) {
      for (const year of scope.years) {
        tasks.push(
          (async () => {
            const axes = await fetchAnnualActualsEntry(client.cl_id, year);
            for (const axisId of scope.axes) {
              if (!isAnnualAxis(axisId)) continue;
              const rows = axes[axisId];
              if (Array.isArray(rows) && rows.length) {
                result[axisId].push(
                  ...actualsRecordsFromRows(client, year, null, rows)
                );
              }
            }
          })()
        );
      }
    }
    await Promise.all(tasks);
  }

  return result;
}

export interface ExportResult {
  spreadsheetId: string;
  url: string;
  rowCounts: Record<AxisId, number>;
}

/** Builds the sheet and pushes the in-scope data. Returns the sheet URL. */
export async function exportToSheet(
  scope: ExportScope,
  ref: BulkReference
): Promise<ExportResult> {
  const records = await fetchExportRecords(scope, ref);

  const title = `PlusCo Forecaster export — ${new Date().toISOString().slice(0, 10)}`;
  const created = await sheets.createSpreadsheet(
    title,
    AXIS_TABS.map((a) => a.tab)
  );

  // Write each axis tab (header always present so the round-trip parses even
  // when an axis has no data).
  for (const { axisId, tab } of AXIS_TABS) {
    await sheets.writeValues(
      created.spreadsheetId,
      tab,
      buildMatrix(records[axisId], AXIS_COLUMNS[axisId])
    );
  }

  // In-sheet dropdowns for Section, RFQ and the type column on each axis tab —
  // makes manual entry safe and obvious. Best-effort: a validation failure must
  // not lose the exported data, so we swallow its error.
  try {
    const rfqValues = [...RFQ_TYPES.map((t) => t.value), ANNUAL_RFQ_SENTINEL];
    const dropdowns = AXIS_TABS.flatMap(({ axisId, tab }) => {
      const cols = AXIS_COLUMNS[axisId];
      const sheetId = created.sheetIdsByTitle[tab];
      if (sheetId == null) return [];
      return [
        { sheetId, columnIndex: columnIndexOf(cols, "section"), values: [SECTION_BL, SECTION_ACTUALS, SECTION_DETAIL] },
        { sheetId, columnIndex: columnIndexOf(cols, "rfq"), values: rfqValues },
        { sheetId, columnIndex: columnIndexOf(cols, "label"), values: typeOptions(axisId, ref, scope.years) },
      ];
    });
    await sheets.applyDataValidations(created.spreadsheetId, dropdowns);
  } catch (err) {
    console.error("Bulk export: dropdowns not applied:", err);
  }

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    rowCounts: {
      media: records.media.length,
      revenue: records.revenue.length,
      labs: records.labs.length,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORT
// ════════════════════════════════════════════════════════════════════════════

/** Everything one axis contributes to an import, kept from prepare → commit. */
export interface AxisPrepared {
  axisId: AxisId;
  config: AxisConfig;
  validated: ValidatedRecord[];
  grouped: GroupedRecords;
  /** Live snapshots, fetched once for both diff and commit. */
  existingBL: Map<string, AxisData>; // `${cl}|${y}|${rfq}` → axis data
  existingRevActuals: Map<string, ForecastRow[]>; // revenue per-submission
  existingAnnualActuals: Map<string, ForecastRow[]>; // `${cl}|${y}` → rows
  labelOf: (rowType: string, year: number) => string;
}

export interface PreparedImport {
  axes: AxisPrepared[];
  ref: BulkReference;
}

const submKey = (clientId: string, year: number, rfq: RFQType) =>
  `${clientId}|${year}|${rfq}`;
const annKey = (clientId: string, year: number) => `${clientId}|${year}`;

/**
 * Pulls the selected axis tabs, validates them, and fetches the live snapshots
 * the diff and commit will need. No write happens here. `selectedAxes` lets the
 * user import only some tabs (defaults to all three). A tab that can't be read
 * (e.g. removed from the sheet) becomes a single blocking error for that axis
 * rather than failing the whole import.
 */
export async function prepareImport(
  spreadsheetId: string,
  ref: BulkReference,
  selectedAxes: AxisId[] = AXIS_TABS.map((a) => a.axisId)
): Promise<PreparedImport> {
  const knownClientIds = new Set(ref.clientsById.keys());
  const rfqStatus = (year: number, rfq: RFQType) =>
    ref.rfqStatusByKey.get(buildRFQId(year, rfq)) ?? "MISSING";

  const axes: AxisPrepared[] = [];

  for (const { axisId, tab } of AXIS_TABS.filter((a) => selectedAxes.includes(a.axisId))) {
    const config =
      axisId === "media"
        ? MEDIA_AXIS_CONFIG
        : axisId === "revenue"
        ? REVENUE_AXIS_CONFIG
        : buildLabsAxisConfig([]); // config used only for labels here

    const blocking = (message: string): AxisPrepared => ({
      axisId,
      config,
      validated: [{ rowNumber: 1, record: emptyRecord(), status: "error", message }],
      grouped: { bl: [], submissionActuals: [], annualActuals: [] },
      existingBL: new Map(),
      existingRevActuals: new Map(),
      existingAnnualActuals: new Map(),
      labelOf: labelResolver(axisId, ref),
    });

    let matrix: unknown[][];
    try {
      matrix = await sheets.readSheet(spreadsheetId, tab);
    } catch (err) {
      axes.push(blocking(`${tab} tab could not be read: ${msg(err)}`));
      continue;
    }

    const { parsed, fatalError } = parseMatrix(matrix, AXIS_COLUMNS[axisId]);
    if (fatalError) {
      axes.push(blocking(`${tab} tab: ${fatalError}`));
      continue;
    }

    // Resolve the canonical rowType from the sheet's human type label.
    for (const p of parsed) {
      p.record.rowType = resolveRowType(axisId, p.record.label, p.record.year, ref);
    }

    const annual = isAnnualAxis(axisId);
    const validated = validateRecords(parsed, {
      axisId,
      annualActuals: annual,
      knownClientIds,
      isRowTypeAllowed: rowTypeChecker(axisId, ref),
      rfqStatus,
      computedRowTypes:
        axisId === "revenue" ? new Set([REVENUE_COMMISSION_TYPE]) : new Set<string>(),
      blOnlyRowTypes:
        axisId === "revenue"
          ? new Set([REVENUE_COMMISSION_OVERWRITE_TYPE])
          : new Set<string>(),
    });
    const grouped = groupRecords(validated, annual);

    // Fetch live snapshots for every touched target (parallel).
    const existingBL = new Map<string, AxisData>();
    const existingRevActuals = new Map<string, ForecastRow[]>();
    const existingAnnualActuals = new Map<string, ForecastRow[]>();

    await Promise.all([
      ...grouped.bl.map(async (g) => {
        const data = await fetchAxisData(g.clientId, g.year, g.rfq, axisId);
        existingBL.set(submKey(g.clientId, g.year, g.rfq), data);
      }),
      ...grouped.submissionActuals.map(async (g) => {
        const data = await fetchAxisData(g.clientId, g.year, g.rfq, axisId);
        existingRevActuals.set(submKey(g.clientId, g.year, g.rfq), data.actuals);
      }),
      ...grouped.annualActuals.map(async (g) => {
        const rows = await fetchAnnualActuals(g.clientId, g.year, axisId);
        existingAnnualActuals.set(annKey(g.clientId, g.year), rows);
      }),
    ]);

    axes.push({
      axisId,
      config,
      validated,
      grouped,
      existingBL,
      existingRevActuals,
      existingAnnualActuals,
      labelOf: labelResolver(axisId, ref),
    });
  }

  return { axes, ref };
}

function emptyRecord(): BulkRecord {
  return {
    clientId: "",
    clientName: "",
    year: 0,
    rfq: null,
    section: "BL",
    bucket: "",
    rowType: "",
    label: "",
    note: "",
    levels: ["", "", ""],
    months: emptyMonthly(),
    explicitZeros: [],
  };
}

// ─── Diff / summary ──────────────────────────────────────────────────────────

export interface ImportSummary {
  readyRows: number;
  errorRows: number;
  ignoredRows: number;
  /** Distinct {client,year,rfq} or {client,year} write targets. */
  affectedTargets: number;
  diff: RowDiff;
  /** Errors for the review list (axis-tagged). */
  errors: { axisId: AxisId; rowNumber: number; message: string }[];
  ignored: { axisId: AxisId; rowNumber: number; message: string }[];
}

/**
 * Suffixes repeated keys with their occurrence index (`key#0`, `key#1`, …) so
 * duplicate BL lines of the same type (Revenue) each count in the diff.
 */
const withOccurrences = (keys: string[]): string[] => {
  const seen = new Map<string, number>();
  return keys.map((k) => {
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    return `${k}#${i}`;
  });
};
const blKeys = (data: AxisData, allowDuplicates: boolean): string[] => {
  const keys = data.buckets.flatMap((b) =>
    b.rows.map((r) => `${b.name}::${r.rowType}`)
  );
  return allowDuplicates ? withOccurrences(keys) : [...new Set(keys)];
};
const incomingBLKeys = (g: BLGroup, allowDuplicates: boolean): string[] => {
  const keys: string[] = [];
  for (const [bucket, recs] of g.buckets)
    for (const rec of recs) keys.push(`${bucket}::${rec.rowType}`);
  return allowDuplicates ? withOccurrences(keys) : [...new Set(keys)];
};
const rowTypeKeys = (rows: { rowType: string }[]): string[] => [
  ...new Set(rows.map((r) => r.rowType)),
];

/** Computes the row-level diff + counters for the chosen mode (no writes). */
export function summarizeImport(
  prepared: PreparedImport,
  mode: ImportMode
): ImportSummary {
  let readyRows = 0;
  let errorRows = 0;
  let ignoredRows = 0;
  let diff = emptyDiff();
  const errors: ImportSummary["errors"] = [];
  const ignored: ImportSummary["ignored"] = [];
  const targets = new Set<string>();

  for (const axis of prepared.axes) {
    for (const v of axis.validated) {
      if (v.status === "ok") readyRows++;
      else if (v.status === "ignored") {
        ignoredRows++;
        ignored.push({ axisId: axis.axisId, rowNumber: v.rowNumber, message: v.message ?? "" });
      } else {
        errorRows++;
        errors.push({ axisId: axis.axisId, rowNumber: v.rowNumber, message: v.message ?? "" });
      }
    }

    for (const g of axis.grouped.bl) {
      targets.add(`bl|${axis.axisId}|${submKey(g.clientId, g.year, g.rfq)}`);
      const existing = axis.existingBL.get(submKey(g.clientId, g.year, g.rfq)) ?? {
        buckets: [],
        actuals: [],
      };
      diff = addDiff(
        diff,
        diffKeys(
          blKeys(existing, axis.config.allowDuplicateRowTypes),
          incomingBLKeys(g, axis.config.allowDuplicateRowTypes),
          mode
        )
      );
    }
    for (const g of axis.grouped.submissionActuals) {
      targets.add(`act|${axis.axisId}|${submKey(g.clientId, g.year, g.rfq)}`);
      const existing = axis.existingRevActuals.get(submKey(g.clientId, g.year, g.rfq)) ?? [];
      // Parent types touched = explicit parent rows ∪ types that only carry details.
      const incoming = rowTypeKeys([...g.rows, ...g.details]);
      diff = addDiff(diff, diffKeys(rowTypeKeys(existing), incoming, mode));
    }
    for (const g of axis.grouped.annualActuals) {
      targets.add(`ann|${axis.axisId}|${annKey(g.clientId, g.year)}`);
      const existing = axis.existingAnnualActuals.get(annKey(g.clientId, g.year)) ?? [];
      const incoming = rowTypeKeys([...g.rows, ...g.details]);
      diff = addDiff(diff, diffKeys(rowTypeKeys(existing), incoming, mode));
    }
  }

  return {
    readyRows,
    errorRows,
    ignoredRows,
    affectedTargets: targets.size,
    diff,
    errors,
    ignored,
  };
}

// ─── Row builders (records → ForecastRow/Bucket) ─────────────────────────────

function buildRow(
  rec: BulkRecord,
  existing: ForecastRow | undefined,
  labelOf: (rowType: string, year: number) => string,
  /** Persist the sheet's literal 0s as explicit zeros — Admin rows always
   *  track them; among BL rows only Revenue's Commission Overwrite does. */
  keepExplicitZeros: boolean
): ForecastRow {
  return {
    rowId: existing?.rowId ?? newRow(rec.rowType, "").rowId,
    rowType: rec.rowType,
    label: labelOf(rec.rowType, rec.year) || rec.label || rec.rowType,
    months: { ...emptyMonthly(), ...rec.months },
    ...(rec.note ? { note: rec.note } : {}),
    ...(keepExplicitZeros && rec.explicitZeros.length
      ? { explicitZeros: [...rec.explicitZeros] }
      : {}),
    // Preserve existing detail lines by default; the actuals builder overrides
    // them when the import provides Detail rows for this parent.
    ...(existing?.details ? { details: existing.details } : {}),
  };
}

/** Builds a RowDetail from a Detail record — pads the 3 levels. */
function buildDetail(rec: BulkRecord): RowDetail {
  const base = newDetail();
  return {
    detailId: base.detailId,
    levels: Array.from({ length: DETAIL_LEVEL_COUNT }, (_, i) => rec.levels[i] ?? ""),
    months: { ...emptyMonthly(), ...rec.months },
    ...(rec.explicitZeros.length
      ? { explicitZeros: [...rec.explicitZeros] }
      : {}),
  };
}

/** Explicit zeros surviving a merge of two rows: the union of both sides'
 *  flags, dropping months whose summed value is no longer 0. */
function mergedExplicitZeros(
  a: { explicitZeros?: number[] },
  b: { explicitZeros?: number[] },
  months: MonthlyMap
): number[] {
  const set = new Set([...(a.explicitZeros ?? []), ...(b.explicitZeros ?? [])]);
  return [...set].filter((m) => (months[m] ?? 0) === 0).sort((x, y) => x - y);
}

/**
 * Builds the new BL buckets for a submission under the chosen mode.
 *
 * `allowDuplicates` mirrors the axis config: Revenue BL may hold several lines
 * of the same stream (extra Retainer / Project Fees / Product Fees lines), so
 * every sheet row becomes its own grid row — the nth imported line of a type
 * matches the nth existing row of that type (preserving rowIds line by line),
 * and in ADD mode the imported lines of a type replace ALL existing lines of
 * that type. Media/Labs hold exactly one row per bucket+type, so there
 * duplicate sheet lines are MERGED into that row: months are summed, notes
 * joined — no line is silently dropped.
 */
function buildBLBuckets(
  existing: AxisData,
  group: BLGroup,
  mode: ImportMode,
  labelOf: (rowType: string, year: number) => string,
  allowDuplicates: boolean
): ForecastBucket[] {
  // Existing rows per bucket+type, in stored order (several for Revenue dupes).
  const existingRowsByKey = new Map<string, ForecastRow[]>();
  const bucketIdByName = new Map<string, string>();
  for (const b of existing.buckets) {
    bucketIdByName.set(b.name, b.bucketId);
    for (const r of b.rows) {
      const key = `${b.name}::${r.rowType}`;
      const list = existingRowsByKey.get(key) ?? [];
      list.push(r);
      existingRowsByKey.set(key, list);
    }
  }

  // Imported buckets, in sheet order.
  const imported: ForecastBucket[] = [];
  for (const [bucketName, recs] of group.buckets) {
    const rows: ForecastRow[] = [];
    // rowType → index of that type's row in `rows` (merge target) or the
    // count of occurrences consumed so far (duplicate matching).
    const seen = new Map<string, number>();
    for (const rec of recs) {
      const key = `${bucketName}::${rec.rowType}`;
      // Among BL rows only the Commission Overwrite lines persist explicit
      // zeros (a deliberate $0 overwrite); Media/Labs types never match.
      const keepZeros = rec.rowType === REVENUE_COMMISSION_OVERWRITE_TYPE;
      if (allowDuplicates) {
        const occurrence = seen.get(rec.rowType) ?? 0;
        seen.set(rec.rowType, occurrence + 1);
        const prev = existingRowsByKey.get(key)?.[occurrence];
        rows.push(buildRow(rec, prev, labelOf, keepZeros));
      } else {
        const prev = existingRowsByKey.get(key)?.[0];
        const row = buildRow(rec, prev, labelOf, keepZeros);
        const at = seen.get(rec.rowType);
        if (at !== undefined) {
          // One row per bucket+type — a repeated sheet line adds into it.
          const base = rows[at];
          const months: MonthlyMap = { ...base.months };
          for (const m of MONTHS)
            months[m] = (months[m] ?? 0) + (row.months[m] ?? 0);
          const note = [base.note, row.note]
            .filter((n): n is string => !!n)
            .join("\n");
          rows[at] = { ...base, months, ...(note ? { note } : {}) };
        } else {
          seen.set(rec.rowType, rows.length);
          rows.push(row);
        }
      }
    }
    imported.push({
      bucketId: bucketIdByName.get(bucketName) ?? newBucket(bucketName).bucketId,
      name: bucketName,
      rows,
    });
  }

  if (mode === "REPLACE") return imported;

  // ADD — upsert into the existing buckets, keep untouched buckets/rows. The
  // imported lines of a type replace all existing lines of that type, inserted
  // where the first one sat; types absent from the import are left untouched.
  const result: ForecastBucket[] = existing.buckets.map((b) => ({
    ...b,
    rows: [...b.rows],
  }));
  const byName = new Map(result.map((b) => [b.name, b]));
  for (const ib of imported) {
    const target = byName.get(ib.name);
    if (!target) {
      result.push(ib);
      byName.set(ib.name, ib);
      continue;
    }
    const importedByType = new Map<string, ForecastRow[]>();
    for (const r of ib.rows) {
      const list = importedByType.get(r.rowType) ?? [];
      list.push(r);
      importedByType.set(r.rowType, list);
    }
    const rows: ForecastRow[] = [];
    const placed = new Set<string>();
    for (const r of target.rows) {
      const incoming = importedByType.get(r.rowType);
      if (!incoming) {
        rows.push(r);
        continue;
      }
      if (!placed.has(r.rowType)) {
        rows.push(...incoming);
        placed.add(r.rowType);
      }
      // Further existing lines of an imported type are dropped — replaced by
      // the imported set above.
    }
    for (const [type, incoming] of importedByType)
      if (!placed.has(type)) rows.push(...incoming);
    target.rows = rows;
  }
  return result;
}

/**
 * Builds the new actuals rows (rowType-keyed) under the chosen mode, attaching
 * detail lines to their parent row.
 *
 * Actuals hold at most one row per type, so repeated sheet lines of the same
 * type are MERGED into it: months are summed, notes joined — no line is
 * silently dropped (mirrors the Media/Labs BL merge).
 *
 * Details follow their parent: when the import provides Detail rows for a type,
 * that parent's details are set to exactly those (both modes). When it provides
 * none, ADD keeps the parent's existing details and REPLACE drops them (the
 * parent was overwritten).
 *
 * Roll-up: a parent that ends up with detail lines derives its months from
 * them (row = Σ details) — any parent months in the sheet are overridden.
 * Importing only Detail rows (no parent line) therefore creates/updates the
 * parent with the details' monthly totals.
 */
function buildActualsRows(
  existing: ForecastRow[],
  parentRecs: BulkRecord[],
  detailRecs: BulkRecord[],
  mode: ImportMode,
  labelOf: (rowType: string, year: number) => string,
  year: number
): ForecastRow[] {
  const existingByType = new Map(existing.map((r) => [r.rowType, r]));

  // Detail records grouped by parent type, in sheet order.
  const detailsByType = new Map<string, BulkRecord[]>();
  for (const d of detailRecs) {
    const list = detailsByType.get(d.rowType) ?? [];
    list.push(d);
    detailsByType.set(d.rowType, list);
  }

  // Resulting parent rows, keyed by type. ADD starts from existing; REPLACE
  // starts empty (overwrite).
  const out = new Map<string, ForecastRow>();
  if (mode === "ADD") {
    for (const [t, r] of existingByType) out.set(t, { ...r, months: { ...r.months } });
  }
  // Upsert imported parent rows. The first line of a type replaces the
  // existing row; further lines of that type add into it.
  const importedTypes = new Set<string>();
  for (const rec of parentRecs) {
    // Admin rows always track explicit zeros — a literal 0 in the sheet is a
    // deliberate value (it wins the Revenue BL-Submission priority).
    const row = buildRow(rec, existingByType.get(rec.rowType), labelOf, true);
    if (importedTypes.has(rec.rowType)) {
      const base = out.get(rec.rowType)!;
      const months: MonthlyMap = { ...base.months };
      for (const m of MONTHS) months[m] = (months[m] ?? 0) + (row.months[m] ?? 0);
      const note = [base.note, row.note]
        .filter((n): n is string => !!n)
        .join("\n");
      const zeros = mergedExplicitZeros(base, row, months);
      const merged: ForecastRow = { ...base, months, ...(note ? { note } : {}) };
      if (zeros.length) merged.explicitZeros = zeros;
      else delete merged.explicitZeros;
      out.set(rec.rowType, merged);
    } else {
      importedTypes.add(rec.rowType);
      out.set(rec.rowType, row);
    }
  }
  // Ensure a parent exists for any detail-only type (keep its existing months).
  for (const t of detailsByType.keys()) {
    if (out.has(t)) continue;
    const prev = existingByType.get(t);
    out.set(
      t,
      prev
        ? { ...prev, months: { ...prev.months } }
        : { rowId: newRow(t, "").rowId, rowType: t, label: labelOf(t, year) || t, months: emptyMonthly() }
    );
  }
  // Attach details.
  for (const [t, row] of out) {
    const imported = detailsByType.get(t);
    if (imported && imported.length) {
      row.details = imported.map(buildDetail);
    } else if (mode === "REPLACE") {
      delete row.details;
    }
    // ADD with no imported details → keep whatever was preserved on the row.
  }
  // Roll-up: a parent with detail lines derives its months — and its explicit
  // zeros — from them (row = Σ details).
  for (const row of out.values()) {
    if (!row.details?.length) continue;
    row.months = detailMonthTotals(row.details);
    const zeros = detailExplicitZeros(row.details);
    if (zeros.length) row.explicitZeros = zeros;
    else delete row.explicitZeros;
  }
  return [...out.values()];
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export interface CommitResult {
  blWrites: number;
  actualsWrites: number;
  commissionsRecalculated: number;
  errors: string[];
}

/**
 * Writes the prepared, valid records to Firestore under the chosen mode, then
 * re-syncs the derived Revenue BL commission for every submission whose Media OR
 * Revenue BL changed (a Revenue-only Replace would otherwise blank the computed
 * row). Each save stamps its side's "last updated" via the underlying services.
 */
export async function commitImport(
  prepared: PreparedImport,
  mode: ImportMode,
  userUid?: string
): Promise<CommitResult> {
  const errors: string[] = [];
  let blWrites = 0;
  let actualsWrites = 0;

  // Submissions whose Media or Revenue BL changed → need a commission re-sync.
  const commissionTargets = new Map<string, { clientId: string; year: number; rfq: RFQType }>();

  for (const axis of prepared.axes) {
    const { axisId, labelOf } = axis;

    // BL writes.
    for (const g of axis.grouped.bl) {
      try {
        const existing =
          axis.existingBL.get(submKey(g.clientId, g.year, g.rfq)) ?? {
            buckets: [],
            actuals: [],
          };
        const buckets = buildBLBuckets(
          existing,
          g,
          mode,
          labelOf,
          axis.config.allowDuplicateRowTypes
        );

        if (axisId === "revenue") {
          // Revenue keeps BL + actuals in one doc; preserve actuals, normalize
          // the fixed shape, then let the commission re-sync fix the computed row.
          const merged = ensureRevenueShape({ buckets, actuals: existing.actuals });
          await saveAxisData(g.clientId, g.year, g.rfq, "revenue", merged, userUid, {
            touchedBL: true,
            touchedActuals: false,
          });
          commissionTargets.set(submKey(g.clientId, g.year, g.rfq), {
            clientId: g.clientId,
            year: g.year,
            rfq: g.rfq,
          });
        } else {
          // Media/Labs: actuals live in annual_actuals — write BL with empty
          // actuals here (mirrors the grid), keeping the doc clean.
          await saveAxisData(
            g.clientId,
            g.year,
            g.rfq,
            axisId,
            { buckets, actuals: [] },
            userUid,
            { touchedBL: true, touchedActuals: false }
          );
          if (axisId === "media")
            commissionTargets.set(submKey(g.clientId, g.year, g.rfq), {
              clientId: g.clientId,
              year: g.year,
              rfq: g.rfq,
            });
        }
        blWrites++;
      } catch (err) {
        errors.push(`BL ${axisId} ${g.clientId}/${g.year}/${g.rfq}: ${msg(err)}`);
      }
    }

    // Revenue per-submission actuals (GAIA) + their details.
    for (const g of axis.grouped.submissionActuals) {
      try {
        const existing = axis.existingRevActuals.get(submKey(g.clientId, g.year, g.rfq)) ?? [];
        const rows = buildActualsRows(existing, g.rows, g.details, mode, labelOf, g.year);
        await saveAxisActuals(g.clientId, g.year, g.rfq, axisId, rows, userUid);
        actualsWrites++;
      } catch (err) {
        errors.push(`Actuals ${axisId} ${g.clientId}/${g.year}/${g.rfq}: ${msg(err)}`);
      }
    }

    // Annual actuals (Media/Labs MediaOcean) + their details.
    for (const g of axis.grouped.annualActuals) {
      try {
        const existing = axis.existingAnnualActuals.get(annKey(g.clientId, g.year)) ?? [];
        const rows = buildActualsRows(existing, g.rows, g.details, mode, labelOf, g.year);
        await saveAnnualActuals(g.clientId, g.year, axisId, rows, userUid);
        actualsWrites++;
      } catch (err) {
        errors.push(`Annual actuals ${axisId} ${g.clientId}/${g.year}: ${msg(err)}`);
      }
    }
  }

  // Re-sync derived Revenue BL commission for every touched submission.
  let commissionsRecalculated = 0;
  for (const { clientId, year, rfq } of commissionTargets.values()) {
    try {
      const client = prepared.ref.clientsById.get(clientId);
      const yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined =
        client?.commissionsConfig?.[year];
      await syncRevenueCommission(clientId, year, rfq, yearRates, userUid);
      commissionsRecalculated++;
    } catch (err) {
      errors.push(`Commission sync ${clientId}/${year}/${rfq}: ${msg(err)}`);
    }
  }

  return { blWrites, actualsWrites, commissionsRecalculated, errors };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ════════════════════════════════════════════════════════════════════════════
// TARGETS (preview chips) + BULK DELETE
// ════════════════════════════════════════════════════════════════════════════

/** One (client × submission × axis × section) a bulk operation touches. */
export interface BulkTarget {
  clientId: string;
  clientName: string;
  year: number;
  /** null → the year's annual MediaOcean data (shared by every RFQ). */
  rfq: RFQType | null;
  axisId: AxisId;
  section: "BL" | "ADMIN";
}

const targetKey = (t: BulkTarget) =>
  `${t.clientId}|${t.year}|${t.rfq ?? "annual"}|${t.axisId}|${t.section}`;

/** Sort for display: client name, year, RFQ order, axis order, BL first. */
function sortTargets(targets: BulkTarget[]): BulkTarget[] {
  const axisRank: Record<AxisId, number> = { media: 0, labs: 1, revenue: 2 };
  return targets.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.year - b.year ||
      (a.rfq ? RFQ_TYPE_ORDER[a.rfq] : -1) - (b.rfq ? RFQ_TYPE_ORDER[b.rfq] : -1) ||
      axisRank[a.axisId] - axisRank[b.axisId] ||
      (a.section === "BL" ? 0 : 1) - (b.section === "BL" ? 0 : 1)
  );
}

/**
 * Flat list of what a prepared import will REPLACE — one entry per
 * client × submission × axis × section carrying valid rows. Drives the
 * preview chips in the review modal.
 */
export function replaceTargets(prepared: PreparedImport): BulkTarget[] {
  const nameOf = (id: string) =>
    prepared.ref.clientsById.get(id)?.CL_Name ?? id;
  const targets: BulkTarget[] = [];
  for (const axis of prepared.axes) {
    for (const g of axis.grouped.bl) {
      targets.push({
        clientId: g.clientId, clientName: nameOf(g.clientId),
        year: g.year, rfq: g.rfq, axisId: axis.axisId, section: "BL",
      });
    }
    for (const g of axis.grouped.submissionActuals) {
      targets.push({
        clientId: g.clientId, clientName: nameOf(g.clientId),
        year: g.year, rfq: g.rfq, axisId: axis.axisId, section: "ADMIN",
      });
    }
    for (const g of axis.grouped.annualActuals) {
      targets.push({
        clientId: g.clientId, clientName: nameOf(g.clientId),
        year: g.year, rfq: null, axisId: axis.axisId, section: "ADMIN",
      });
    }
  }
  return sortTargets(targets);
}

export interface DeleteScope {
  clientIds: string[];
  years: number[];
  rfqs: RFQType[];
  axes: AxisId[];
  /** Wipe the BL Input section. */
  includeBL: boolean;
  /** Wipe the Admin section (Revenue GAIA per submission; Media/Labs annual
   *  MediaOcean — the whole YEAR's figures, not one RFQ's). */
  includeActuals: boolean;
}

export interface PreparedDelete {
  /** Non-empty sections that will actually be cleared. */
  targets: BulkTarget[];
}

/**
 * Reads the live data for the scope and lists every non-empty section it would
 * clear — nothing is written here. LOCKED submissions are included: the Bulk
 * tools are admin-only and bypass the lock (which gates the BLs' grid only).
 */
export async function prepareBulkDelete(
  scope: DeleteScope,
  ref: BulkReference
): Promise<PreparedDelete> {
  const nameOf = (id: string) => ref.clientsById.get(id)?.CL_Name ?? id;
  const targets: BulkTarget[] = [];

  const tasks: Promise<void>[] = [];

  for (const clientId of scope.clientIds) {
    for (const year of scope.years) {
      // Submission-scoped sections (BL for all axes, Revenue GAIA).
      for (const rfq of scope.rfqs) {
        const status = ref.rfqStatusByKey.get(buildRFQId(year, rfq)) ?? "MISSING";
        if (status === "MISSING") continue;
        tasks.push(
          (async () => {
            const entry = await fetchDataEntry(clientId, year, rfq);
            if (!entry) return;
            for (const axisId of scope.axes) {
              const axis = entry.axes?.[axisId];
              const hasBl = !!axis?.buckets?.some((b) => b.rows.length > 0);
              if (scope.includeBL && hasBl) {
                targets.push({
                  clientId, clientName: nameOf(clientId),
                  year, rfq, axisId, section: "BL",
                });
              }
              // Per-submission actuals only exist on Revenue (GAIA).
              if (
                scope.includeActuals &&
                axisId === "revenue" &&
                (axis?.actuals?.length ?? 0) > 0
              ) {
                targets.push({
                  clientId, clientName: nameOf(clientId),
                  year, rfq, axisId, section: "ADMIN",
                });
              }
            }
          })()
        );
      }

      // Annual MediaOcean actuals (Media/Labs) — year-scoped, RFQ-independent.
      if (
        scope.includeActuals &&
        (scope.axes.includes("media") || scope.axes.includes("labs"))
      ) {
        tasks.push(
          (async () => {
            const annual = await fetchAnnualActualsEntry(clientId, year);
            for (const axisId of ["media", "labs"] as const) {
              if (!scope.axes.includes(axisId)) continue;
              const rows = annual[axisId];
              if (Array.isArray(rows) && rows.length > 0) {
                targets.push({
                  clientId, clientName: nameOf(clientId),
                  year, rfq: null, axisId, section: "ADMIN",
                });
              }
            }
          })()
        );
      }
    }
  }

  await Promise.all(tasks);

  // Concurrent tasks can never duplicate a key, but keep the output stable.
  const unique = new Map(targets.map((t) => [targetKey(t), t]));
  return { targets: sortTargets([...unique.values()]) };
}

export interface DeleteResult {
  sectionsCleared: number;
  commissionsRecalculated: number;
  errors: string[];
}

/**
 * Clears every prepared target: BL sections are emptied (Revenue keeps its
 * GAIA actuals unless they are targeted too, and vice versa), annual
 * MediaOcean actuals are emptied per year. The derived Revenue commission is
 * then re-synced for touched submissions — it is computed from Media, so
 * deleting Media zeroes it and deleting Revenue BL re-derives it.
 */
export async function commitBulkDelete(
  prepared: PreparedDelete,
  ref: BulkReference,
  userUid?: string
): Promise<DeleteResult> {
  const errors: string[] = [];
  let sectionsCleared = 0;

  // Group the submission-scoped targets per (triplet × axis) so Revenue's BL
  // and GAIA clear in ONE write of the axis.
  interface AxisClear {
    clientId: string;
    year: number;
    rfq: RFQType;
    axisId: AxisId;
    bl: boolean;
    admin: boolean;
  }
  const byTripletAxis = new Map<string, AxisClear>();
  const annualTargets: BulkTarget[] = [];

  for (const t of prepared.targets) {
    if (t.rfq === null) {
      annualTargets.push(t);
      continue;
    }
    const key = `${t.clientId}|${t.year}|${t.rfq}|${t.axisId}`;
    const g =
      byTripletAxis.get(key) ??
      ({
        clientId: t.clientId, year: t.year, rfq: t.rfq, axisId: t.axisId,
        bl: false, admin: false,
      } as AxisClear);
    if (t.section === "BL") g.bl = true;
    else g.admin = true;
    byTripletAxis.set(key, g);
  }

  // Submissions whose Media or Revenue changed → commission re-sync.
  const commissionTargets = new Map<
    string,
    { clientId: string; year: number; rfq: RFQType }
  >();

  for (const g of byTripletAxis.values()) {
    try {
      const existing = await fetchAxisData(g.clientId, g.year, g.rfq, g.axisId);
      const next: AxisData = {
        buckets: g.bl ? [] : existing.buckets,
        // Media/Labs submission docs never hold actuals (they are annual);
        // Revenue keeps its GAIA rows unless they are being cleared too.
        actuals:
          g.axisId === "revenue" ? (g.admin ? [] : existing.actuals) : [],
      };
      await saveAxisData(g.clientId, g.year, g.rfq, g.axisId, next, userUid, {
        touchedBL: g.bl,
        touchedActuals: g.admin,
      });
      sectionsCleared += (g.bl ? 1 : 0) + (g.admin ? 1 : 0);
      if (g.axisId === "media" || g.axisId === "revenue") {
        commissionTargets.set(submKey(g.clientId, g.year, g.rfq), {
          clientId: g.clientId, year: g.year, rfq: g.rfq,
        });
      }
    } catch (err) {
      errors.push(`${g.axisId} ${g.clientId}/${g.year}/${g.rfq}: ${msg(err)}`);
    }
  }

  for (const t of annualTargets) {
    try {
      await saveAnnualActuals(t.clientId, t.year, t.axisId, [], userUid);
      sectionsCleared++;
    } catch (err) {
      errors.push(`Annual ${t.axisId} ${t.clientId}/${t.year}: ${msg(err)}`);
    }
  }

  let commissionsRecalculated = 0;
  for (const { clientId, year, rfq } of commissionTargets.values()) {
    try {
      const client = ref.clientsById.get(clientId);
      await syncRevenueCommission(
        clientId, year, rfq, client?.commissionsConfig?.[year], userUid
      );
      commissionsRecalculated++;
    } catch (err) {
      errors.push(`Commission sync ${clientId}/${year}/${rfq}: ${msg(err)}`);
    }
  }

  return { sectionsCleared, commissionsRecalculated, errors };
}
