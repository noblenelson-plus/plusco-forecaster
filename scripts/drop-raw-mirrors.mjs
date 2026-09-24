// filepath: scripts/drop-raw-mirrors.mjs
/**
 * One-time cleanup: delete the legacy Firestore collections "mir_raw" and
 * "billing_summary_raw" (~135k + ~36k docs).
 *
 * They were row-by-row mirrors of the BigQuery tables PCC_Dashboard_NATIVE and
 * Billing_summary_master. The Reports tab now reads per-agency Storage
 * snapshots instead, the syncs no longer write these collections, and nothing
 * in the app reads them. The data itself still lives in BigQuery.
 *
 * Safe by default: without --confirm it only COUNTS what would be deleted.
 *   node scripts/drop-raw-mirrors.mjs             count only, deletes nothing
 *   node scripts/drop-raw-mirrors.mjs --confirm   permanently delete both collections
 *
 * Needs write access to Firestore in pluscoops and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";

const FIRESTORE_PROJECT = "pluscoops";
const COLLECTIONS = ["mir_raw", "billing_summary_raw"];
const BATCH_SIZE = 450;
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();

  for (const name of COLLECTIONS) {
    const total = (await db.collection(name).count().get()).data().count;
    if (!CONFIRM) {
      console.log(`${name}: ${total} doc(s) would be deleted.`);
      continue;
    }
    console.log(`${name}: deleting ${total} doc(s) ...`);
    let deleted = 0;
    while (true) {
      const snap = await db.collection(name).select().limit(BATCH_SIZE).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (deleted % 9000 < BATCH_SIZE) console.log(`  ${deleted}/${total}`);
    }
    console.log(`${name}: deleted ${deleted} doc(s).`);
  }

  console.log("");
  console.log(
    CONFIRM
      ? "Done. The legacy raw mirrors are gone (the data is still in BigQuery)."
      : "Nothing deleted. Re-run with --confirm to delete permanently."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup FAILED:", err?.message || err);
  process.exit(1);
});
