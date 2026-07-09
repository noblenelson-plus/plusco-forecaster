// lib/services/bulk-import-service.ts

/**
 * Orchestration for the Bulk Edit module — the only layer that talks to both
 * Firestore and Google Sheets. It:
 *   • EXPORT: fetches the in-scope forecast data, flattens it (lib/format/
 *     bulk-forecast) and pushes one tab per axis (+ a Guide) to a new sheet.
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
  DETAIL_LEVEL_COUNT,
  MEDIA_AXIS_CONFIG,
  MEDIA_TYPE_LABELS,
  REVENUE_AXIS_CONFIG,
  REVENUE_ADMIN_STREAMS,
  REVENUE_STREAM_LABELS,
  REVENUE_COMMISSION_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  buildLabsAxisConfig,
  type AxisConfig,
  type RevenueStream,
} from "../types/forecaster.types";
import { type RFQType, type RFQ, RFQ_TYPES, buildRFQId } from "../types/rfq.types";
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
const GUIDE_TAB = "Guide";

// ─── Per-axis sheet columns ──────────────────────────────────────────────────

/**
 * Each axis tab shows only the columns it needs. The type column carries a
 * human label (Media type / stream / partner name) rather than the opaque key;
 * Media/Labs add a Project column, Revenue has none. `rowType` is intentionally
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
    return REVENUE_ADMIN_STREAMS.map((s) => REVENUE_STREAM_LABELS[s]);
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
    if ((REVENUE_ADMIN_STREAMS as string[]).some((s) => norm(s) === n)) return n;
    // Legacy label — the `gaiaForecast` stream was exported as "GAIA Revenue"
    // before it was renamed to "Official Revenue"; keep old sheets importable.
    if (n === "gaia revenue") return REVENUE_GAIA_FORECAST_TYPE;
    const hit = REVENUE_ADMIN_STREAMS.find(
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
      return (REVENUE_ADMIN_STREAMS as string[]).includes(rowType);
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
      });
    }
  }
  return out;
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

function guideMatrix(): string[][] {
  return [
    ["PlusCo Forecaster — Bulk Edit guide"],
    [""],
    ["How it works"],
    ["1. Edit values directly in the Media / Revenue / Labs tabs."],
    ["2. Coloured cells (Section, RFQ, type) offer dropdowns — use them."],
    ["3. Back in the app, paste this sheet's URL and click Pull & Review."],
    ["4. Pick Add or Replace, review the QA, then confirm."],
    [""],
    ["Columns"],
    ["ClientId", "Join key — DO NOT change. ClientName is for reading only."],
    ["Year / RFQ", "Identify the submission. Use a real, unlocked RFQ."],
    ["Section", `"${SECTION_BL}" = BL input, "${SECTION_ACTUALS}" = actuals, "${SECTION_DETAIL}" = a breakdown line under an actuals row.`],
    ["Project", "Project name (Media/Labs tabs only). Leave blank for actuals."],
    ["Media Type / Stream / Partner", "The line's type — pick from the dropdown."],
    ["Level 1 / 2 / 3", `Free-text breakdown info — used only on "${SECTION_DETAIL}" rows. The type column names the parent actuals row.`],
    ["Jan..Dec", "Monthly dollar values."],
    [""],
    ["Add vs Replace"],
    ["Add", "Upsert: matching rows updated, new rows added, others kept."],
    ["Replace", "The submission's axis/section is overwritten by these rows."],
    [""],
    ["Notes"],
    ["MediaOcean actuals (Media/Labs) are annual:", `set RFQ to "${ANNUAL_RFQ_SENTINEL}" or leave blank.`],
    ["Revenue Commission is computed from Media in BL only", "— BL Commission is ignored on import; the GAIA (Actuals) Commission is imported normally."],
    ["Locked RFQs are rejected.", "Duplicate rows for the same type: last one wins."],
    [`An actuals row with "${SECTION_DETAIL}" lines is their sum`, `— its own monthly values are derived from the details. Importing only "${SECTION_DETAIL}" rows fills the parent's totals.`],
  ];
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
  const created = await sheets.createSpreadsheet(title, [
    ...AXIS_TABS.map((a) => a.tab),
    GUIDE_TAB,
  ]);

  // Write each axis tab (header always present so the round-trip parses even
  // when an axis has no data) and the guide.
  for (const { axisId, tab } of AXIS_TABS) {
    await sheets.writeValues(
      created.spreadsheetId,
      tab,
      buildMatrix(records[axisId], AXIS_COLUMNS[axisId])
    );
  }
  await sheets.writeValues(created.spreadsheetId, GUIDE_TAB, guideMatrix());

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

const blKeys = (data: AxisData): string[] =>
  data.buckets.flatMap((b) => b.rows.map((r) => `${b.name}::${r.rowType}`));
const incomingBLKeys = (g: BLGroup): string[] => {
  const keys = new Set<string>();
  for (const [bucket, recs] of g.buckets)
    for (const rec of recs) keys.add(`${bucket}::${rec.rowType}`);
  return [...keys];
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
      diff = addDiff(diff, diffKeys(blKeys(existing), incomingBLKeys(g), mode));
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
  labelOf: (rowType: string, year: number) => string
): ForecastRow {
  return {
    rowId: existing?.rowId ?? newRow(rec.rowType, "").rowId,
    rowType: rec.rowType,
    label: labelOf(rec.rowType, rec.year) || rec.label || rec.rowType,
    months: { ...emptyMonthly(), ...rec.months },
    ...(rec.note ? { note: rec.note } : {}),
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
  };
}

/** Builds the new BL buckets for a submission under the chosen mode. */
function buildBLBuckets(
  existing: AxisData,
  group: BLGroup,
  mode: ImportMode,
  labelOf: (rowType: string, year: number) => string
): ForecastBucket[] {
  const existingRowByKey = new Map<string, ForecastRow>();
  const bucketIdByName = new Map<string, string>();
  for (const b of existing.buckets) {
    bucketIdByName.set(b.name, b.bucketId);
    for (const r of b.rows) existingRowByKey.set(`${b.name}::${r.rowType}`, r);
  }

  // Imported buckets (last-wins per bucket+rowType key).
  const imported: ForecastBucket[] = [];
  for (const [bucketName, recs] of group.buckets) {
    const byType = new Map<string, ForecastRow>();
    for (const rec of recs) {
      const prev = existingRowByKey.get(`${bucketName}::${rec.rowType}`);
      byType.set(rec.rowType, buildRow(rec, prev, labelOf));
    }
    imported.push({
      bucketId: bucketIdByName.get(bucketName) ?? newBucket(bucketName).bucketId,
      name: bucketName,
      rows: [...byType.values()],
    });
  }

  if (mode === "REPLACE") return imported;

  // ADD — upsert into the existing buckets, keep untouched buckets/rows.
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
    const byType = new Map(target.rows.map((r) => [r.rowType, r] as const));
    for (const r of ib.rows) byType.set(r.rowType, r);
    target.rows = [...byType.values()];
  }
  return result;
}

/**
 * Builds the new actuals rows (rowType-keyed) under the chosen mode, attaching
 * detail lines to their parent row.
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
  // Upsert imported parent rows.
  for (const rec of parentRecs) {
    out.set(rec.rowType, buildRow(rec, existingByType.get(rec.rowType), labelOf));
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
  // Roll-up: a parent with detail lines derives its months from them.
  for (const row of out.values()) {
    if (row.details?.length) row.months = detailMonthTotals(row.details);
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
        const buckets = buildBLBuckets(existing, g, mode, labelOf);

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
