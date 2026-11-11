// scripts/sync-local-media-mix.mjs
/**
 * Sync:  BigQuery MIR  ->  Firestore "local_media_mix"
 *
 * Feeds Exec KPI Dashboard → Local Media (Adriana's "Local Media" sheet): booked
 * net (NET_ORDERED_CAD) by media channel × PLUSCO_LOCAL_MEDIA (FOREIGN / HYBRID /
 * LOCAL). The app splits the HYBRID dollars into local / foreign with the proxies
 * in config/local_media_proxies (lib/format/local-media.ts).
 *
 * Grain: year × month × agency × client × channel × local-media tag. Channel
 * "N/A" is left out (as in the sheet). Read-only aggregates, no BigQuery object
 * is created.
 *   - NET_ORDERED_CAD       the current MIR (PCC_Dashboard_NATIVE), SOURCE = its tag.
 *   - NET_ORDERED_CAD_PREV  the previous monthly MIR pull of the same year (the
 *                           PCC_Dashboard_RAW_<year>_<MON> table loaded before the
 *                           one PCC_Dashboard_RAW_COMBINED reads), PREV_SOURCE = its
 *                           tag. The page compares the LMI with it.
 *
 * US_FOCUSED marks the clients the sheet excludes ("EXCLUDES US-FOCUSED CLIENTS
 * (BRP, INTACT FINANCIAL (IFC) & MEK US CLIENTS)"): BRP, Intact Financial
 * Insurance Global Brand, and Mekanism clients billed in USD. The rows are kept
 * (flagged) so the page can name the excluded clients.
 *
 * Rows whose client isn't a Forecaster client (MIR agency "#N/A") are kept so the
 * totals match the sheet: `_agency` falls back to the MIR OFFICE, so whoever may
 * read that agency reads them. They carry no `_clientId`.
 *
 * Reconciles like the other syncs: upsert every current row, then delete the
 * docs no current row produces. Brakes: 0 rows → abort; orphans > 40% → abort
 * unless --force.
 *
 *   node scripts/sync-local-media-mix.mjs            write
 *   node scripts/sync-local-media-mix.mjs --dry-run  preview only
 *   node scripts/sync-local-media-mix.mjs --force    bypass the orphan brake
 */

import crypto from "crypto";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { normalizeAgency, countByAgency, logAgencySplit, UNASSIGNED_AGENCY } from "./lib/agency.mjs";
import { fetchClientIdByName, withClientId, logClientIdSplit } from "./lib/client-ids.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const DATASET = "plusco-media-invest-solutions.PCC_Media_Investment";
const NATIVE = `\`${DATASET}.PCC_Dashboard_NATIVE\``;
const LOCATION = "northamerica-northeast1";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "local_media_mix";
const BATCH_SIZE = 450;
const ORPHAN_ABORT_RATIO = 0.4;

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

// US-focused clients, excluded from the Local Media figures (Adriana's note).
const US_FOCUSED_CLIENTS = ["BRP", "Intact Financial Insurance Global Brand"];
const US_FOCUSED_USD_AGENCY = "Mekanism"; // "MEK US clients" = Mekanism clients billed in USD

const US_FOCUSED_SQL = `(PLUSCO_CLIENT_NAME IN UNNEST(@usClients)
      OR (AGENCY = @usAgency AND CLIENT_CURRENCY_MO = 'USD'))`;
const PARAMS = { usClients: US_FOCUSED_CLIENTS, usAgency: US_FOCUSED_USD_AGENCY };

const CURRENT_QUERY = `
  SELECT PLUSCO_YEAR, MONTH, AGENCY, OFFICE, PLUSCO_CLIENT_NAME, PLUSCO_MEDIA_CHANNEL,
    PLUSCO_LOCAL_MEDIA, ${US_FOCUSED_SQL} AS US_FOCUSED,
    ANY_VALUE(SOURCE) AS SOURCE, SUM(NET_ORDERED_CAD) AS NET
  FROM ${NATIVE}
  WHERE PLUSCO_MEDIA_CHANNEL IS NOT NULL AND PLUSCO_MEDIA_CHANNEL != 'N/A'
    AND PLUSCO_LOCAL_MEDIA IN ('FOREIGN', 'HYBRID', 'LOCAL')
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`;

