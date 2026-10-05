// filepath: scripts/qa-fingerprint.mjs
/**
 * QA fingerprint:  BigQuery  ->  Firestore dashboard_meta/qa_fingerprint
 *
 * The app can't read BigQuery, so the QA page's "Data Health" checks compare
 * what the dashboard shows (Firestore) against this fingerprint of the BigQuery
 * tables, captured whenever the syncs run. Read-only on BigQuery; one small
 * Firestore write.
 *
 * What it records:
 *   - tables: last rebuild time + row count of NATIVE and every table built from
 *     it (catches a table left on an older MIR — e.g. the mix tables still on
 *     Sep 29 after NATIVE was rebuilt Oct 2);
 *   - kpi / mix / social / metaSocial: row counts and the $ totals the
 *     dashboard's headline numbers are built from, using the same row filters
 *     as the syncs (e.g. KPI rows need a real client id).
 *
 * Runs automatically at the end of sync-all (non-fatal), or on its own:
 *   node scripts/qa-fingerprint.mjs
 *
 * Needs the same access as the syncs: BigQuery Data Viewer + Job User on
 * plusco-media-invest-solutions, Firestore write on pluscoops, and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const DATASET = `${BQ_PROJECT}.PCC_Media_Investment`;
const FIRESTORE_PROJECT = "pluscoops";
const META_COLLECTION = "dashboard_meta";
const META_DOC = "qa_fingerprint";

/** NATIVE + every table the dashboard reads that is built from it. */
const TABLES = [
  "PCC_Dashboard_NATIVE",
  "KPI_BY_CLIENT_2025_vs_2026",
  "MEDIAOCEAN_INVESTMENT_MIX",
  "SOCIAL_PARTNER_MIX_2025_vs_2026",
  "CHANNEL_MIX_2025_vs_2026",
  "META_SOCIAL_OUTPUT_2025_vs_2026",
];

// Mirrors keyDocId in scripts/lib/reconcile.mjs: rows the sync skips.
const VALID_CLIENT_ID = (col) =>
  `${col} IS NOT NULL AND TRIM(CAST(${col} AS STRING)) NOT IN ('', 'NULL', '#N/A')`;

/** BigQuery scalar (number | bigint | numeric string | { value }) -> number. */
function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && v.value !== undefined) return Number(v.value) || 0;
  return Number(v) || 0;
}
const round2 = (n) => Math.round(n * 100) / 100;

async function query(bq, sql) {
  const [rows] = await bq.query({ query: sql, location: "northamerica-northeast1" });
  return rows;
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  console.log("QA fingerprint: reading BigQuery ...");

  // 1. Rebuild time + row count per table.
  const tableRows = await query(
    bq,
    `SELECT table_id, last_modified_time, row_count
       FROM \`${DATASET}.__TABLES__\`
      WHERE table_id IN (${TABLES.map((t) => `'${t}'`).join(", ")})`
  );
  const tables = {};
  for (const r of tableRows) {
    tables[r.table_id] = {
      lastModified: new Date(toNum(r.last_modified_time)).toISOString(),
      rowCount: toNum(r.row_count),
    };
  }

  // 2. KPI_BY_CLIENT (-> mo_kpi_by_client): one doc per client id.
  const [kpi] = await query(
    bq,
    `SELECT COUNT(*) AS rows_,
            SUM(labs_spend_2026) AS labs_spend_2026,
            SUM(total_spend_2026) AS total_spend_2026,
            SUM(labs_booked_mir_2026) AS labs_booked_mir_2026
       FROM \`${DATASET}.KPI_BY_CLIENT_2025_vs_2026\`
      WHERE ${VALID_CLIENT_ID("PLUSCO_CLIENT_ID")}`
  );
  const partnerRows = await query(
    bq,
    `SELECT JSON_VALUE(x, '$.p') AS partner, SUM(CAST(JSON_VALUE(x, '$.v') AS FLOAT64)) AS net
       FROM \`${DATASET}.KPI_BY_CLIENT_2025_vs_2026\`,
            UNNEST(JSON_QUERY_ARRAY(labs_by_partner_2026)) x
      WHERE ${VALID_CLIENT_ID("PLUSCO_CLIENT_ID")}
      GROUP BY 1 ORDER BY 1`
  );

  // 3. MEDIAOCEAN_INVESTMENT_MIX (-> mediaocean_investment_mix): $ by year.
  const mixRows = await query(
    bq,
    `SELECT CAST(PLUSCO_YEAR AS STRING) AS year, COUNT(*) AS rows_, SUM(NET_ORDERED_CAD) AS net
       FROM \`${DATASET}.MEDIAOCEAN_INVESTMENT_MIX\` GROUP BY 1 ORDER BY 1`
  );

  // 4. SOCIAL_PARTNER_MIX (-> social_partner_mix): spend totals.
  const [social] = await query(
    bq,
    `SELECT COUNT(*) AS rows_, SUM(spend_2025) AS spend_2025, SUM(spend_2026) AS spend_2026
       FROM \`${DATASET}.SOCIAL_PARTNER_MIX_2025_vs_2026\``
  );

  // 5. META_SOCIAL_OUTPUT (-> meta_social_output): distinct client ids.
  const [metaSocial] = await query(
    bq,
    `SELECT COUNT(DISTINCT PLUSCO_CLIENT_ID) AS clients
       FROM \`${DATASET}.META_SOCIAL_OUTPUT_2025_vs_2026\`
      WHERE ${VALID_CLIENT_ID("PLUSCO_CLIENT_ID")}`
  );

  const fingerprint = {
    generatedAt: new Date().toISOString(),
    tables,
    kpi: {
      rows: toNum(kpi.rows_),
      labsSpend2026: round2(toNum(kpi.labs_spend_2026)),
      totalSpend2026: round2(toNum(kpi.total_spend_2026)),
      labsBookedMir2026: round2(toNum(kpi.labs_booked_mir_2026)),
      labsByPartner: partnerRows.map((r) => ({ partner: r.partner, net: round2(toNum(r.net)) })),
    },
    mix: {
      byYear: mixRows.map((r) => ({ year: r.year, rows: toNum(r.rows_), net: round2(toNum(r.net)) })),
    },
    social: {
      rows: toNum(social.rows_),
      spend2025: round2(toNum(social.spend_2025)),
      spend2026: round2(toNum(social.spend_2026)),
    },
    metaSocial: { clients: toNum(metaSocial.clients) },
  };

  await db.collection(META_COLLECTION).doc(META_DOC).set(fingerprint);

  console.log(`QA fingerprint written to ${META_COLLECTION}/${META_DOC}:`);
  for (const [t, v] of Object.entries(tables)) {
    console.log(`  ${t.padEnd(34)} rebuilt ${v.lastModified}  rows ${v.rowCount}`);
  }
  console.log(
    `  KPI: ${fingerprint.kpi.rows} clients · Labs $${fingerprint.kpi.labsSpend2026.toLocaleString("en-CA")} · Total $${fingerprint.kpi.totalSpend2026.toLocaleString("en-CA")}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("QA fingerprint FAILED:", err?.message || err);
  process.exit(1);
});
