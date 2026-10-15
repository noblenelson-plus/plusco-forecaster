// scripts/backfill-mediabox-emails.mjs
//
// Fills (or re-checks) every client's derived `CL_MediaBox_Emails`: the people
// allocated in MediaBox to the client's MediaBox client(s) (`CL_MediaBox_IDs`
// → `mediabox_clients/{id}.allocatedEmails`). The Cloud Functions in
// functions/ keep it current afterwards; this script does the first fill and
// can be re-run any time as a consistency check.
//
// Usage:
//   gcloud auth application-default login        # or GOOGLE_APPLICATION_CREDENTIALS
//   node scripts/backfill-mediabox-emails.mjs            # dry run
//   node scripts/backfill-mediabox-emails.mjs --apply    # write
//
// Writes only `CL_MediaBox_Emails`, and only where it differs.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mediaboxEmailsUpdate, mediaboxIds } from "../functions/mediabox-emails.js";

const APPLY = process.argv.includes("--apply");

initializeApp({ credential: applicationDefault(), projectId: "pluscoops" });
const db = getFirestore();

const pushed = await db.collection("mediabox_clients").count().get();
if (!pushed.data().count) {
  console.error("mediabox_clients is empty — nothing to backfill from.");
  process.exit(1);
}

const clients = (await db.collection("clients").get()).docs;
const changes = [];
let linked = 0;
for (const doc of clients) {
  const data = doc.data();
  if (mediaboxIds(data).length) linked++;
  const next = await mediaboxEmailsUpdate(db, data);
  if (next) changes.push({ doc, name: data.CL_Name, before: data.CL_MediaBox_Emails?.length ?? "—", after: next });
}

console.log(`${clients.length} clients, ${linked} linked to MediaBox, ${changes.length} to update.`);
for (const c of changes) console.log(`  ${c.doc.id}  ${c.name}: ${c.before} → ${c.after.length} people`);

if (!APPLY) {
  console.log("\nDry run — re-run with --apply to write.");
  process.exit(0);
}
for (let i = 0; i < changes.length; i += 400) {
  const batch = db.batch();
  for (const c of changes.slice(i, i + 400)) batch.update(c.doc.ref, { CL_MediaBox_Emails: c.after });
  await batch.commit();
}
console.log(`\nUpdated ${changes.length} clients.`);
process.exit(0);
