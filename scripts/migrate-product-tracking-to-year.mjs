// scripts/migrate-product-tracking-to-year.mjs
//
// One-off migration: product tracking moved from one doc per client
// (`product_tracking/{cl_id}`, no year) to one doc per client × year
// (`product_tracking/{cl_id}_{year}`, see lib/types/product.types.ts). Every
// existing entry is assigned to 2026.
//
// Usage:
//   gcloud auth application-default login        # or GOOGLE_APPLICATION_CREDENTIALS
//   node scripts/migrate-product-tracking-to-year.mjs            # dry run
//   node scripts/migrate-product-tracking-to-year.mjs --apply    # write
//
// Behavior:
//   - Old-shape docs are those without a `year` field. Each is copied as-is
//     (products map, updatedAt) into `{cl_id}_2026` with `year: 2026`.
//   - The old docs are NOT deleted — they stay as a backup until the result
//     has been checked (the app no longer reads or writes them).
//   - A target doc that already exists is left untouched and reported, unless
//     `--overwrite` is passed (e.g. re-running to pick up edits made on the
//     old doc while the previous app version was still open).

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const YEAR = 2026;
const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");

initializeApp({ credential: applicationDefault(), projectId: "pluscoops" });
const db = getFirestore();
const coll = db.collection("product_tracking");

const snap = await coll.get();
const legacy = snap.docs.filter((d) => d.data().year === undefined);
console.log(
  `${snap.size} product_tracking docs, ${legacy.length} in the old per-client shape.`
);

let written = 0;
let skipped = 0;
let entries = 0;
const batch = db.batch();
for (const old of legacy) {
  const data = old.data();
  const clientId = data.clientId ?? old.id;
  const targetId = `${clientId}_${YEAR}`;
  const products = data.products ?? {};
  const count = Object.keys(products).length;

  const target = await coll.doc(targetId).get();
  if (target.exists && !OVERWRITE) {
    console.log(`  skip ${old.id} → ${targetId} (already exists)`);
    skipped++;
    continue;
  }
  console.log(`  ${old.id} → ${targetId} (${count} products)`);
  batch.set(coll.doc(targetId), {
    clientId,
    year: YEAR,
    products,
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  });
  written++;
  entries += count;
}

if (written > 450) {
  // One batch holds 500 writes; the collection is far smaller than that.
  console.error(`Too many docs for one batch (${written}) — split the run.`);
  process.exit(1);
}

if (APPLY && written > 0) {
  await batch.commit();
  console.log(`\nWrote ${written} docs (${entries} product entries), skipped ${skipped}.`);
} else {
  console.log(
    `\nDry run: would write ${written} docs (${entries} product entries), skip ${skipped}. ` +
      `Pass --apply to write.`
  );
}
