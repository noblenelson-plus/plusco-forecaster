// scripts/backfill-mo-client-ids.mjs
//
// One-off: tags the existing MediaOcean rows with `_clientId` (the Forecaster
// client id, from the client name — scripts/lib/client-ids.mjs), so they can
// be read by client under MediaBox allocations without waiting for the next
// monthly sync (which now writes the field itself). Touches only `_clientId`.
//
// Usage:
//   gcloud auth application-default login
//   node scripts/backfill-mo-client-ids.mjs            # dry run
//   node scripts/backfill-mo-client-ids.mjs --apply    # write

import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { fetchClientIdByName } from "./lib/client-ids.mjs";

const { BigQuery } = bigqueryPkg;
const APPLY = process.argv.includes("--apply");
const COLLECTIONS = ["mediaocean_investment_mix", "social_partner_mix"];

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: "pluscoops" });
const db = admin.firestore();
const idByName = await fetchClientIdByName(new BigQuery({ projectId: "plusco-media-invest-solutions" }));
console.log(`${idByName.size} client names mapped to a Forecaster id.`);

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).select("PLUSCO_CLIENT_NAME", "AGENCY", "_clientId").get();
  const updates = [];
  const untagged = new Set();
  for (const d of snap.docs) {
    const id = idByName.get(d.get("PLUSCO_CLIENT_NAME")) ?? null;
    if (!id) untagged.add(`${d.get("PLUSCO_CLIENT_NAME")} [${d.get("AGENCY")}]`);
    if ((d.get("_clientId") ?? null) !== id) updates.push({ ref: d.ref, id });
  }
  console.log(`\n${name}: ${snap.size} rows, ${updates.length} to update, ${untagged.size} names left untagged.`);
  if (untagged.size) console.log(`  untagged: ${[...untagged].slice(0, 20).join(", ")}`);
  if (!APPLY) continue;
  for (let i = 0; i < updates.length; i += 450) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 450)) {
      batch.update(u.ref, { _clientId: u.id ?? admin.firestore.FieldValue.delete() });
    }
    await batch.commit();
  }
  console.log(`  updated ${updates.length}.`);
}
if (!APPLY) console.log("\nDry run — re-run with --apply to write.");
process.exit(0);
