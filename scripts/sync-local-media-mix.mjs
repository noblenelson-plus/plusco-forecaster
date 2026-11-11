// scripts/sync-local-media-mix.mjs
/**
 * Sync:  BigQuery PCC_Dashboard_NATIVE (MIR)  ->  Firestore "local_media_mix"
 *
 * Feeds Exec KPI Dashboard → Local Media (Adriana's "Local Media" sheet): booked
 * net (NET_ORDERED_CAD) by media channel × PLUSCO_LOCAL_MEDIA (FOREIGN / HYBRID /
 * LOCAL). The app splits the HYBRID dollars into local / foreign with the proxies
 * in config/local_media_proxies (lib/format/local-media.ts).
 *
 * Grain: year × month × agency × client × channel × local-media tag. Channel
 * "N/A" is left out (as in the sheet). Read-only aggregate over NATIVE, no
 * BigQuery object is created.
 *
 * US_FOCUSED marks the clients the sheet excludes ("EXCLUDES US-FOCUSED CLIENTS
 * (BRP, INTACT FINANCIAL (IFC) & MEK US CLIENTS)"): BRP, Intact Financial
 * Insurance Global Brand, and Mekanism clients billed in USD. The rows are kept
 * (flagged) so the page can name the excluded clients.
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
import { normalizeAgency, countByAgency, logAgencySplit } from "./lib/agency.mjs";
import { fetchClientIdByName, withClientId, logClientIdSplit } from "./lib/client-ids.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const NATIVE = "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "local_media_mix";
const BATCH_SIZE = 450;
const ORPHAN_ABORT_RATIO = 0.4;

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

// US-focused clients, excluded from the Local Media figures (Adriana's note).
const US_FOCUSED_CLIENTS = ["BRP", "Intact Financial Insurance Global Brand"];
const US_FOCUSED_USD_AGENCY = "Mekanism"; // "MEK US clients" = Mekanism clients billed in USD

const QUERY = `
  SELECT
    PLUSCO_YEAR,
    MONTH,
    AGENCY,
    PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_CHANNEL,
    PLUSCO_LOCAL_MEDIA,
    (PLUSCO_CLIENT_NAME IN UNNEST(@usClients)
      OR (AGENCY = @usAgency AND CLIENT_CURRENCY_MO = 'USD')) AS US_FOCUSED,
    ANY_VALUE(SOURCE) AS SOURCE,
    SUM(NET_ORDERED_CAD) AS NET_ORDERED_CAD
  FROM ${NATIVE}
  WHERE PLUSCO_MEDIA_CHANNEL IS NOT NULL AND PLUSCO_MEDIA_CHANNEL != 'N/A'
    AND PLUSCO_LOCAL_MEDIA IN ('FOREIGN', 'HYBRID', 'LOCAL')
  GROUP BY 1, 2, 3, 4, 5, 6, 7`;

const GRAIN = ["PLUSCO_YEAR", "MONTH", "AGENCY", "PLUSCO_CLIENT_NAME", "PLUSCO_MEDIA_CHANNEL", "PLUSCO_LOCAL_MEDIA", "US_FOCUSED"];
const docId = (r) => crypto.createHash("sha256").update(JSON.stringify(GRAIN.map((f) => r[f] ?? null))).digest("hex");

async function main() {
  console.log(DRY_RUN ? "MODE: dry run (no writes)" : `MODE: write${FORCE ? " [--force]" : ""}`);
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: FIRESTORE_PROJECT });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  const [rows] = await bq.query({
    query: QUERY,
    location: "northamerica-northeast1",
    params: { usClients: US_FOCUSED_CLIENTS, usAgency: US_FOCUSED_USD_AGENCY },
  });
  console.log(`Fetched ${rows.length} row(s) from NATIVE.`);
  if (rows.length === 0) {
    console.error("ABORT: 0 rows from BigQuery; refusing to reconcile against an empty source.");
    process.exit(1);
  }

  const idByName = await fetchClientIdByName(bq);
  const syncedAt = new Date().toISOString();
  const current = new Map();
  for (const r of rows) {
    const data = {
      PLUSCO_YEAR: String(r.PLUSCO_YEAR ?? ""),
      MONTH: String(r.MONTH ?? ""),
      AGENCY: r.AGENCY ?? null,
      PLUSCO_CLIENT_NAME: r.PLUSCO_CLIENT_NAME ?? null,
      PLUSCO_MEDIA_CHANNEL: r.PLUSCO_MEDIA_CHANNEL,
      PLUSCO_LOCAL_MEDIA: r.PLUSCO_LOCAL_MEDIA,
      US_FOCUSED: r.US_FOCUSED === true,
      SOURCE: r.SOURCE ?? null,
      NET_ORDERED_CAD: Number(r.NET_ORDERED_CAD) || 0,
      _syncedAt: syncedAt,
    };
    data._agency = normalizeAgency(data.AGENCY);
    current.set(docId(data), withClientId(data, idByName));
  }
  const all = [...current.values()];
  logAgencySplit(COLLECTION, countByAgency(all, (d) => d._agency));
  logClientIdSplit(COLLECTION, all);
  const us = [...new Set(all.filter((d) => d.US_FOCUSED).map((d) => `${d.PLUSCO_CLIENT_NAME} (${d.PLUSCO_YEAR})`))];
  console.log(`US-focused (excluded on the page): ${us.join(", ")}`);

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
  console.error("Check BigQuery access on plusco-media-invest-solutions, Firestore write on pluscoops, and ADC login.");
  process.exit(1);
});
