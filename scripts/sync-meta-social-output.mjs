// filepath: scripts/sync-meta-social-output.mjs
/**
 * One-off sync:  BigQuery META_SOCIAL_OUTPUT_2025_vs_2026  ->  Firestore "meta_social_output"
 *
 * The BQ table is MONTHLY grain (one row per client x month). This script
 * AGGREGATES to one document per client (keyed by PLUSCO_CLIENT_ID):
 *   - dollar columns (SUM_FIELDS) are summed across the client's months -> annual total
 *   - every other column (dims, flags, pre-computed annual ratios) is taken from the
 *     client's first row, since those are computed on annual totals in BQ and are
 *     therefore identical on every month-row for a given client.
 * Per-month identifiers (SKIP_FIELDS) are dropped. Does NOT touch existing app data.
 *
 * Run from repo root:  node scripts/sync-meta-social-output.mjs
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.META_SOCIAL_OUTPUT_2025_vs_2026`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "meta_social_output";
const ID_FIELD = "PLUSCO_CLIENT_ID";
const BATCH_SIZE = 450;

// Monthly dollar columns -> summed to an annual per-client total.
const SUM_FIELDS = [
  "meta_2026",
  "social_2026",
  "meta_2025",
  "social_2025",
  "other_platforms_spend_2026",
  "other_platforms_spend_2025",
  "miq_social_mir_2026",
  "social_forecast_rfq1",
  "miq_social_forecast_rfq1",
  "target_meta_spend_2026",
  "target_meta_spend_2026_v2",
  "total_labs_forecast",
  "total_labs_booked",
];

// Per-month identifiers that are meaningless once collapsed to a client.
const SKIP_FIELDS = [
  "PLUSCO_YEAR",
  "MONTH",
  "MONTH_DATE",
  "month_label",
  "miq_social_pacing", // monthly ratio; the app recomputes from summed totals
];

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

function toNum(v) {
  const c = cleanValue(v);
  const n = typeof c === "number" ? c : Number(c);
  return Number.isFinite(n) ? n : 0;
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
  console.log(`Fetched ${rows.length} monthly row(s) from BigQuery.`);

  if (rows.length === 0) {
    console.warn("No rows returned - nothing to write. Exiting.");
    process.exit(0);
  }

  const columnCount = Object.keys(rows[0]).length;
  console.log(`Each row has ${columnCount} columns (monthly grain).`);

  const syncedAt = new Date().toISOString();
  const byId = new Map();
  const skipped = [];

  for (const row of rows) {
    const id = toDocId(row[ID_FIELD]);
    if (!id) {
      skipped.push(row[ID_FIELD]);
      continue;
    }

    let agg = byId.get(id);
    if (!agg) {
      // First month-row for this client: seed dims / flags / annual ratios,
      // and initialise the summable dollar columns.
      agg = {};
      for (const [key, value] of Object.entries(row)) {
        if (SKIP_FIELDS.includes(key)) continue;
        agg[key] = SUM_FIELDS.includes(key) ? toNum(value) : cleanValue(value);
      }
      byId.set(id, agg);
    } else {
      // Subsequent months: accumulate only the dollar columns.
      for (const f of SUM_FIELDS) agg[f] = (agg[f] ?? 0) + toNum(row[f]);
    }
  }

  const docs = [...byId.entries()].map(([id, data]) => {
    data._syncedAt = syncedAt;
    return { id, data };
  });
  console.log(`Aggregated to ${docs.length} client document(s).`);
  if (skipped.length > 0) {
    console.warn(`Note: skipped ${skipped.length} row(s) with an unusable client id.`);
  }
  console.log(`Sample first client: ${docs[0]?.data?.PLUSCO_CLIENT_NAME ?? "(no name)"}`);

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
