// scripts/migrate-products.mjs
//
// Seeds / reconciles the `products` collection (the DISH Products catalog — see
// lib/types/product.types.ts) with the authoritative master list.
//
// Products retained from the original static catalog keep their historical
// productId (doc ID) so existing `product_tracking` entries stay linked. New
// products get a stable slug ID. Products on the REMOVE list are deleted if
// present (their saved tracking data persists and simply shows as "unavailable"
// in the app — keep & flag).
//
// Usage:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   # or gcloud ADC
//   node scripts/migrate-products.mjs           # dry run (reports what it would do)
//   node scripts/migrate-products.mjs --apply   # write
//
// Idempotent: re-running reconciles each doc's name + use flags to the spec
// below (existing descriptions are preserved via merge).

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "pluscoops";

// Authoritative master list. `pipeline` / `revenueDropdown` are the two uses.
// IDs of products that existed in the original static catalog are preserved.
const DESIRED = [
  // Both pipeline + revenue.
  { productId: "analytics-hub", name: "Analytics Hub", pipeline: true, revenueDropdown: true },
  { productId: "smart-persona", name: "Smart Persona", pipeline: true, revenueDropdown: true },
  { productId: "insights-hub", name: "Insights Hub", pipeline: true, revenueDropdown: true },
  { productId: "dco", name: "DCO", pipeline: true, revenueDropdown: true },
  { productId: "radius", name: "Radius", pipeline: true, revenueDropdown: true },
  { productId: "aeo", name: "AEO", pipeline: true, revenueDropdown: true },
  { productId: "mediabox-2", name: "Mediabox 2.0", pipeline: true, revenueDropdown: true },
  { productId: "affiliates-aim", name: "Affiliates (AIM)", pipeline: true, revenueDropdown: true },
  // New products (no existing tracking data references them).
  { productId: "data-spine", name: "Data Spine", pipeline: true, revenueDropdown: true },
  { productId: "azimut", name: "Azimut", pipeline: true, revenueDropdown: true },
  { productId: "tv-verified", name: "TV Verified", pipeline: true, revenueDropdown: true },
  { productId: "research-insights", name: "Research & Insights", pipeline: true, revenueDropdown: true },
  // Pipeline only (in the pipeline list but not the revenues list).
  { productId: "aios", name: "AIOS", pipeline: true, revenueDropdown: false },
];

// Products to remove from both lists (deleted if present). Their saved tracking
// data is left untouched and shows as "unavailable" in the app.
const REMOVE = ["social-sonar"];

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();
  const col = db.collection("products");
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const { productId, name, pipeline, revenueDropdown } of DESIRED) {
    const ref = col.doc(productId);
    const snap = await ref.get();
    const uses = `${pipeline ? "pipeline" : ""}${
      pipeline && revenueDropdown ? " + " : ""
    }${revenueDropdown ? "revenueDropdown" : ""}`;
    if (snap.exists) {
      console.log(`update ${productId} → "${name}" (${uses})`);
      // merge: reconcile name + flags, keep any admin-entered description.
      if (APPLY) await ref.set({ name, pipeline, revenueDropdown }, { merge: true });
      updated += 1;
    } else {
      console.log(`create ${productId} → "${name}" (${uses})`);
      if (APPLY)
        await ref.set({ name, pipeline, revenueDropdown, createdAt: now });
      created += 1;
    }
  }

  for (const productId of REMOVE) {
    const ref = col.doc(productId);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`delete ${productId} (removed from both lists)`);
      if (APPLY) await ref.delete();
      removed += 1;
    } else {
      console.log(`skip   ${productId} (already absent)`);
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Dry run"}: ${created} created, ${updated} updated, ${removed} removed.`
  );
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
