// filepath: scripts/sync-mir-raw.mjs
/**
 * Sync:  BigQuery PCC_Dashboard_NATIVE  ->  Firestore "mir_raw"
 * Copies the raw MIR table (PCC_Dashboard_NATIVE) verbatim into a dashboard-only
 * Firestore collection in the pluscoops project, one document per source row.
 * Backs the "MIR Raw Data" page: leads filter to their slice and export it.
 *
 * IMPORTANT -- this is a RAW dump, not an aggregate. Two differences from the
 * mediaocean/social syncs:
 *   1) Every row is preserved, including legitimate duplicate transaction lines.
 *      So the doc id is a zero-padded SEQUENTIAL INDEX (row_00000001), NOT a hash
 *      of the values -- a value hash would silently collapse identical rows.
 *   2) It is large (~126k rows). Batched writes; a syncBatchId stamp + stale-doc
 *      cleanup keeps the collection exactly mirroring the table across re-runs
 *      (if the table shrinks, leftover higher-index docs from a prior run are
 *      deleted).
 *
 * The app NEVER loads this whole collection into the browser. The page queries a
 * single-field slice (by Agency or Client) server-side; this sync just mirrors
 * the table.
 *
 * Run from repo root, AFTER the monthly NATIVE rebuild:
 *   node scripts/sync-mir-raw.mjs
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "mir_raw";
const BATCH_SIZE = 450;

// Verbatim from the other syncs so values normalize identically: numbers/strings/
// booleans pass through, bigint -> Number, BigQuery wrapper objects ({ value })
// unwrap (numeric strings coerced to numbers), else null.
function cleanValue(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean") return v;
  if (t === "bigint") return Number(v);
  if (t === "object") {
    if (v.value !== undefined && v.value !== null) {
      const inner = v.value;
      if (typeof inner === "string") {
        const n = Number(inner);
        return inner.trim() !== "" && !Number.isNaN(n) ? n : inner;
      }
      return inner;
    }
    return String(v);
  }
  return null;
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();

  const bq = new BigQuery({ projectId: BQ_PROJECT });

  console.log(`Querying ${BQ_TABLE} ...`);
  const [rows] = await bq.query({ query: `SELECT * FROM ${BQ_TABLE}` });
  console.log(`Fetched ${rows.length} row(s) from BigQuery.`);

  if (rows.length === 0) {
    console.warn("No rows returned - nothing to write. Exiting.");
    process.exit(0);
  }

  const columnCount = Object.keys(rows[0]).length;
  console.log(`Each row has ${columnCount} columns.`);

  const syncBatchId = Date.now();
  const pad = (n) => String(n).padStart(8, "0");

  // ── Write every row, keyed by sequential index (preserves duplicates) ──
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    slice.forEach((row, j) => {
      const idx = i + j;
      const data = { _rowIndex: idx, _syncBatchId: syncBatchId };
      for (const [key, value] of Object.entries(row)) {
        data[key] = cleanValue(value);
      }
      batch.set(db.collection(COLLECTION).doc(`row_${pad(idx)}`), data);
    });
    await batch.commit();
    written += slice.length;
    if (written % 4500 === 0 || written === rows.length) {
      console.log(`  wrote ${written}/${rows.length}`);
    }
  }

  // ── Delete any docs left from a previous, larger run (table shrank) ──
  console.log("Cleaning up stale docs from prior runs...");
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(COLLECTION)
      .where("_syncBatchId", "<", syncBatchId)
      .limit(BATCH_SIZE)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }

  console.log("");
  console.log(
    `Done. Synced ${written} row(s) to "${COLLECTION}" (deleted ${deleted} stale).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("Sync FAILED:", err?.message || err);
  console.error("");
  console.error("Common fixes:");
  console.error("  - Permission denied (BigQuery): account needs BigQuery Data Viewer + Job User on plusco-media-invest-solutions.");
  console.error("  - Permission denied (Firestore): account needs write access to Firestore in pluscoops.");
  console.error("  - 'API not enabled': enable the BigQuery API (source) / Firestore API (destination).");
  console.error("  - 'Dataset not found in location US': dataset is in another region - tell me and I'll set the location.");
  console.error("  - Not logged in: re-run  gcloud auth application-default login");
  process.exit(1);
});
