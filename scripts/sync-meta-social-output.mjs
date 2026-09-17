// filepath: scripts/sync-meta-social-output.mjs
/**
 * Sync:  BigQuery META_SOCIAL_OUTPUT_2025_vs_2026  ->  Firestore "meta_social_output"
 *
 * The BQ table is MONTHLY grain (one row per client x month). This sync AGGREGATES
 * to one document per client (keyed by PLUSCO_CLIENT_ID):
 *   - dollar columns (SUM_FIELDS) are summed across the client's months
 *   - every other column is taken from the client's first row (dims / flags /
 *     pre-computed annual ratios are identical on every month-row for a client)
 *   - per-month identifiers (SKIP_FIELDS) are dropped
 * That aggregation is unchanged from the original sync.
 *
 * What changed: it now RECONCILES via scripts/lib/reconcile.mjs. After writing every
 * current client it deletes any Firestore doc whose client id is no longer in the
 * source, so the collection always mirrors the backend. The earlier upsert-only
 * version left a doc behind when a client dropped out of the table.
 *
 * The aggregation runs first (it needs the raw monthly rows); the resulting
 * per-client rows are handed to the engine with their exact original doc ids, so
 * ids line up perfectly with what is already stored.
 *
 * WRITES BY DEFAULT (a monthly sync should just run):
 *   node scripts/sync-meta-social-output.mjs             upsert + delete orphans
 *   node scripts/sync-meta-social-output.mjs --dry-run   preview only, writes nothing
 *   node scripts/sync-meta-social-output.mjs --force     bypass the orphan safety brake
 *
 * Needs: BigQuery Data Viewer + Job User on plusco-media-invest-solutions,
 * read+write to Firestore in pluscoops, and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import {
  reconcileCollection,
  reconcileFlags,
  keyDocId,
  cleanValue,
} from "./lib/reconcile.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.META_SOCIAL_OUTPUT_2025_vs_2026`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "meta_social_output";
const ID_FIELD = "PLUSCO_CLIENT_ID";

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

// Columns shown in the orphan-preview sample (cosmetic only).
const SAMPLE_FIELDS = [
  { field: "PLUSCO_CLIENT_ID", label: "CLIENT_ID", width: 12 },
  { field: "PLUSCO_CLIENT_NAME", label: "CLIENT", width: 28 },
  { field: "meta_2026", label: "META_2026", money: true },
];

// cleanValue -> finite number (missing/null/NaN -> 0). Uses the shared cleanValue
// so coercion is identical to every other sync.
function toNum(v) {
  const c = cleanValue(v);
  const n = typeof c === "number" ? c : Number(c);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Collapse monthly rows to one row per client, exactly as the original sync did.
 * Returns the per-client rows, a row->id map carrying each row's ORIGINAL doc id
 * (computed from the raw client id, before cleanValue, so it matches stored ids),
 * and the count of rows skipped for an unusable client id.
 */
function aggregateByClient(rows) {
  const byId = new Map();
  const idByRow = new Map();
  let skipped = 0;

  for (const row of rows) {
    const id = keyDocId(row[ID_FIELD]);
    if (!id) {
      skipped += 1;
      continue;
    }
    let agg = byId.get(id);
    if (!agg) {
      // First month-row for this client: seed dims / flags / annual ratios and
      // initialise the summable dollar columns.
      agg = {};
      for (const [key, value] of Object.entries(row)) {
        if (SKIP_FIELDS.includes(key)) continue;
        agg[key] = SUM_FIELDS.includes(key) ? toNum(value) : cleanValue(value);
      }
      byId.set(id, agg);
      idByRow.set(agg, id);
    } else {
      // Subsequent months: accumulate only the dollar columns.
      for (const f of SUM_FIELDS) agg[f] = (agg[f] ?? 0) + toNum(row[f]);
    }
  }

  return { clientRows: [...byId.values()], idByRow, skipped };
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

  const { clientRows, idByRow, skipped } = aggregateByClient(rows);
  console.log(`Aggregated to ${clientRows.length} client document(s).`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} monthly row(s) with an unusable client id.`);
  }

  const { dryRun, force } = reconcileFlags();
  const res = await reconcileCollection({
    db,
    collection: COLLECTION,
    rows: clientRows,
    // Use each client's ORIGINAL doc id (raw-id based), not one re-derived from the
    // cleaned field -- guarantees ids match what is already stored.
    toDocId: (r) => idByRow.get(r) ?? null,
    sampleFields: SAMPLE_FIELDS,
    dryRun,
    force,
  });

  process.exit(res.status === "aborted" ? 1 : 0);
}

main().catch((err) => {
  console.error("");
  console.error("Sync FAILED:", err?.message || err);
  console.error("");
  console.error("Common fixes:");
  console.error("  - Permission denied (BigQuery): account needs BigQuery Data Viewer + Job User on plusco-media-invest-solutions.");
  console.error("  - Permission denied (Firestore): account needs read+write access to Firestore in pluscoops.");
  console.error("  - 'Dataset not found in location US': dataset is in another region - tell me and I'll set the location.");
  console.error("  - Not logged in: re-run  gcloud auth application-default login");
  process.exit(1);
});
