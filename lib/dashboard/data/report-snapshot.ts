// lib/dashboard/data/report-snapshot.ts

/**
 * Reports tab data layer — loads the per-agency report snapshots that the
 * monthly sync publishes to Firebase Storage (scripts/lib/report-snapshot.mjs;
 * keep the file format in sync with the encoder there).
 *
 *   reports/manifest.json                   which agencies exist per table
 *   reports/{table}/{agency}/data.json.gz   one agency's rows, column-encoded
 *
 * Only the agency files inside the user's scope are requested; storage.rules
 * reject any other (the real enforcement). Files are merged into one in-memory
 * columnar table — each column is a dictionary of distinct values plus one
 * index per row — which keeps ~126k × 70 MIR cells to a few tens of MB and
 * makes filtering a scan over integer arrays. Row objects are only built for
 * the 10-row preview and at export time.
 *
 * No BigQuery anywhere: users never need (or see errors about) BigQuery access.
 */

import { getBlob, ref } from "firebase/storage";
import { storage } from "../../firebase";
import type { AgencyScope } from "../../format/agency-scope";

export type ReportTable = "mir" | "billing";

export type Cell = string | number | boolean | null;
export type ReportRow = Record<string, Cell>;

interface SnapshotColumnJson {
  name: string;
  dict: Cell[];
  width: 1 | 2 | 4;
  idx: string; // base64, little-endian unsigned ints of `width` bytes
}

interface SnapshotJson {
  v: number;
  table: string;
  agency: string;
  syncedAt: string;
  rowCount: number;
  columns: SnapshotColumnJson[];
}

interface ManifestJson {
  v: number;
  tables: Record<string, { syncedAt: string; agencies: string[] }>;
}

/** A report held column by column: `dicts[c][idx[c][row]]` is a cell. */
export interface ColumnarTable {
  columns: string[];
  rowCount: number;
  dicts: Record<string, Cell[]>;
  idx: Record<string, Uint32Array>;
}

export interface LoadedReport {
  table: ColumnarTable;
  /** Agencies actually loaded (what the user is looking at). */
  agencies: string[];
  /** When the monthly sync published this table, or null if never. */
  syncedAt: string | null;
}

/** User-facing error with a plain-language message. */
export class ReportLoadError extends Error {}

const SUPPORTED_VERSION = 1;

// ─── Download + decode ────────────────────────────────────────────────────────

function describeStorageError(e: unknown, what: string): ReportLoadError {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "storage/object-not-found") {
    return new ReportLoadError(
      `${what} hasn't been published yet. It appears after the next monthly data sync.`
    );
  }
  if (code === "storage/unauthorized") {
    return new ReportLoadError(
      `You don't have access to ${what}. If you think you should, contact an admin.`
    );
  }
  return new ReportLoadError(
    `Couldn't download ${what}: ${e instanceof Error ? e.message : String(e)}`
  );
}

async function gunzipText(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function decodeIndices(b64: string, width: 1 | 2 | 4, rowCount: number): Uint32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const out = new Uint32Array(rowCount);
  if (width === 1) {
    out.set(bytes.subarray(0, rowCount));
  } else {
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < rowCount; i++) {
      out[i] = width === 2 ? view.getUint16(i * 2, true) : view.getUint32(i * 4, true);
    }
  }
  return out;
}

async function fetchManifest(): Promise<ManifestJson> {
  try {
    const blob = await getBlob(ref(storage, "reports/manifest.json"));
    return JSON.parse(await blob.text()) as ManifestJson;
  } catch (e) {
    throw describeStorageError(e, "This report");
  }
}

// Decoded agency files, keyed by path + sync time so a new monthly sync is
// picked up while switching sub-tabs doesn't re-download.
const fileCache = new Map<string, Promise<ColumnarTable>>();

function loadAgencyFile(
  table: ReportTable,
  agency: string,
  syncedAt: string
): Promise<ColumnarTable> {
  const path = `reports/${table}/${agency}/data.json.gz`;
  const key = `${path}@${syncedAt}`;
  let p = fileCache.get(key);
  if (!p) {
    p = (async () => {
      let json: SnapshotJson;
      try {
        json = JSON.parse(await gunzipText(await getBlob(ref(storage, path))));
      } catch (e) {
        throw describeStorageError(e, `the ${agency} report`);
      }
      if (json.v !== SUPPORTED_VERSION) {
        throw new ReportLoadError(
          `The ${agency} report uses a newer format (v${json.v}). Reload the page.`
        );
      }
      const t: ColumnarTable = {
        columns: json.columns.map((c) => c.name),
        rowCount: json.rowCount,
        dicts: {},
        idx: {},
      };
      for (const c of json.columns) {
        t.dicts[c.name] = c.dict;
        t.idx[c.name] = decodeIndices(c.idx, c.width, json.rowCount);
      }
      return t;
    })();
    p.catch(() => fileCache.delete(key)); // let a retry refetch
    fileCache.set(key, p);
  }
  return p;
}

