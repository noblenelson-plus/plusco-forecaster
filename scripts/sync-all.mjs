// filepath: scripts/sync-all.mjs
/**
 * Monthly orchestrator:  BigQuery  ->  Firestore  (all collections, in one go).
 *
 * Runs every per-collection sync script in sequence, FAILS FAST on the first
 * error, and ONLY after all of them succeed writes a single freshness stamp
 * (dashboard_meta/last_sync) derived from NATIVE's SOURCE tag. Because the stamp
 * is written last, a "Last Updated ..." label can never sit on top of a
 * collection that did not actually refresh.
 *
 * WHY THIS EXISTS
 *   The dashboard reads Firestore, not BigQuery. Rebuilding the BigQuery tables
 *   does nothing to the app until these syncs run. Running six scripts by hand,
 *   in order, and noticing if one quietly failed is exactly where a half-updated
 *   dashboard comes from. This makes the whole push one command, all-or-nothing.
 *
 * WHAT IT DOES NOT DO
 *   It does not run your SQL rebuilds. Do those first (load the sheets, rebuild
 *   RAW_COMBINED with the new month tag, then rebuild the tables in dependency
 *   order). This script assumes BigQuery is already current and just mirrors it
 *   to Firestore.
 *
 * ORDER NOTE
 *   The six syncs are independent reads (each copies one already-built BigQuery
 *   table), so their order does not affect correctness. mir-raw runs first only
 *   because it is the largest and the most common auth/permission failures show
 *   up there immediately.
 *
 * Run from repo root, AFTER the monthly SQL rebuilds:
 *   node scripts/sync-all.mjs
 *
 * Exit codes:
 *   0  every sync succeeded and the freshness stamp was written.
 *   1  a sync failed (stamp NOT written), or all syncs succeeded but the stamp
 *      write failed (data is current; only the label did not refresh).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const NATIVE_TABLE =
  "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
const FIRESTORE_PROJECT = "pluscoops";
const META_COLLECTION = "dashboard_meta";
const META_DOC = "last_sync";

// The six monthly syncs, in run order. Each already reads one built BigQuery
// table and writes one Firestore collection; each exits non-zero on failure.
const SYNCS = [
  "sync-mir-raw.mjs", // PCC_Dashboard_NATIVE               -> mir_raw
  "sync-kpi-by-client.mjs", // KPI_BY_CLIENT_2025_vs_2026         -> mo_kpi_by_client
  "sync-meta-social-output.mjs", // META_SOCIAL_OUTPUT_2025_vs_2026    -> meta_social_output
  "sync-mediaocean-investment-mix.mjs", // MEDIAOCEAN_INVESTMENT_MIX          -> mediaocean_investment_mix
  "sync-social-partner-mix.mjs", // SOCIAL_PARTNER_MIX_2025_vs_2026    -> social_partner_mix
  "sync-billing-summary-raw.mjs", // Billing_summary_master             -> billing_summary_raw
];

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

// Abbreviated month token (first 3 letters, any case) -> full month name, so
// "MIR AUG 26" renders as "August 26, 2026" to match the existing dashboard label.
const MONTHS = {
  JAN: "January",
  FEB: "February",
  MAR: "March",
  APR: "April",
  MAY: "May",
  JUN: "June",
  JUL: "July",
  AUG: "August",
  SEP: "September",
  OCT: "October",
  NOV: "November",
  DEC: "December",
};

// Coerce a BigQuery scalar (number | bigint | numeric string | { value }) to a
// finite JS number, else null. Mirrors the cleanValue pattern in the sync scripts.
function toNum(v) {
  if (v === null || v === undefined) return null;
  if(typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && v.value !== undefined) {
    const n = Number(v.value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse "MIR AUG 26" + year -> a structured label. Tokens: [prefix, month, day].
// The year is supplied separately (MAX(PLUSCO_YEAR)), never guessed from SOURCE.
// Any shape that does not cleanly parse returns ok:false so the caller stores the
// raw SOURCE verbatim instead of a confidently-wrong date.
function parseSource(source, year) {
  const raw = String(source ?? "").trim();
  const tokens = raw.split(/\s+/);
  if (tokens.length < 3) return { ok: false, raw };

  const monthName = MONTHS[tokens[1].toUpperCase().slice(0, 3)];
  const day = parseInt(tokens[2], 10);

  if (
    !monthName ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(year)
  ) {
    return { ok: false, raw };
  }

  return {
    ok: true,
    raw,
    month: monthName,
    day,
    year,
    label: `${monthName} ${day}, ${year}`,
    updated_label: `Last Updated ${monthName} ${day}, ${year}`,
  };
}

// Spawn one sync script as its own process. A separate process (vs import) is
// deliberate: each sync calls admin.initializeApp() + process.exit(), which can
// only happen once per process. stdio is inherited so the child's own logs
// (including its "Synced N rows" line) stream straight to the terminal.
function runSync(scriptFile) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPT_DIR, scriptFile);
    const child = spawn(process.execPath, [scriptPath], { stdio: "inherit" });
    child.on("error", (err) =>
      reject(new Error(`could not start ${scriptFile}: ${err.message}`))
    );
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${scriptFile} exited with ${
              signal ? `signal ${signal}` : `code ${code}`
            }`
          )
        );
    });
  });
}

function printSummary(results) {
  console.log("\n──────── Sync summary ────────");
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "➗"}  ${r.script}${r.ok ? "" : `  — ${r.error}`}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`  ${okCount}/${SYNCS.length} syncs succeeded.`);
  console.log("──────────────────────────────");
}

// Reads NATIVE's SOURCE (most common value if more than one) + MAX(PLUSCO_YEAR),
// builds the label, and writes dashboard_meta/last_sync. Admin SDK writes bypass
// Firestore rules, so no rule change is needed to WRITE this doc (the dashboard
// will need a READ rule when it starts reading it).
async function writeFreshnessStamp() {
  const bq = new BigQuery({ projectId: BQ_PROJECT });

  const [srcRows] = await bq.query({
    query: `
      SELECT SOURCE, COUNT(*) AS n
      FROM ${NATIVE_TABLE}
      WHERE SOURCE IS NOT NULL AND TRIM(SOURCE) != ''
      GROUP BY SOURCE
      ORDER BY n DESC
    `,
  });
  const [yearRows] = await bq.query({
    query: `SELECT MAX(SAFE_CAST(PLUSCO_YEAR AS INT64)) AS max_year FROM ${NATIVE_TABLE}`,
  });

  const variants = srcRows.map((r) => ({
    source: r.SOURCE,
    rows: toNum(r.n),
  }));
  const topSource = variants.length ? variants[0].source : null;
  const maxYear = yearRows.length ? toNum(yearRows[0].max_year) : null;

  if (variants.length > 1) {
    console.warn(
      `\n⚠   NATIVE has ${variants.length} distinct SOURCE values; using the most common ("${topSource}"):`
    );
    variants.forEach((v) => console.warn(`     ${v.source} — ${v.rows} rows`));
  }

  const parsed = parseSource(topSource, maxYear);
  if (!parsed.ok) {
    console.warn(
      `\n⚠  Could not parse SOURCE "${topSource}" (year ${maxYear}) into a date; storing it verbatim as the label.`
    );
  }

  const now = new Date();
  const doc = {
    source_raw: topSource ?? null,
    label: parsed.ok ? parsed.label : topSource ?? null,
    updated_label: parsed.ok
      ? parsed.updated_label
      : topSource
      ? `Last Updated ${topSource}`
      : null,
    month: parsed.ok ? parsed.month : null,
    day: parsed.ok ? parsed.day : null,
    year: parsed.ok ? parsed.year : maxYear,
    parse_ok: parsed.ok,
    source_variants: variants,
    synced_at: now.toISOString(),
    synced_at_ms: now.getTime(),
  };

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  await db.collection(META_COLLECTION).doc(META_DOC).set(doc);

  console.log(`\nFreshness stamp written to ${META_COLLECTION}/${META_DOC}:`);
  console.log(`   ${doc.updated_label ?? doc.label ?? "(no label)"}`);
}

async function main() {
  const started = Date.now();
  console.log(
    `Monthly sync starting — ${SYNCS.length} collections, fail-fast, stamp written last.`
  );

  const results = [];

  for (const script of SYNCS) {
    console.log(`\n=== ${script} ===`);
    try {
      await runSync(script);
      results.push({ script, ok: true });
    } catch (err) {
      results.push({ script, ok: false, error: err.message });
      printSummary(results);
      console.error(
        `\n✗ Stopped at ${script}. Firestore was NOT stamped — the "Last Updated" label still shows the previous run.`
      );
      console.error(
        `   Fix the error above, then re-run  node scripts/sync-all.mjs  from the repo root.`
      );
      process.exit(1);
    }
  }

  // Every sync succeeded. Stamp last so the label can never top a stale collection.
  try {
    await writeFreshnessStamp();
  } catch (err) {
    printSummary(results);
    console.error(
      `\n⚠  All ${SYNCS.length} syncs succeeded, but writing the freshness stamp failed:`
    );
    console.error(`   ${err?.message || err}`);
    console.error(
      `   Your dashboard DATA is current; only the "Last Updated" label did not refresh.`
    );
    process.exit(1);
  }

  printSummary(results);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nAll ${SYNCS.length} collections synced and stamped in ${secs}s.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nsync-all crashed:", err?.message || err);
  process.exit(1);
});
