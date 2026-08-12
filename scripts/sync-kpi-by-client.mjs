// filepath: scripts/sync-kpi-by-client.mjs
/**
 * One-off sync:  BigQuery KPI_BY_CLIENT_2025_vs_2026  ->  Firestore "mo_kpi_by_client"
 * Reads Tristan's per-client KPI table (read-only) and copies every row into a new,
 * dashboard-only Firestore collection in the pluscoops project. One document per
 * client, keyed by PLUSCO_CLIENT_ID. Does NOT touch existing app code or data.
 *
 * Run from repo root:  node scripts/sync-kpi-by-client.mjs
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.KPI_BY_CLIENT_2025_vs_2026`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "mo_kpi_by_client";
const ID_FIELD = "PLUSCO_CLIENT_ID";
const BATCH_SIZE = 450;

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

function toDocId(raw) {
  if (raw === undefined || raw === null) return null;
  let id = String(raw).trim();
  if (id === "" || id.toUpperCase() === "NULL" || id === "#N/A") return null;
  id = id.replace(/\//g, "_");
  if (id === "." || id === "..") id = `_${id}_`;
  if (id.length > 1400) id = id.slice(0, 1400);
  return id;
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
  console.log(`Sample first client: ${rows[0].CLIENT_NAME ?? "(no CLIENT_NAME)"}`);

  const syncedAt = new Date().toISOString();
  const byId = new Map();
  const skipped = [];
  let duplicates = 0;

  for (const row of rows) {
    const id = toDocId(row[ID_FIELD]);
    if (!id) {
      skipped.push(row[ID_FIELD]);
      continue;
    }
    if (byId.has(id)) duplicates += 1;

    const data = {};
    for (const [key, value] of Object.entries(row)) {
      data[key] = cleanValue(value);
    }
    data._syncedAt = syncedAt;
    byId.set(id, data);
  }

  const docs = [...byId.entries()].map(([id, data]) => ({ id, data }));
  console.log(`Prepared ${docs.length} document(s) to write.`);
  if (duplicates > 0) {
    console.warn(`Note: ${duplicates} duplicate client id(s) collapsed (last one kept).`);
  }
  if (skipped.length > 0) {
    console.warn(`Note: skipped ${skipped.length} row(s) with an unusable client id.`);
  }

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, data } of slice) {
      batch.set(db.collection(COLLECTION).doc(id), data);
    }
    await batch.commit();
    written += slice.length;
    console.log(`  wrote ${written}/${docs.length}`);
  }

  console.log("");
  console.log(`Done. Synced ${written} client row(s) to Firestore collection "${COLLECTION}".`);
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