/** Concatenates agency tables, unifying each column's dictionary. */
function mergeTables(parts: ColumnarTable[]): ColumnarTable {
  if (parts.length === 1) return parts[0];
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    for (const c of p.columns) {
      if (!seen.has(c)) {
        seen.add(c);
        columns.push(c);
      }
    }
  }
  const rowCount = parts.reduce((n, p) => n + p.rowCount, 0);
  const dicts: Record<string, Cell[]> = {};
  const idx: Record<string, Uint32Array> = {};

  for (const c of columns) {
    const dict: Cell[] = [];
    const lookup = new Map<string, number>();
    const code = (v: Cell) => {
      const k = JSON.stringify(v);
      let i = lookup.get(k);
      if (i === undefined) {
        i = dict.length;
        dict.push(v);
        lookup.set(k, i);
      }
      return i;
    };
    const out = new Uint32Array(rowCount);
    let offset = 0;
    for (const p of parts) {
      const pd = p.dicts[c];
      const pi = p.idx[c];
      if (!pd) {
        out.fill(code(null), offset, offset + p.rowCount); // column absent in this file
      } else {
        const remap = pd.map(code);
        for (let r = 0; r < p.rowCount; r++) out[offset + r] = remap[pi[r]];
      }
      offset += p.rowCount;
    }
    dicts[c] = dict;
    idx[c] = out;
  }
  return { columns, rowCount, dicts, idx };
}

/**
 * Loads one report table for the user's agency scope. Admin/Exec get every
 * published agency (incl. rows without a recognized agency); everyone else
 * gets the intersection of their agencies with what was published.
 */
export async function loadReport(
  table: ReportTable,
  scope: AgencyScope
): Promise<LoadedReport> {
  const manifest = await fetchManifest();
  const entry = manifest.tables?.[table];
  if (!entry) {
    throw new ReportLoadError(
      "This report hasn't been published yet. It appears after the next monthly data sync."
    );
  }
  const agencies = scope.all
    ? entry.agencies
    : entry.agencies.filter((a) => scope.agencies.includes(a));
  if (agencies.length === 0) {
    return {
      table: { columns: [], rowCount: 0, dicts: {}, idx: {} },
      agencies: [],
      syncedAt: entry.syncedAt,
    };
  }
  const parts = await Promise.all(
    agencies.map((a) => loadAgencyFile(table, a, entry.syncedAt))
  );
  return { table: mergeTables(parts), agencies, syncedAt: entry.syncedAt };
}

// ─── Query helpers (pure, in memory) ──────────────────────────────────────────

const asText = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());

/** Distinct non-empty values of a column, as text, sorted. */
export function distinctValues(t: ColumnarTable, column: string): string[] {
  const dict = t.dicts[column];
  if (!dict) return [];
  const set = new Set<string>();
  for (const v of dict) {
    const s = asText(v);
    if (s !== "") set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Indices of rows matching every active filter (AND across fields, OR within
 * a field; values compared as trimmed text). An empty filter list = no filter.
 */
export function filterRowIndices(
  t: ColumnarTable,
  filters: Record<string, string[]>
): number[] {
  // Per active column: which dictionary entries pass.
  const tests: { idx: Uint32Array; pass: Uint8Array }[] = [];
  for (const [column, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue;
    const dict = t.dicts[column];
    if (!dict) return []; // filtering on a column this table doesn't have
    const wanted = new Set(values);
    const pass = new Uint8Array(dict.length);
    dict.forEach((v, k) => {
      if (wanted.has(asText(v))) pass[k] = 1;
    });
    tests.push({ idx: t.idx[column], pass });
  }
  const out: number[] = [];
  outer: for (let r = 0; r < t.rowCount; r++) {
    for (const { idx, pass } of tests) {
      if (!pass[idx[r]]) continue outer;
    }
    out.push(r);
  }
  return out;
}

/** Materializes one row as an object. */
export function rowAt(t: ColumnarTable, r: number): ReportRow {
  const row: ReportRow = {};
  for (const c of t.columns) row[c] = t.dicts[c][t.idx[c][r]];
  return row;
}
