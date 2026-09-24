// filepath: scripts/sync-mir-raw.mjs
/**
 * Sync:  BigQuery PCC_Dashboard_NATIVE  ->  Storage "reports/mir/{agency}/..."
 * Publishes the raw MIR table (PCC_Dashboard_NATIVE, ~135k rows) as one
 * compressed snapshot per agency, split on AGENCY, for the Reports tab's
 * "Mediaocean Data (MIR)" page — see scripts/lib/report-snapshot.mjs.
 *
 * This used to also mirror every row into the Firestore collection "mir_raw"
 * (~135k document writes, most of the monthly sync's run time). Nothing in the
 * app reads that collection any more, so the mirror was dropped. The old
 * collection can be removed with scripts/drop-raw-mirrors.mjs.
 *
 * Run from repo root, AFTER the monthly NATIVE rebuild:
 *   node scripts/sync-mir-raw.mjs
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { publishReportSnapshots } from "./lib/report-snapshot.mjs";
import { normalizeAgency } from "./lib/agency.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
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
    table: "mir",
    rawRows: rows,
    agencyOf: (r) => normalizeAgency(r.AGENCY),
  });

  console.log("");
  console.log(`Done. Published ${rows.length} MIR row(s) as per-agency snapshots.`);
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
