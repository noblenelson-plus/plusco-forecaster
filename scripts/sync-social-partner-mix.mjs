// filepath: scripts/sync-social-partner-mix.mjs
/**
 * Sync:  BigQuery SOCIAL_PARTNER_MIX_2025_vs_2026  ->  Firestore "social_partner_mix"
 *
 * Now RECONCILING via scripts/lib/reconcile.mjs: after writing every current row
 * it deletes any Firestore doc no current row produces, so the collection always
 * mirrors the backend -- updates, additions AND deletions all flow through. This
 * replaces the earlier upsert-only version, which left orphaned docs whenever a
 * row's grain changed or a row was removed in the backend.
 *
 * WRITES BY DEFAULT (a monthly sync should just run):
 *   node scripts/sync-social-partner-mix.mjs             upsert + delete orphans
 *   node scripts/sync-social-partner-mix.mjs --dry-run   preview only, writes nothing
 *   node scripts/sync-social-partner-mix.mjs --force     bypass the orphan safety brake
 *
 * Metric-columns note (unchanged): spend_2025 / spend_2026 are MONTHLY and
 * summable; variance_cad, share_2025, share_2026, variance_ppt and target_* are
 * annual values repeated across each month row (some null). They are copied as-is;
 * the app hook recomputes variance/share from the summable spends, so do not sum
 * the annual columns.
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
  grainDocId,
} from "./lib/reconcile.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.SOCIAL_PARTNER_MIX_2025_vs_2026`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "social_partner_mix";

// The 7 grain columns that make a row unique, in a fixed order. This order
// defines the doc-id hash, so it MUST match the order the sync has always used
// (it does), or ids stop lining up with what is already stored.
const GRAIN_FIELDS = [
  "AGENCY",
  "BU_REGION",
  "BUSINESS_LEAD",
  "GM_POD",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_MEDIA_PARTNER",
  "MONTH",
];

// Columns shown in the orphan-preview sample (cosmetic only).
const SAMPLE_FIELDS = [
  { field: "PLUSCO_MEDIA_PARTNER", label: "PARTNER", width: 18 },
  { field: "PLUSCO_CLIENT_NAME", label: "CLIENT", width: 20 },
  { field: "MONTH", label: "MONTH", width: 7 },
  { field: "spend_2026", label: "SPEND_2026", money: true },
];

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

  const { dryRun, force } = reconcileFlags();
  const res = await reconcileCollection({
    db,
    collection: COLLECTION,
    rows,
    toDocId: (row) => grainDocId(row, GRAIN_FIELDS),
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
