// filepath: scripts/lib/report-snapshot.mjs
/**
 * Publishes a raw report table (MIR, Billing Summary) to Firebase Storage as one
 * compressed snapshot file PER AGENCY. The dashboard's Reports tab downloads
 * only the files the signed-in user may read -- storage.rules enforce that per
 * agency folder -- then filters and exports in the browser. No one needs
 * BigQuery access to use the page.
 *
 * Layout in the pluscoops bucket:
 *   reports/manifest.json                      which agencies exist per table,
 *                                              plus the sync time (no data)
 *   reports/{table}/{agency}/data.json.gz      that agency's rows
 *
 * File format (v1), gzipped JSON, stored column by column so the heavily
 * repeated values (client names, agencies, months...) are written once:
 *   {
 *     v: 1, table, agency, syncedAt, rowCount,
 *     columns: [{ name, dict: [distinct values], width: 1|2|4, idx: base64 }]
 *   }
 * `idx` holds one little-endian unsigned int per row (byte width `width`)
 * pointing into `dict`. The decoder is lib/dashboard/data/report-snapshot.ts;
 * keep the two in sync.
 */

import zlib from "node:zlib";
import { cleanValue } from "./reconcile.mjs";
import { countByAgency, logAgencySplit } from "./agency.mjs";

export const REPORTS_BUCKET = "pluscoops.firebasestorage.app";
const MANIFEST_PATH = "reports/manifest.json";
const FORMAT_VERSION = 1;

/** Column-encodes cleaned rows (see the file-format note above). */
function encodeColumns(rows, columnNames) {
  return columnNames.map((name) => {
    const dict = [];
    const lookup = new Map(); // JSON key -> dict index (keeps 1 and "1" apart)
    const idx = new Uint32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][name] ?? null;
      const key = JSON.stringify(v);
      let k = lookup.get(key);
      if (k === undefined) {
        k = dict.length;
        dict.push(v);
        lookup.set(key, k);
      }
      idx[i] = k;
    }
    const width = dict.length <= 0x100 ? 1 : dict.length <= 0x10000 ? 2 : 4;
    const bytes = Buffer.alloc(rows.length * width);
    for (let i = 0; i < rows.length; i++) {
      if (width === 1) bytes.writeUInt8(idx[i], i);
      else if (width === 2) bytes.writeUInt16LE(idx[i], i * 2);
      else bytes.writeUInt32LE(idx[i], i * 4);
    }
    return { name, dict, width, idx: bytes.toString("base64") };
  });
}

/**
 * Splits `rawRows` (straight from BigQuery) by agency and uploads one snapshot
 * per agency, removes agency files from earlier runs that no longer exist, and
 * updates the manifest. Uploads happen before the manifest update and stale
 * deletes, so readers never see a manifest pointing at a missing file.
 *
 * @param {object}   o
 * @param {import("firebase-admin").app.App} o.app  initialized Admin app
 * @param {string}   o.table      "mir" | "billing" (folder + manifest key)
 * @param {object[]} o.rawRows    BigQuery rows
 * @param {(row:object)=>string} o.agencyOf  cleaned row -> app agency tag
 */
export async function publishReportSnapshots({ app, table, rawRows, agencyOf }) {
  const bucket = app.storage().bucket(REPORTS_BUCKET);
  const syncedAt = new Date().toISOString();

  // Clean once, in the same way as the Firestore syncs.
  const rows = rawRows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = cleanValue(v);
    return out;
  });

  // Column order = BigQuery schema order, plus any column only later rows have.
  const columnSet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) columnSet.add(k);
  const columnNames = [...columnSet];

  const byAgency = new Map();
  for (const r of rows) {
    const a = agencyOf(r);
    if (!byAgency.has(a)) byAgency.set(a, []);
    byAgency.get(a).push(r);
  }
  logAgencySplit(table, countByAgency(rows, agencyOf));

  const agencies = [...byAgency.keys()].sort();
  for (const agency of agencies) {
    const agencyRows = byAgency.get(agency);
    const payload = {
      v: FORMAT_VERSION,
      table,
      agency,
      syncedAt,
      rowCount: agencyRows.length,
      columns: encodeColumns(agencyRows, columnNames),
    };
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
    const path = `reports/${table}/${agency}/data.json.gz`;
    await bucket.file(path).save(gz, {
      resumable: false,
      metadata: {
        // Served as opaque gzip bytes; the browser gunzips it itself.
        contentType: "application/gzip",
        cacheControl: "private, max-age=0, no-cache",
      },
    });
    console.log(
      `  uploaded ${path}  (${agencyRows.length} rows, ${(gz.length / 1048576).toFixed(2)} MB)`
    );
  }

  // Manifest: read-modify-write so the other table's entry is preserved.
  const manifestFile = bucket.file(MANIFEST_PATH);
  let manifest = { v: FORMAT_VERSION, tables: {} };
  const [exists] = await manifestFile.exists();
  if (exists) {
    const [buf] = await manifestFile.download();
    try {
      manifest = JSON.parse(buf.toString("utf8"));
      manifest.tables = manifest.tables || {};
    } catch {
      console.warn("  existing manifest unreadable - rewriting it");
    }
  }
  manifest.tables[table] = { syncedAt, agencies };
  await manifestFile.save(JSON.stringify(manifest, null, 2), {
    resumable: false,
    metadata: {
      contentType: "application/json",
      cacheControl: "private, max-age=0, no-cache",
    },
  });
  console.log(`  manifest updated (${MANIFEST_PATH})`);

  // Remove agency folders from earlier runs that this run no longer produced.
  const [files] = await bucket.getFiles({ prefix: `reports/${table}/` });
  const keep = new Set(agencies.map((a) => `reports/${table}/${a}/data.json.gz`));
  for (const f of files) {
    if (!keep.has(f.name)) {
      await f.delete();
      console.log(`  deleted stale ${f.name}`);
    }
  }
}
