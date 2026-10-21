// scripts/sync-mediabox-planner.mjs
/**
 * Sync: BigQuery finance_master_mapping (MediaBox planned budgets) → the
 * MediaBox Planner view (Media Investments → Data: MediaBox Planner) + its
 * Reports raw-data download.
 *
 * Source: plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping,
 * rebuilt daily by the `Concatenated_finance_table` scheduled query (v5: MediaBox
 * v2 from mediabox-1cd44.mediabox_3.finance, v1 from canadian-sandbox; mapped to
 * Forecaster clients and Plus partners / channels / deals). One row per tactic ×
 * month, amounts in the campaign's reference currency:
 *   monthly_tactic_media_budget = Planned Net; commission / taxes / other_fees =
 *   the MediaBox fees by bucket (Finance_mediabox.fee_label_mapping). Fees exist
 *   for MediaBox v2 only (NULL for v1).
 *
 * Writes:
 *   1. Firestore `mediabox_planner_mix` — the tab's charts. Rows summed to
 *      year × month × agency × client × MediaBox media type × publisher × deal
 *      (all campaign statuses together); every amount in CAD and USD: PLANNED_*, COMMISSION_*, TAXES_*,
 *      OTHER_FEES_*, and NO_FEE_DATA_* (the part of Planned Net from MediaBox v1,
 *      which has no fee data). Tagged `_agency` (rules) and `_clientId`
 *      (MediaBox allocations).
 *   2. Storage `reports/mediabox_planner/{agency}/data.json.gz` — every column of
 *      the source table plus FX_RATE_TO_CAD and the CAD amounts (BUDGET_CAD,
 *      COMMISSION_CAD, TAXES_CAD, OTHER_FEES_CAD, CLIENT_COST_EXCL_TAXES_CAD,
 *      CLIENT_COST_INCL_TAXES_CAD), one file per agency
 *      (scripts/lib/report-snapshot.mjs). Client Cost = Planned Net + Commission
 *      (+ Taxes); other fees are not included.
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
// Labels for rows MediaBox left blank (read by lib/dashboard/data/use-mediabox-planner-mix.ts).
const NO_PUBLISHER = "(No publisher)";
const NO_MEDIA_TYPE = "(No media type)";
// Summed amounts on each dashboard row, in CAD and USD.
const AMOUNT_FIELDS = ["PLANNED", "COMMISSION", "TAXES", "OTHER_FEES", "NO_FEE_DATA"].flatMap((n) => [`${n}_CAD`, `${n}_USD`]);

// Doc id = hash of these, in this order. Never reorder once data is stored.
// (2026-10-21: switched from the Plus channel / partner + campaign status to
// MediaBox media type / publisher — every id changed once; that run needs --force.)
const GRAIN_FIELDS = [
  "PLUSCO_YEAR",
  "MONTH",
  "AGENCY",
  "PLUSCO_CLIENT_ID",
  "PLUSCO_CLIENT_NAME",
  "MEDIA_TYPE",
  "PUBLISHER",
  "PLUSCO_2026_DEALS",
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
    // Fees: NULL on MediaBox v1 rows (no fee data) — kept NULL, never 0.
    const fee = (v) => (v === null || v === undefined || rate === undefined ? null : (Number(v) || 0) * rate);
    const commissionCad = fee(r.commission);
    const taxesCad = fee(r.taxes);
    const hasFees = commissionCad !== null;
    const budgetCad = rate === undefined ? null : budget * rate;
    return {
      ...r,
      _agency: agencyOf(r.CL_Agency, r.agency),
      FX_RATE_TO_CAD: rate ?? null,
      BUDGET_CAD: budgetCad,
      COMMISSION_CAD: commissionCad,
      TAXES_CAD: taxesCad,
      OTHER_FEES_CAD: fee(r.other_fees),
      CLIENT_COST_EXCL_TAXES_CAD: hasFees ? budgetCad + commissionCad : null,
      CLIENT_COST_INCL_TAXES_CAD: hasFees ? budgetCad + commissionCad + (taxesCad ?? 0) : null,
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
      MEDIA_TYPE: text(r.media_type) ?? NO_MEDIA_TYPE,
      PUBLISHER: text(r.publisher) ?? NO_PUBLISHER,
      PLUSCO_2026_DEALS: text(r.PLUSCO_2026_DEALS),
    };
    const id = grainDocId(doc, GRAIN_FIELDS);
    const cur = grain.get(id) ?? { ...doc, ...Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, 0])), TACTIC_MONTHS: 0, _agency: r._agency };
    const add = (name, cad) => {
      cur[`${name}_CAD`] += cad ?? 0;
      cur[`${name}_USD`] += usd ? (cad ?? 0) / usd : 0;
    };
    add("PLANNED", r.BUDGET_CAD);
    add("COMMISSION", r.COMMISSION_CAD);
    add("TAXES", r.TAXES_CAD);
    add("OTHER_FEES", r.OTHER_FEES_CAD);
    add("NO_FEE_DATA", r.COMMISSION_CAD === null ? r.BUDGET_CAD : 0);
    cur.TACTIC_MONTHS += 1;
    if (doc.PLUSCO_CLIENT_ID) cur._clientId = doc.PLUSCO_CLIENT_ID;
    grain.set(id, cur);
  }
  const mixRows = [...grain.values()].map((d) => ({
    ...d,
    ...Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, Math.round(d[f] * 100) / 100])),
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
    sampleFields: [
      { field: "MONTH", label: "MONTH", width: 7 },
      { field: "PLUSCO_CLIENT_NAME", label: "CLIENT", width: 30 },
      { field: "MEDIA_TYPE", label: "MEDIA_TYPE", width: 14 },
      { field: "PUBLISHER", label: "PUBLISHER", width: 16 },
      { field: "PLANNED_CAD", label: "PLANNED_CAD", money: true },
    ],
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
