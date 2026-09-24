// filepath: scripts/sync-billing-summary-raw.mjs
/**
 * Sync:  BigQuery Billing_summary_master  ->  Storage "reports/billing/{agency}/..."
 * Publishes the Billing Summary table (~36k rows) as one compressed snapshot
 * per agency for the Reports tab's "Mediaocean Billing Summary" page — see
 * scripts/lib/report-snapshot.mjs. Split on PLUSCO_AGENCY (the client's
 * agency), not AGENCY, which here is the buying entity (e.g. "JUNGLE MEDIA
 * CANADA" also buys for Mekanism clients).
 *
 * This used to also mirror every row into the Firestore collection
 * "billing_summary_raw". Nothing in the app reads that collection any more, so
 * the mirror was dropped. The old collection can be removed with
 * scripts/drop-raw-mirrors.mjs.
 *
 * Run from repo root, AFTER the Billing_summary_master rebuild:
 *   node scripts/sync-billing-summary-raw.mjs
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { publishReportSnapshots } from "./lib/report-snapshot.mjs";
import { normalizeAgency } from "./lib/agency.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.Billing_summary_master`";
const FIREBASE_PROJECT = "pluscoops";

async function main() {
  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIREBASE_PROJECT,
  });
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  console.log(`Querying ${BQ_TABLE} ...`);
  const [rows] = await bq.query({ query: `SELECT * FROM ${BQ_TABLE}` });
  console.log(`Fetched ${rows.length} row(s) from BigQuery.`);

  // Never publish an empty snapshot over last month's good one.
  if (rows.length === 0) {
    console.error("ABORT: BigQuery returned 0 rows - nothing published. Check the table.");
    process.exit(1);
  }
  console.log(`Each row has ${Object.keys(rows[0]).length} columns.`);

  console.log("Publishing per-agency report snapshots to Storage...");
  await publishReportSnapshots({
    app,
    table: "billing",
    rawRows: rows,
    agencyOf: (r) => normalizeAgency(r.PLUSCO_AGENCY),
  });

  console.log("");
  console.log(`Done. Published ${rows.length} Billing Summary row(s) as per-agency snapshots.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("Sync FAILED:", err?.message || err);
  console.error("");
  console.error("Common fixes:");
  console.error("  - Permission denied (BigQuery): account needs BigQuery Data Viewer + Job User on plusco-media-invest-solutions.");
  console.error("  - Permission denied (Storage): account needs write access to Cloud Storage in pluscoops.");
  console.error("  - 'Dataset not found in location US': dataset is in another region - tell me and I'll set the location.");
  console.error("  - Not logged in: re-run  gcloud auth application-default login");
  process.exit(1);
});
