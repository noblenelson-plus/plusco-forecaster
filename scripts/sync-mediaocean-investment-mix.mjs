// filepath: scripts/sync-mediaocean-investment-mix.mjs
/**
 * Sync:  BigQuery MEDIAOCEAN_INVESTMENT_MIX  ->  Firestore "mediaocean_investment_mix"
 * Reads the aggregate build (read-only) and copies every grain row into a new,
 * dashboard-only Firestore collection in the pluscoops project. One document per
 * grain row. Sibling of sync-kpi-by-client.mjs; does NOT touch existing app code
 * or data.
 *
 * Unlike the KPI sync (one row per client, keyed by PLUSCO_CLIENT_ID), this table
 * has NO single-column key -- a row is unique only across the 11 grain columns.
 * So the doc id is a stable hash of those 11 values joined together. That keeps
 * re-runs idempotent: the same grain row always maps to the same doc id and
 * overwrites in place, so running this monthly never creates duplicates.
 *
 * Run from repo root:  node scripts/sync-mediaocean-investment-mix.mjs
 */

import crypto from "crypto";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.MEDIAOCEAN_INVESTMENT_MIX`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "mediaocean_investment_mix";
const BATCH_SIZE = 450;

// The 11 grain columns, in a fixed order. This order defines the doc-id hash,
// so do NOT reorder without accepting that every doc id will change (a re-sync
// would then write a fresh set of docs rather than overwrite in place).
const GRAIN_FIELDS = [
  "PLUSCO_YEAR",
  "MONTH",
  "AGENCY",
  "BU_REGION",
  "BUSINESS_LEAD",
  "GM_POD",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_PROGRAMMATIC",
  "PLUSCO_2026_DEALS",
];

// Verbatim from sync-kpi-by-client.mjs so values normalize identically:
// numbers/strings/booleans pass through, bigint -> Number, BigQuery wrapper
// objects ({ value }) unwrap (numeric strings coerced to numbers), else null.
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

// Deterministic doc id from the 11 grain values. cleanValue first so the hash
// input matches what actually gets stored; JSON.stringify keeps null distinct
// from "" and is unambiguous regardless of the characters in names.
function toDocId(row) {
  const parts = GRAIN_FIELDS.map((f) => cleanValue(row[f]));
  const canonical = JSON.stringify(parts);
  return crypto.createHash("sha256").update(canonical).digest("hex");
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
  console.log(
    `Sample first partner: ${rows[0].PLUSCO_MEDIA_PARTNER ?? "(no PLUSCO_MEDIA_PARTNER)"}`
  );

  const syncedAt = new Date().toISOString();
  const byId = new Map();
  let duplicates = 0;

  for (const row of rows) {
    const id = toDocId(row);
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
    // With a correct grain this should be 0. Anything >0 means two source rows
    // share all 11 grain values, which would indicate the aggregate did not
    // group as expected -- worth investigating rather than ignoring.
    console.warn(
      `Note: ${duplicates} row(s) shared a grain hash and were collapsed (last kept). ` +
        `Expected 0 for this table -- investigate the aggregate build if nonzero.`
    );
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
  console.log(
    `Done. Synced ${written} grain row(s) to Firestore collection "${COLLECTION}".`
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
