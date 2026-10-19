// lib/server/report-filter.ts

/**
 * Filters one Reports snapshot file (reports/{table}/{agency}/data.json.gz,
 * format v1 — encoder scripts/lib/report-snapshot.mjs, decoder
 * lib/dashboard/data/report-snapshot.ts) down to some clients' rows, and
 * re-encodes it in the same format, so the browser decodes it unchanged.
 * Used by the report-file route while MediaBox allocations apply to the
 * caller (lib/server/report-access.ts). Node only (zlib, Buffer).
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { REPORT_CLIENT_COLUMN } from "../format/report-client-column";

export { REPORT_CLIENT_COLUMN };

interface SnapshotColumn {
  name: string;
  dict: unknown[];
  width: 1 | 2 | 4;
  idx: string;
}
interface Snapshot {
  v: number;
  table: string;
  agency: string;
  syncedAt: string;
  rowCount: number;
  columns: SnapshotColumn[];
}

function decodeIndices(b64: string, width: 1 | 2 | 4, rowCount: number): Uint32Array {
  const bytes = Buffer.from(b64, "base64");
  const out = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    out[i] = width === 1 ? bytes.readUInt8(i) : width === 2 ? bytes.readUInt16LE(i * 2) : bytes.readUInt32LE(i * 4);
  }
  return out;
}

/** Re-encodes the kept rows of one column, with a dictionary of only the values they use. */
function encodeColumn(col: SnapshotColumn, idx: Uint32Array, keep: number[]): SnapshotColumn {
  const remap = new Map<number, number>();
  const dict: unknown[] = [];
  const codes = keep.map((r) => {
    const old = idx[r];
    let k = remap.get(old);
    if (k === undefined) {
      k = dict.length;
      dict.push(col.dict[old]);
      remap.set(old, k);
    }
    return k;
  });
  const width: 1 | 2 | 4 = dict.length <= 0x100 ? 1 : dict.length <= 0x10000 ? 2 : 4;
  const bytes = Buffer.alloc(codes.length * width);
  codes.forEach((k, i) => {
    if (width === 1) bytes.writeUInt8(k, i);
    else if (width === 2) bytes.writeUInt16LE(k, i * 2);
    else bytes.writeUInt32LE(k, i * 4);
  });
  return { name: col.name, dict, width, idx: bytes.toString("base64") };
}

/**
 * The gzipped snapshot reduced to the rows whose client id (REPORT_CLIENT_COLUMN
 * of the table) is in `clientIds`; `rowCount` 0 when none match or the table
 * has no client column.
 */
export function filterSnapshotByClients(gz: ArrayBuffer, clientIds: ReadonlySet<string>): ArrayBuffer {
  const snap = JSON.parse(gunzipSync(Buffer.from(gz)).toString("utf8")) as Snapshot;
  const columnName = REPORT_CLIENT_COLUMN[snap.table];
  const clientCol = snap.columns.find((c) => c.name === columnName);
  const keep: number[] = [];
  if (clientCol) {
    const idx = decodeIndices(clientCol.idx, clientCol.width, snap.rowCount);
    const allowed = clientCol.dict.map((v) => v !== null && v !== undefined && clientIds.has(String(v).trim()));
    for (let r = 0; r < snap.rowCount; r++) if (allowed[idx[r]]) keep.push(r);
  }
  const out: Snapshot = {
    ...snap,
    rowCount: keep.length,
    columns: snap.columns.map((c) => encodeColumn(c, decodeIndices(c.idx, c.width, snap.rowCount), keep)),
  };
  const buf = gzipSync(Buffer.from(JSON.stringify(out)));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