// A monthly RAW table is the MIR workbook as pasted: amounts are text
// ("$1,234.50", "($12.00)") and MONTH reads "Mar/2026".
const previousQuery = (table) => `
  WITH r AS (
    SELECT *,
      SAFE_CAST(REGEXP_REPLACE(REPLACE(REPLACE(NET_ORDERED_CAD, '(', '-'), ')', ''), r'[$,\\s]', '') AS FLOAT64) AS NET_NUM,
      SAFE.PARSE_DATE('%b/%Y', MONTH) AS MONTH_DATE
    FROM \`${DATASET}.${table}\`)
  SELECT PLUSCO_YEAR, FORMAT_DATE('%Y-%m', MONTH_DATE) AS MONTH, AGENCY, OFFICE, PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_CHANNEL, PLUSCO_LOCAL_MEDIA, ${US_FOCUSED_SQL} AS US_FOCUSED,
    ANY_VALUE(SOURCE) AS SOURCE, SUM(NET_NUM) AS NET
  FROM r
  WHERE PLUSCO_MEDIA_CHANNEL IS NOT NULL AND PLUSCO_MEDIA_CHANNEL != 'N/A'
    AND PLUSCO_LOCAL_MEDIA IN ('FOREIGN', 'HYBRID', 'LOCAL')
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`;

const GRAIN = ["PLUSCO_YEAR", "MONTH", "AGENCY", "PLUSCO_CLIENT_NAME", "PLUSCO_MEDIA_CHANNEL", "PLUSCO_LOCAL_MEDIA", "US_FOCUSED"];
const docId = (r) => crypto.createHash("sha256").update(JSON.stringify(GRAIN.map((f) => r[f] ?? null))).digest("hex");

/** Agency the rules scope on: the MIR agency, else the MIR office (non-Forecaster clients). */
function rowAgency(agency, office) {
  const a = normalizeAgency(agency);
  return a === UNASSIGNED_AGENCY ? normalizeAgency(office) : a;
}

/**
 * For each year, the monthly RAW table loaded just before the one the current
 * MIR reads (RAW_COMBINED's sources), by load time. Skips years with none.
 */
async function previousRawTables(bq) {
  const [[view]] = await bq.query({
    query: `SELECT view_definition FROM \`${DATASET}.INFORMATION_SCHEMA.VIEWS\` WHERE table_name = 'PCC_Dashboard_RAW_COMBINED'`,
    location: LOCATION,
  });
  const current = [...view.view_definition.matchAll(/PCC_Dashboard_RAW_(\d{4})_[A-Z0-9_]+/g)].map((m) => ({ name: m[0], year: m[1] }));
  const [tables] = await bq.query({
    query: `SELECT table_name, creation_time FROM \`${DATASET}.INFORMATION_SCHEMA.TABLES\` WHERE REGEXP_CONTAINS(table_name, r'^PCC_Dashboard_RAW_\\d{4}_[A-Z]')`,
    location: LOCATION,
  });
  const created = new Map(tables.map((t) => [t.table_name, new Date(t.creation_time.value ?? t.creation_time).getTime()]));
  const out = [];
  for (const cur of current) {
    const curTime = created.get(cur.name);
    const prev = tables
      .filter((t) => t.table_name.startsWith(`PCC_Dashboard_RAW_${cur.year}_`) && created.get(t.table_name) < curTime)
      .sort((a, b) => created.get(b.table_name) - created.get(a.table_name))[0];
    console.log(`${cur.year}: current ${cur.name} · previous ${prev?.table_name ?? "(none)"}`);
    if (prev) out.push(prev.table_name);
  }
  return out;
}

