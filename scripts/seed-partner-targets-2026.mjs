// filepath: scripts/seed-partner-targets-2026.mjs
/**
 * Seed:  Firestore  partner_targets/2026
 *
 * Pre-loads the 2026 partner media-spend targets + the Executive Summary goals
 * (from the source sheet) into ONE document, matching the shape the Labs Targets
 * admin tab reads/writes:
 *   { year, totalLabsShareOfMediaTarget, execGoals, partners: [{ id, partner,
 *     dealType, inLabsForecaster2, mediaSpendTarget }] }
 *
 * Uses the Firebase Admin SDK with Application Default Credentials (same as the
 * other scripts in this folder), so it writes with full privileges and does NOT
 * depend on the Firestore security rules.
 *
 * Safety: refuses to overwrite an existing partner_targets/2026 unless run with
 * --force, so it can't clobber edits already made in the admin UI.
 *
 * Setup (once):  gcloud auth application-default login
 * Run:           node scripts/seed-partner-targets-2026.mjs
 * Overwrite:     node scripts/seed-partner-targets-2026.mjs --force
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";

const FIRESTORE_PROJECT = "pluscoops";
const COLLECTION = "partner_targets";
const YEAR = 2026;

// Year-level goal: Total Labs Share of Media Target, as a 0..1 ratio (25%).
const TOTAL_LABS_SHARE_OF_MEDIA_TARGET = 0.25;

// Executive Summary goal lines for 2026. Spends are CAD; shares are 0..1 ratios.
// (Meta's spend is a ceiling — the summary displays it as "< $32M".)
const EXEC_GOALS = {
  labsSpend: 116500000,
  metaSpend: 32000000,
  metaShareOfSocial: 0.49,
  billupsShare: 1.0,
};

// [partner, dealType, inLabsForecaster2, mediaSpendTarget] — transcribed from
// the source sheet. Deal types must match DEAL_TYPES in the app. A null target
// means "no target set" (typical for Volume partners).
//
// NOTE: the sheet has both "Media Pulse" (Labs) and "MediaPulse" (Volume) —
// preserved verbatim here; fix in the admin UI if that's a duplicate.
const PARTNERS = [
  ["Amazon", "Labs", true, 9000000],
  ["Billups-OOH", "Labs", true, 37300000],
  ["Billups-Print", "Labs", true, 1200000],
  ["Media Pulse", "Labs", false, 2000000],
  ["MIQ-Prog", "Labs", true, 19000000],
  ["MIQ-Social", "Labs", true, 5000000],
  ["Quantcast", "Labs", true, 8000000],
  ["Reddit", "Labs", true, 15340000],
  ["SiriusXM", "Labs", false, 1200000],
  ["StackAdapt", "Labs", true, 4000000],
  ["Yahoo", "Labs", true, 7500000],
  ["Corus", "Labs - PBB", false, 21000000],
  ["Netflix", "Labs - PBB", false, 4050000],
  ["Quebecor", "Labs - PBB", false, 26000000],
  ["Index", "Labs - SSP", false, 2000000],
  ["Magnite", "Labs - SSP", false, 5000000],
  ["I HEART MEDIA", "Labs - BRP", false, 4193400],
  ["TRADER INTERACTIVE", "Labs - BRP", false, 2795600],
  ["Google", "Volume", false, null],
  ["Pelmorex", "Volume", false, null],
  ["CBS", "Volume", false, null],
  ["MediaPulse", "Volume", false, null],
  ["Bell Media", "Volume", false, null],
  ["CBC/SRC", "Volume", false, null],
  ["MediaTonik", "Volume", false, null],
  ["Fuel Digital", "Volume", false, null],
  ["LaPresse", "Volume", false, null],
  ["Télé-Quebec", "Volume", false, null],
  ["Cogeco", "Volume", false, null],
];

function toRow([partner, dealType, inLabsForecaster2, mediaSpendTarget]) {
  return {
    id: randomUUID(),
    partner,
    dealType,
    inLabsForecaster2,
    mediaSpendTarget,
  };
}

async function main() {
  const force = process.argv.includes("--force");

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  const ref = db.collection(COLLECTION).doc(String(YEAR));

  const existing = await ref.get();
  if (existing.exists && !force) {
    console.log(
      `partner_targets/${YEAR} already exists — nothing written.\n` +
        `Re-run with --force to overwrite it:\n` +
        `  node scripts/seed-partner-targets-2026.mjs --force`
    );
    return;
  }

  const payload = {
    year: YEAR,
    totalLabsShareOfMediaTarget: TOTAL_LABS_SHARE_OF_MEDIA_TARGET,
    execGoals: EXEC_GOALS,
    partners: PARTNERS.map(toRow),
  };

  await ref.set(payload);

  const labsTotal = payload.partners
    .filter((p) => p.dealType.startsWith("Labs"))
    .reduce((acc, p) => acc + (p.mediaSpendTarget ?? 0), 0);

  console.log(
    `Wrote partner_targets/${YEAR}: ${payload.partners.length} partners.\n` +
      `Derived total Labs target: $${labsTotal.toLocaleString("en-CA")}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
