// scripts/sync-mediabox-planner.mjs
/**
 * Sync: BigQuery finance_master_mapping (MediaBox planned budgets) → the
 * MediaBox Planner dashboard tab + its Reports raw-data download.
 *
 * Source: plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping,
 * rebuilt daily by the `Concatenated_finance_table` scheduled query (MediaBox v1 +
 * v2 finance, deduplicated, mapped to Forecaster clients and Plus partners /
 * channels / deals). One row per tactic × month; `monthly_tactic_media_budget`
 * is the planned net budget in the campaign's reference currency.
 *
 * Writes:
 *   1. Firestore `mediabox_planner_mix` — the tab's charts. Rows summed to
 *      year × month × agency × client × channel × partner × deal × campaign
 *      status, amounts converted to CAD (PLANNED_CAD) and to USD (PLANNED_USD).
 *      Tagged `_agency` (rules) and `_clientId` (MediaBox allocations).
 *   2. Storage `reports/mediabox_planner/{agency}/data.json.gz` — every column of
 *      the source table plus FX_RATE_TO_CAD / BUDGET_CAD, one file per agency
 *      (scripts/lib/report-snapshot.mjs).
 *   3. `dashboard_meta/mediabox_planner` — sync time + the rates used, shown on
 *      the tab.
 *
 * Currency: Bank of Canada rates to CAD, one per currency × year
 * (scripts/lib/boc-fx.mjs). USD = CAD ÷ that year's USD rate.
 *
 * Agency: the Forecaster client's agency (CL_Agency), else MediaBox's own agency
 * field (accents ignored: "Jungle Média" → Jungle). Anything else → _unassigned
 * (admin only).
 *
 * Run from repo root (also part of scripts/sync-all.mjs):
 *   node scripts/sync-mediabox-planner.mjs [--dry-run] [--force]
 */

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { normalizeAgency, countByAgency, logAgencySplit, UNASSIGNED_AGENCY } from "./lib/agency.mjs";
import { cleanValue, grainDocId, reconcileCollection, reconcileFlags } from "./lib/reconcile.mjs";
import { publishReportSnapshots } from "./lib/report-snapshot.mjs";
import { fetchRatesToCad } from "./lib/boc-fx.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE = "`plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping`";
const FIREBASE_PROJECT = "pluscoops";
const COLLECTION = "mediabox_planner_mix";
const REPORT_TABLE = "mediabox_planner";
const META_DOC = "mediabox_planner";
const NO_PARTNER = "(No partner mapped)";

// Doc id = hash of these, in this order. Never reorder once data is stored.
const GRAIN_FIELDS = [
  "PLUSCO_YEAR",
  "MONTH",
  "AGENCY",
  "PLUSCO_CLIENT_ID",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_2026_DEALS",
  "CMP_STATUS",
];

/** Lowercase, accents stripped, trimmed — "Jungle Média" and "Jungle Media" match. */
function foldAgency(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}
// MediaBox agency spellings that aren't an app agency name as-is.
const MEDIABOX_AGENCY_ALIASES = new Map([["jungle media", "Jungle"]]);

/** The row's app agency: the client's, else MediaBox's own field, else _unassigned. */
function agencyOf(clientAgency, mediaboxAgency) {
  const fromClient = normalizeAgency(clientAgency);
  if (fromClient !== UNASSIGNED_AGENCY) return fromClient;
  const folded = foldAgency(mediaboxAgency);
  return MEDIABOX_AGENCY_ALIASES.get(folded) ?? normalizeAgency(folded);
}

const blank = (v) => v === null || v === undefined || String(v).trim() === "" || String(v).trim() === "-";
const text = (v) => (blank(v) ? null : String(v).trim());

