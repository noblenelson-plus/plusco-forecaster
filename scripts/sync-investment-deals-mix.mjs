// scripts/sync-investment-deals-mix.mjs
/**
 * Sync:  BigQuery MIR (PCC_Dashboard_NATIVE)  ->  Firestore "investment_deals_mix"
 *
 * Feeds the Investments Team pages of the Exec KPI Dashboard (the former Looker
 * "MEDIAOCEAN MIR DASHBOARD_TOTAL PLUSCO" pages):
 *   - Media YOY  : booked net by channel / partner / client, this year vs last.
 *   - PCC Deals  : Labs and Volume deals by PLUSCO_DEALS_Type → _Category →
 *                  _Channel → partner (and by media channel).
 *   - Broadcast  : TV / Radio partners, clients by vendor market + language, and
 *                  Volume deals by quarter.
 *
 * Grain: year × month × agency × office × client × channel × partner ×
 * programmatic × 2026 deal × deal type / category / channel × vendor market ×
 * vendor language. Booked net = NET_ORDERED_CAD. Channel "N/A" is left out, as
 * in Looker and MEDIAOCEAN_INVESTMENT_MIX (it carries no deals). Read-only
 * aggregate: no BigQuery object is created.
 *
 * Rows whose client isn't a Forecaster client (MIR agency "#N/A") are kept so the
 * totals match Looker: `_agency` falls back to the MIR OFFICE (same as
 * local_media_mix). They carry no `_clientId`.
 *
 * Reconciles like the other syncs: upsert every current row, then delete the
 * docs no current row produces. Brakes: 0 rows → abort; orphans > 40% → abort
 * unless --force.
 *
 *   node scripts/sync-investment-deals-mix.mjs            write
 *   node scripts/sync-investment-deals-mix.mjs --dry-run  preview only
 *   node scripts/sync-investment-deals-mix.mjs --force    bypass the orphan brake
 */

import crypto from "crypto";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { normalizeAgency, countByAgency, logAgencySplit, UNASSIGNED_AGENCY } from "./lib/agency.mjs";
import { fetchClientIdByName, withClientId, logClientIdSplit } from "./lib/client-ids.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const NATIVE = "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
const LOCATION = "northamerica-northeast1";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "investment_deals_mix";
const BATCH_SIZE = 450;
const ORPHAN_ABORT_RATIO = 0.4;

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const GRAIN = [
  "PLUSCO_YEAR",
  "MONTH",
  "AGENCY",
  "OFFICE",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_PROGRAMMATIC",
  "PLUSCO_2026_DEALS",
  "PLUSCO_DEALS_Type",
  "PLUSCO_DEALS_Category",
  "PLUSCO_DEALS_Channel",
  "PLUSCO_VENDOR_MARKET",
  "PLUSCO_VENDOR_LANGUAGE",
];

const QUERY = `
  SELECT ${GRAIN.join(", ")}, SUM(NET_ORDERED_CAD) AS NET_ORDERED_CAD, ANY_VALUE(SOURCE) AS SOURCE
  FROM ${NATIVE}
  WHERE PLUSCO_MEDIA_CHANNEL IS NOT NULL AND PLUSCO_MEDIA_CHANNEL != 'N/A'
  GROUP BY ${GRAIN.map((_, i) => i + 1).join(", ")}`;

const docId = (r) => crypto.createHash("sha256").update(JSON.stringify(GRAIN.map((f) => r[f] ?? null))).digest("hex");

/** Agency the rules scope on: the MIR agency, else the MIR office (non-Forecaster clients). */
function rowAgency(agency, office) {
  const a = normalizeAgency(agency);
  return a === UNASSIGNED_AGENCY ? normalizeAgency(office) : a;
}

async function main() {
  console.log(DRY_RUN ? "MODE: dry run (no writes)" : `MODE: write${FORCE ? " [--force]" : ""}`);
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: FIRESTORE_PROJECT });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  const [rows] = await bq.query({ query: QUERY, location: LOCATION });
  console.log(`Fetched ${rows.length} row(s) from NATIVE.`);
  if (rows.length === 0) {
    console.error("ABORT: 0 rows from BigQuery; refusing to reconcile against an empty source.");
    process.exit(1);
  }

  const idByName = await fetchClientIdByName(bq);
  const syncedAt = new Date().toISOString();
  const current = new Map();
  for (const r of rows) {
    const d = {};
    for (const f of GRAIN) d[f] = r[f] === undefined || r[f] === null ? null : String(r[f]);
    const id = docId(d);
    const prev = current.get(id);
    if (prev) {
      prev.NET_ORDERED_CAD += Number(r.NET_ORDERED_CAD) || 0;
      continue;
    }
    current.set(
      id,
      withClientId(
        {
          ...d,
          NET_ORDERED_CAD: Number(r.NET_ORDERED_CAD) || 0,
          SOURCE: r.SOURCE ?? null,
          _agency: rowAgency(d.AGENCY, d.OFFICE),
          _syncedAt: syncedAt,
        },
        idByName
      )
    );
  }

  const all = [...current.values()];
  logAgencySplit(COLLECTION, countByAgency(all, (d) => d._agency));
  logClientIdSplit(COLLECTION, all);
  for (const y of [...new Set(all.map((d) => d.PLUSCO_YEAR))].sort()) {
    const ys = all.filter((d) => d.PLUSCO_YEAR === y);
    const sum = (pred) => Math.round(ys.filter(pred).reduce((t, d) => t + d.NET_ORDERED_CAD, 0)).toLocaleString();
    console.log(
      `${y}: total $${sum(() => true)} · Labs + Labs - BRP $${sum((d) => d.PLUSCO_DEALS_Type === "Labs" || d.PLUSCO_DEALS_Type === "Labs - BRP")}` +
        ` · Volume Deals $${sum((d) => d.PLUSCO_DEALS_Type === "Volume Deals")}`
    );
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
    if ((i / BATCH_SIZE) % 10 === 0) console.log(`  upserted ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}`);
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
