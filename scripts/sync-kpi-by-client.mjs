// filepath: scripts/sync-kpi-by-client.mjs
/**
 * Sync:  BigQuery KPI_BY_CLIENT_2025_vs_2026  ->  Firestore "mo_kpi_by_client"
 *
 * Now RECONCILING via scripts/lib/reconcile.mjs: one doc per client, keyed by
 * PLUSCO_CLIENT_ID. After writing every current client it deletes any Firestore
 * doc whose client id is no longer in the source, so the collection always mirrors
 * the backend. Replaces the earlier upsert-only version, which left a doc behind
 * whenever a client dropped out of the KPI table.
 *
 * Rows with a blank / "NULL" / "#N/A" client id are skipped, exactly as before
 * (keyDocId returns null -> the engine skips the row).
 *
 * WRITES BY DEFAULT (a monthly sync should just run):
 *   node scripts/sync-kpi-by-client.mjs             upsert + delete orphans
 *   node scripts/sync-kpi-by-client.mjs --dry-run   preview only, writes nothing
 *   node scripts/sync-kpi-by-client.mjs --force     bypass the orphan safety brake
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
} from "./lib/reconcile.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.KPI_BY_CLIENT_2025_vs_2026`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "mo_kpi_by_client";
const ID_FIELD = "PLUSCO_CLIENT_ID";

// Columns shown in the orphan-preview sample (cosmetic only).
const SAMPLE_FIELDS = [
  { field: "PLUSCO_CLIENT_ID", label: "CLIENT_ID", width: 12 },
  { field: "CLIENT_NAME", label: "CLIENT", width: 30 },
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
    toDocId: (row) => keyDocId(row[ID_FIELD]),
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