async function main() {
  console.log(DRY_RUN ? "MODE: dry run (no writes)" : `MODE: write${FORCE ? " [--force]" : ""}`);
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: FIRESTORE_PROJECT });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  const [rows] = await bq.query({ query: CURRENT_QUERY, location: LOCATION, params: PARAMS });
  console.log(`Fetched ${rows.length} row(s) from NATIVE.`);
  if (rows.length === 0) {
    console.error("ABORT: 0 rows from BigQuery; refusing to reconcile against an empty source.");
    process.exit(1);
  }
  const prevRows = [];
  for (const table of await previousRawTables(bq)) {
    const [r] = await bq.query({ query: previousQuery(table), location: LOCATION, params: PARAMS });
    console.log(`Fetched ${r.length} row(s) from ${table}.`);
    prevRows.push(...r);
  }

  const idByName = await fetchClientIdByName(bq);
  const syncedAt = new Date().toISOString();
  const sourceByYear = new Map();
  const prevSourceByYear = new Map();
  const current = new Map();
  const add = (r, field) => {
    const key = {
      PLUSCO_YEAR: String(r.PLUSCO_YEAR ?? ""),
      MONTH: String(r.MONTH ?? ""),
      AGENCY: r.AGENCY ?? null,
      PLUSCO_CLIENT_NAME: r.PLUSCO_CLIENT_NAME ?? null,
      PLUSCO_MEDIA_CHANNEL: r.PLUSCO_MEDIA_CHANNEL,
      PLUSCO_LOCAL_MEDIA: r.PLUSCO_LOCAL_MEDIA,
      US_FOCUSED: r.US_FOCUSED === true,
    };
    const id = docId(key);
    let d = current.get(id);
    if (!d) {
      d = withClientId({ ...key, NET_ORDERED_CAD: 0, NET_ORDERED_CAD_PREV: 0, _agency: rowAgency(key.AGENCY, r.OFFICE), _syncedAt: syncedAt }, idByName);
      current.set(id, d);
    }
    d[field] += Number(r.NET) || 0;
  };
  for (const r of rows) {
    add(r, "NET_ORDERED_CAD");
    if (r.SOURCE) sourceByYear.set(String(r.PLUSCO_YEAR), r.SOURCE);
  }
  for (const r of prevRows) {
    if (!r.MONTH) continue;
    add(r, "NET_ORDERED_CAD_PREV");
    if (r.SOURCE) prevSourceByYear.set(String(r.PLUSCO_YEAR), r.SOURCE);
  }
  for (const d of current.values()) {
    d.SOURCE = sourceByYear.get(d.PLUSCO_YEAR) ?? null;
    d.PREV_SOURCE = prevSourceByYear.get(d.PLUSCO_YEAR) ?? null;
  }

  const all = [...current.values()];
  logAgencySplit(COLLECTION, countByAgency(all, (d) => d._agency));
  logClientIdSplit(COLLECTION, all);
  const us = [...new Set(all.filter((d) => d.US_FOCUSED).map((d) => `${d.PLUSCO_CLIENT_NAME} (${d.PLUSCO_YEAR})`))];
  console.log(`US-focused (excluded on the page): ${us.join(", ")}`);
  for (const [y, s] of sourceByYear) {
    const sum = (f) => Math.round(all.filter((d) => d.PLUSCO_YEAR === y && !d.US_FOCUSED).reduce((t, d) => t + d[f], 0));
    console.log(`${y}: ${s} $${sum("NET_ORDERED_CAD").toLocaleString()} · ${prevSourceByYear.get(y) ?? "no previous"} $${sum("NET_ORDERED_CAD_PREV").toLocaleString()} (US-focused excluded)`);
  }

  const existing = (await db.collection(COLLECTION).select().get()).docs.map((d) => d.id);
  const orphans = existing.filter((id) => !current.has(id));
  console.log(`upsert ${current.size} · delete ${orphans.length} orphan(s) · was ${existing.length}`);
  const ratioExceeded = existing.length > 0 && orphans.length / existing.length > ORPHAN_ABORT_RATIO;
  if (DRY_RUN) {
    if (ratioExceeded) console.warn("NOTE: orphan share above 40%; write mode would abort without --force.");
    console.log("Dry run complete. Nothing was written.");
    process.exit(0);
  }
  if (ratioExceeded && !FORCE) {
    console.error("ABORT: orphans exceed 40% of the collection. Review with --dry-run, then --force if expected.");
    process.exit(1);
  }

  const entries = [...current.entries()];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const [id, data] of entries.slice(i, i + BATCH_SIZE)) batch.set(db.collection(COLLECTION).doc(id), data);
    await batch.commit();
  }
  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of orphans.slice(i, i + BATCH_SIZE)) batch.delete(db.collection(COLLECTION).doc(id));
    await batch.commit();
  }
  console.log(`Done. "${COLLECTION}" now holds ${current.size} docs.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync FAILED:", err?.message || err);
  console.error("Check BigQuery access on plusco-media-invest-solutions (and Drive access for the monthly RAW sheets), Firestore write on pluscoops, and ADC login.");
  process.exit(1);
});
