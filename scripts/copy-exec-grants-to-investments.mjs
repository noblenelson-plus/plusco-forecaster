// filepath: scripts/copy-exec-grants-to-investments.mjs
/**
 * One-time backfill for the Investments Team Dashboard tab (2026-11-27): its
 * pages (Media YOY, PCC Deals, Broadcast, Programmatic, Partner Data) used to
 * live under Exec KPI, so everyone with an Exec KPI grant gets the same scope
 * on the new `investments` tab — nobody loses a page in the move.
 *
 * Additive only: a person who already has an `investments` grant is left as
 * is, and the Exec KPI grant itself is kept (Exec still has its other pages).
 *
 * Safe by default: without --confirm it only LISTS what it would write.
 *   node scripts/copy-exec-grants-to-investments.mjs             dry run
 *   node scripts/copy-exec-grants-to-investments.mjs --confirm   write
 *
 * Run it after the rules + hosting that know the `investments` tab are live.
 * Needs write access to Firestore in pluscoops and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";

const FIRESTORE_PROJECT = "pluscoops";
const FROM = "exec-kpis";
const TO = "investments";
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  const snap = await db.collection("dashboard_grants").get();

  let toWrite = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const tabs = d.data().tabs ?? {};
    if (!tabs[FROM]) continue;
    if (tabs[TO]) {
      skipped++;
      console.log(`skip   ${d.id} (already has an ${TO} grant)`);
      continue;
    }
    toWrite++;
    console.log(`${CONFIRM ? "write " : "would "} ${d.id} ← ${JSON.stringify(tabs[FROM])}`);
    // Field-path update: only tabs.investments is added; every other tab stays.
    if (CONFIRM) await d.ref.update({ [`tabs.${TO}`]: tabs[FROM] });
  }
  console.log(
    `\n${CONFIRM ? "Wrote" : "Would write"} ${toWrite} grant(s); ${skipped} already had one.` +
      (CONFIRM ? "" : " Re-run with --confirm to write.")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