async function main() {
  const { dryRun, force } = reconcileFlags();
  const app = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: FIREBASE_PROJECT });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  console.log(`Querying ${BQ_TABLE} ...`);
  const [raw] = await bq.query({ query: `SELECT * FROM ${BQ_TABLE}` });
  console.log(`Fetched ${raw.length} row(s).`);
  if (raw.length === 0) {
    console.error("ABORT: BigQuery returned 0 rows - nothing written. Check the table.");
    process.exit(1);
  }
  const rows = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cleanValue(v)])));

  // ── Rates ──────────────────────────────────────────────────────────────────
  const currencies = rows.map((r) => text(r.ref_currency)?.toUpperCase() ?? "CAD");
  const years = rows.map((r) => Number(r.year)).filter(Number.isFinite);
  const fx = await fetchRatesToCad(currencies, years);
  console.log("Rates to CAD:");
  for (const [y, byCur] of Object.entries(fx)) {
    for (const [c, e] of Object.entries(byCur)) if (c !== "CAD") console.log(`  ${y} ${c}: ${e.rate}  (${e.basis})`);
  }
  const toCad = (cur, year) => fx[year]?.[cur]?.rate;

  // ── Per-row conversion (shared by both outputs) ────────────────────────────
  let unconverted = 0;
  const converted = rows.map((r) => {
    const cur = text(r.ref_currency)?.toUpperCase() ?? "CAD";
    const year = Number(r.year);
    const rate = toCad(cur, year);
    if (rate === undefined) unconverted++;
    const budget = Number(r.monthly_tactic_media_budget) || 0;
    return {
      ...r,
      _agency: agencyOf(r.CL_Agency, r.agency),
      FX_RATE_TO_CAD: rate ?? null,
      BUDGET_CAD: rate === undefined ? null : budget * rate,
    };
  });
  if (unconverted) {
    console.error(`ABORT: ${unconverted} row(s) have no CAD rate (bad year or currency) - nothing written.`);
    process.exit(1);
  }

  // ── 1. Dashboard rows ──────────────────────────────────────────────────────
  const grain = new Map();
  for (const r of converted) {
    const year = Number(r.year);
    const usd = fx[year]?.USD?.rate;
    const doc = {
      PLUSCO_YEAR: String(year),
      MONTH: text(r.month), // "YYYY-MM"
      MONTH_DATE: text(r.month) ? `${text(r.month)}-01` : null,
      AGENCY: r._agency,
      PLUSCO_CLIENT_ID: text(r.CL_ID),
      PLUSCO_CLIENT_NAME: text(r.CL_Name) ?? text(r.client),
      PLUSCO_MEDIA_CHANNEL: text(r.PLUSCO_MEDIA_CHANNEL) ?? "N/A",
      PLUSCO_MEDIA_PARTNER: text(r.PLUSCO_MEDIA_PARTNER) ?? NO_PARTNER,
      PLUSCO_2026_DEALS: text(r.PLUSCO_2026_DEALS),
      CMP_STATUS: text(r.cmp_status) ?? "(No status)",
    };
    const id = grainDocId(doc, GRAIN_FIELDS);
    const cur = grain.get(id) ?? { ...doc, PLANNED_CAD: 0, PLANNED_USD: 0, TACTIC_MONTHS: 0, _agency: r._agency };
    cur.PLANNED_CAD += r.BUDGET_CAD;
    cur.PLANNED_USD += usd ? r.BUDGET_CAD / usd : 0;
    cur.TACTIC_MONTHS += 1;
    if (doc.PLUSCO_CLIENT_ID) cur._clientId = doc.PLUSCO_CLIENT_ID;
    grain.set(id, cur);
  }
  const mixRows = [...grain.values()].map((d) => ({
    ...d,
    PLANNED_CAD: Math.round(d.PLANNED_CAD * 100) / 100,
    PLANNED_USD: Math.round(d.PLANNED_USD * 100) / 100,
  }));
  const totalCad = mixRows.reduce((s, d) => s + d.PLANNED_CAD, 0);
  console.log(`${mixRows.length} dashboard row(s), ${Math.round(totalCad).toLocaleString("en-CA")} CAD planned.`);
  logAgencySplit(COLLECTION, countByAgency(mixRows, (d) => d._agency));
  const untagged = mixRows.filter((d) => !d._clientId);
  console.log(
    `${COLLECTION}: ${mixRows.length - untagged.length}/${mixRows.length} rows tagged with _clientId` +
      (untagged.length ? ` (untagged clients: ${[...new Set(untagged.map((d) => d.PLUSCO_CLIENT_NAME))].slice(0, 15).join(", ")} …)` : "")
  );

  const res = await reconcileCollection({
    db,
    collection: COLLECTION,
    rows: mixRows,
    // Same hash as the grouping key above (the grain fields are stored on the doc).
    toDocId: (d) => grainDocId(d, GRAIN_FIELDS),
    sampleFields: ["PLUSCO_YEAR", "MONTH", "PLUSCO_CLIENT_NAME", "PLUSCO_MEDIA_CHANNEL", "PLANNED_CAD"],
    dryRun,
    force,
  });
  if (res.status === "aborted") process.exit(1);
  if (dryRun) {
    console.log("Dry run: Storage report and meta doc not written.");
    process.exit(0);
  }

  // ── 2. Reports raw-data download ───────────────────────────────────────────
  console.log("Publishing per-agency report snapshots to Storage...");
  await publishReportSnapshots({
    app,
    table: REPORT_TABLE,
    rawRows: converted.map(({ _agency, ...r }) => ({ ...r, AGENCY_APP: _agency })),
    agencyOf: (r) => r.AGENCY_APP,
  });

  // ── 3. Meta (sync time + rates) ────────────────────────────────────────────
  const now = new Date();
  await db.collection("dashboard_meta").doc(META_DOC).set({
    synced_at: now.toISOString(),
    synced_at_ms: now.getTime(),
    source: "PCC_Media_Investment.finance_master_mapping",
    source_rows: rows.length,
    total_cad: Math.round(totalCad),
    fx,
  });
  console.log(`Done. ${rows.length} MediaBox row(s) synced.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("Sync FAILED:", err?.message || err);
  console.error("  - Not logged in: re-run  gcloud auth application-default login");
  console.error("  - Bank of Canada unreachable: retry later (the sync never writes unconverted amounts).");
  process.exit(1);
});
