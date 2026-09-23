// filepath: scripts/sync-mediaocean-investment-mix.mjs
/**
 * Sync:  BigQuery MEDIAOCEAN_INVESTMENT_MIX  ->  Firestore "mediaocean_investment_mix"
 *
 * This is the CANONICAL MediaOcean sync. It replaces the earlier upsert-only
 * version, which only ever added/overwrote docs and never deleted -- so whenever
 * a source row's grain changed (a channel/partner/pod re-label) or a row was
 * removed in the backend, the old doc was stranded. Those orphans accumulated
 * and the app (which sums the whole collection) over-counted: Programmatic ~2x,
 * a phantom Response Advertising line, an inflated Total Media Spend.
 *
 * This version RECONCILES: after writing every current BigQuery row it deletes
 * any Firestore doc that no current row produces. The collection therefore always
 * mirrors the backend -- updates, deletes and additions all flow through.
 *
 *   1. Fetch every BQ row, compute its doc id (id logic is unchanged, so ids line
 *      up with everything already stored).
 *   2. Snapshot every existing Firestore doc id.
 *   3. Orphans = existing ids not produced by any current row.
 *   4. Upsert every current row, THEN delete the orphans (upsert-before-delete,
 *      so the live app never reads an empty window).
 *
 * WRITES BY DEFAULT (a monthly sync should just run):
 *   node scripts/sync-mediaocean-investment-mix.mjs             upsert + delete orphans
 *   node scripts/sync-mediaocean-investment-mix.mjs --dry-run   preview only, writes nothing
 *   node scripts/sync-mediaocean-investment-mix.mjs --force     bypass the orphan safety brake
 *
 * Safety brakes (so an unattended run can never nuke the collection):
 *   - 0 rows from BigQuery            -> ABORT (never delete against an empty source).
 *   - orphans > 40% of the collection -> ABORT unless --force (a huge delete set
 *     usually means BQ came back short or the middle table was mid-rebuild).
 *
 * Needs: BigQuery Data Viewer + Job User on plusco-media-invest-solutions,
 * read+write to Firestore in pluscoops, and a current
 * gcloud auth application-default login.
 */

import crypto from "crypto";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { normalizeAgency, countByAgency, logAgencySplit } from "./lib/agency.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const BQ_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.MEDIAOCEAN_INVESTMENT_MIX`";
const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "mediaocean_investment_mix";
const BATCH_SIZE = 450;

// If the orphan set exceeds this share of the collection, refuse to delete unless
// --force. A sudden huge delete set usually means the source came back short or
// the id logic drifted -- not that there are really that many orphans.
const ORPHAN_ABORT_RATIO = 0.4;

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const APPLY = !DRY_RUN; // write by default

// ── doc-id logic (unchanged from the original sync) ──────────────────────────
// The 11 grain columns, in a fixed order. This order defines the doc-id hash, so
// it MUST NOT change or ids stop lining up with what is already stored (and real
// docs would look like orphans).
const GRAIN_FIELDS = [
  "PLUSCO_YEAR",
  "MONTH",
  "AGENCY",
  "BU_REGION",
  "BUSINESS_LEAD",
  "GM_POD",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_PROGRAMMATIC",
  "PLUSCO_2026_DEALS",
];

// numbers/strings/booleans pass through, bigint -> Number, BigQuery wrapper
// objects ({ value }) unwrap (numeric strings coerced to numbers), else null.
function cleanValue(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean") return v;
  if (t === "bigint") return Number(v);
  if (t === "object") {
    if (v.value !== undefined && v.value !== null) {
      const inner = v.value;
      if (typeof inner === "string") {
        const n = Number(inner);
        return inner.trim() !== "" && !Number.isNaN(n) ? n : inner;
      }
      return inner;
    }
    return String(v);
  }
  return null;
}

