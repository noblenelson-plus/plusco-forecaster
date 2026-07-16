// scripts/migrate-commissions-2026.mjs
//
// One-off migration: imports the v1 forecaster commission CSV into the
// current model — commissionsConfig[2026][mediaType] = 12 identical
// monthly values (the stored format is always monthly; a uniform rate is
// represented by 12 identical values, see lib/types/client.types.ts).
//
// Usage:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
//   node scripts/migrate-commissions-2026.mjs "/path/to/Commission migration - Sheet1.csv"           # dry run
//   node scripts/migrate-commissions-2026.mjs "/path/to/Commission migration - Sheet1.csv" --apply   # write
//
// Behavior:
//   - CSV rows with an empty/unknown channel are skipped and reported.
//   - Duplicate (client, channel) rows: identical rates are deduped
//     silently-ish (reported); conflicting rates abort the run.
//   - Client IDs absent from the `clients` collection are reported and
//     skipped — fix the CSV and re-run.
//   - Clients that already have a non-empty commissionsConfig.2026 are
//     skipped unless --force is passed (the whole year is then replaced,
//     mirroring saveYearCommissions).

import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const YEAR = 2026;

const CHANNEL_MAP = {
  "TV": "tv",
  "Radio": "radio",
  "OOH": "ooh",
  "Print": "print",
  "Social": "social",
  "Programmatic": "programmatic",
  "SEM": "sem",
  "Digital Direct": "digitalDirect",
};

const [, , csvPath, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
const FORCE = flags.includes("--force");

if (!csvPath) {
  console.error("Usage: node scripts/migrate-commissions-2026.mjs <csv-path> [--apply] [--force]");
  process.exit(1);
}

// ── Parse & normalize the CSV ────────────────────────────────────────────────

const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
const byClient = new Map(); // cl_id -> { mediaType -> rate }
const skipped = [];
let conflicts = 0;

lines.forEach((line, i) => {
  const row = i + 2; // 1-based, after header
  const [id, channel, rateStr] = line.split(",").map((s) => s?.trim());
  const rate = parseFloat((rateStr ?? "").replace("%", ""));

  if (!id || Number.isNaN(rate) || rate < 0 || rate > 100) {
    skipped.push(`row ${row}: unparseable line "${line}"`);
    return;
  }
  const mediaType = CHANNEL_MAP[channel];
  if (!mediaType) {
    skipped.push(`row ${row}: ${id} — empty/unknown channel "${channel ?? ""}" @ ${rate}%`);
    return;
  }

  const rates = byClient.get(id) ?? {};
  if (mediaType in rates && rates[mediaType] !== rate) {
    console.error(`CONFLICT row ${row}: ${id} ${channel} ${rate}% vs earlier ${rates[mediaType]}%`);
    conflicts++;
  }
  rates[mediaType] = rate;
  byClient.set(id, rates);
});

if (conflicts > 0) {
  console.error(`\nAborting: ${conflicts} conflicting duplicate rate(s). Fix the CSV first.`);
  process.exit(1);
}

// ── Verify against Firestore & write ─────────────────────────────────────────

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const uniformRate = (rate) =>
  Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m + 1, rate]));

const missing = [];
const alreadyConfigured = [];
let written = 0;

for (const [clId, rates] of byClient) {
  const snap = await db.collection("clients").doc(clId).get();
  if (!snap.exists) {
    missing.push(clId);
    continue;
  }

  const existing = snap.data().commissionsConfig?.[YEAR];
  if (existing && Object.keys(existing).length > 0 && !FORCE) {
    alreadyConfigured.push(clId);
    continue;
  }

  const yearConfig = Object.fromEntries(
    Object.entries(rates).map(([mediaType, rate]) => [mediaType, uniformRate(rate)])
  );

  if (APPLY) {
    await snap.ref.update({
      [`commissionsConfig.${YEAR}`]: yearConfig,
      updatedAt: new Date().toISOString(),
    });
  }
  written++;
  console.log(
    `${APPLY ? "WROTE" : "would write"} ${clId} (${snap.data().CL_Name}): ` +
      Object.entries(rates).map(([t, r]) => `${t}=${r}%`).join(", ")
  );
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${APPLY ? "Applied" : "Dry run"} — ${written}/${byClient.size} clients ${APPLY ? "updated" : "ready"}.`);
if (skipped.length) {
  console.log(`\nSkipped CSV rows (${skipped.length}):`);
  skipped.forEach((s) => console.log("  " + s));
}
if (missing.length) {
  console.log(`\nClient IDs not found in Firestore (${missing.length}): ${missing.join(", ")}`);
}
if (alreadyConfigured.length) {
  console.log(
    `\nClients with an existing ${YEAR} config, skipped (${alreadyConfigured.length}, use --force to replace): ${alreadyConfigured.join(", ")}`
  );
}