// Deterministic doc id from the 11 grain values. cleanValue first so the hash
// input matches what is stored; JSON.stringify keeps null distinct from "".
function toDocId(row) {
  const parts = GRAIN_FIELDS.map((f) => cleanValue(row[f]));
  const canonical = JSON.stringify(parts);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
// ── end doc-id logic ─────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(
    DRY_RUN
      ? "MODE: dry run  (no writes; drop --dry-run to apply)"
      : `MODE: write  (upsert + delete orphans)${FORCE ? "  [--force: orphan brake OFF]" : ""}`
  );
  console.log("");

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  // 1. Current BigQuery rows -> id -> data map (dedupe by grain hash).
  console.log(`Querying ${BQ_TABLE} ...`);
  const [rows] = await bq.query({ query: `SELECT * FROM ${BQ_TABLE}` });
  console.log(`Fetched ${rows.length} row(s) from BigQuery.`);

  // Safety brake #1: never reconcile against an empty source (would wipe all).
  if (rows.length === 0) {
    console.error(
      "ABORT: BigQuery returned 0 rows. Refusing to reconcile against an empty " +
        "source -- that would delete the entire collection. Check the table."
    );
    process.exit(1);
  }

  const syncedAt = new Date().toISOString();
  const current = new Map(); // id -> data
  let bqDuplicates = 0;
  for (const row of rows) {
    const id = toDocId(row);
    if (current.has(id)) bqDuplicates += 1;
    const data = {};
    for (const [key, value] of Object.entries(row)) {
      data[key] = cleanValue(value);
    }
    data._syncedAt = syncedAt;
    // What Firestore rules scope reads on (see scripts/lib/agency.mjs). Not a
    // grain field, so doc ids are unchanged.
    data._agency = normalizeAgency(data.AGENCY);
    current.set(id, data);
  }
  console.log(`Unique current grain id(s): ${current.size}`);
  logAgencySplit(COLLECTION, countByAgency([...current.values()], (d) => d._agency));
  if (bqDuplicates > 0) {
    console.warn(
      `Note: ${bqDuplicates} BQ row(s) shared a grain hash (collapsed, last kept).`
    );
  }

  // 2. Snapshot existing Firestore doc ids. .select() with no fields returns
  //    id-only docs -- light for a ~22k-doc collection.
  console.log(`Reading existing doc ids from "${COLLECTION}" ...`);
  const existingSnap = await db.collection(COLLECTION).select().get();
  const existingIds = existingSnap.docs.map((d) => d.id);
  const existingIdSet = new Set(existingIds);
  console.log(`Existing Firestore doc(s): ${existingIds.length}`);

  // 3. Orphans = existing ids not present in the current BQ set.
  const orphanIds = existingIds.filter((id) => !current.has(id));
  const newIds = [...current.keys()].filter((id) => !existingIdSet.has(id));

  console.log("");
  console.log("-- Reconcile plan ------------------------------------------");
  console.log(`  upsert (all current rows):   ${current.size}`);
  console.log(`    of which brand-new ids:    ${newIds.length}`);
  console.log(`  DELETE (orphaned docs):      ${orphanIds.length}`);
  console.log(
    `  final collection size:       ${current.size}  (was ${existingIds.length})`
  );
  console.log("------------------------------------------------------------");

  // 4. Readable sample of the orphans (full data for up to N ids).
  const SAMPLE = 15;
  const sampleIds = orphanIds.slice(0, SAMPLE);
  if (sampleIds.length > 0) {
    const refs = sampleIds.map((id) => db.collection(COLLECTION).doc(id));
    const sampleDocs = await db.getAll(...refs);
    console.log("");
    console.log(`Sample of orphaned docs (first ${sampleIds.length}):`);
    console.log(
      `  ${"YEAR".padEnd(4)}  ${"CHANNEL".padEnd(16)}  ${"PARTNER".padEnd(30)}  NET`
    );
    for (const d of sampleDocs) {
      const r = d.data() || {};
      const year = String(r.PLUSCO_YEAR ?? "").padEnd(4);
      const ch = String(r.PLUSCO_MEDIA_CHANNEL ?? "").slice(0, 16).padEnd(16);
      const partner = String(r.PLUSCO_MEDIA_PARTNER ?? "").slice(0, 30).padEnd(30);
      const net = (Math.round(Number(r.NET_ORDERED_CAD) || 0)).toLocaleString();
      console.log(`  ${year}  ${ch}  ${partner}  ${net}`);
    }
  }

  // Safety brake #2: disproportionate delete set.
  const ratioExceeded =
    existingIds.length > 0 &&
    orphanIds.length / existingIds.length > ORPHAN_ABORT_RATIO;
  const pctOrphan =
    existingIds.length > 0
      ? ((100 * orphanIds.length) / existingIds.length).toFixed(1)
      : "0.0";

  if (DRY_RUN) {
    console.log("");
    if (ratioExceeded) {
      console.warn(
        `NOTE: orphans are ${pctOrphan}% of the collection (> ${(
          ORPHAN_ABORT_RATIO * 100
        ).toFixed(0)}%). In write mode this would ABORT unless you pass --force.`
      );
      console.log("");
    }
    console.log(
      "Dry run complete. Nothing was written. Drop --dry-run to upsert the " +
        "current rows and delete the orphans above."
    );
    process.exit(0);
  }

  if (ratioExceeded && !FORCE) {
    console.error("");
    console.error(
      `ABORT: orphans are ${pctOrphan}% of the collection (> ${(
        ORPHAN_ABORT_RATIO * 100
      ).toFixed(0)}%). That is a lot to delete -- refusing as a safety brake.`
    );
    console.error(
      "  If this is expected, review with --dry-run, then re-run with --force."
    );
    console.error(
      "  If not, the source table may have come back short (a mid-rebuild or a " +
        "failed query) -- check MEDIAOCEAN_INVESTMENT_MIX before forcing."
    );
    process.exit(1);
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  // 4a. Upsert every current row FIRST, so the app never reads an empty window.
  console.log("");
  console.log("Applying: upserting current rows ...");
  const docs = [...current.entries()].map(([id, data]) => ({ id, data }));
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, data } of slice) {
      batch.set(db.collection(COLLECTION).doc(id), data);
    }
    await batch.commit();
    written += slice.length;
    console.log(`  upserted ${written}/${docs.length}`);
  }

  // 4b. THEN delete the orphans.
  console.log("Applying: deleting orphaned docs ...");
  let deleted = 0;
  for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
    const slice = orphanIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of slice) {
      batch.delete(db.collection(COLLECTION).doc(id));
    }
    await batch.commit();
    deleted += slice.length;
    console.log(`  deleted ${deleted}/${orphanIds.length}`);
  }

  console.log("");
  console.log(
    `Done. Upserted ${written} row(s), deleted ${deleted} orphan(s). ` +
      `Collection "${COLLECTION}" now mirrors BigQuery (${current.size} docs).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("Sync FAILED:", err?.message || err);
  console.error("");
  console.error("Common fixes:");
  console.error("  - Permission denied (BigQuery): account needs BigQuery Data Viewer + Job User on plusco-media-invest-solutions.");
  console.error("  - Permission denied (Firestore): account needs read+write access to Firestore in pluscoops.");
  console.error("  - Not logged in: re-run  gcloud auth application-default login");
  process.exit(1);
});
