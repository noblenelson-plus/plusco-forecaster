// scripts/seed-flag-history.mjs
//
// One-off seed of the flag_history collection (lib/services/flag-history-
// service.ts) for milestones validated BEFORE the history existed: for every
// client × year × step with a validation record, a snapshot of that step's
// round as it is today (the current flags of its target RFQ), with the step's
// recorded status / validatedAt / validatedBy and `seeded: true`.
//
// A Prelim step and its RFQ step share the same round, so both get the same
// flags — the best available record of what was validated then.
//
// Usage:
//   gcloud auth application-default login        # or GOOGLE_APPLICATION_CREDENTIALS
//   node scripts/seed-flag-history.mjs            # dry run (counts only)
//   node scripts/seed-flag-history.mjs --apply    # write
//
// A snapshot that already exists (written by a real validation) is never
// overwritten. Nothing is deleted.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const YEARS = [2026, 2027];

initializeApp({ credential: applicationDefault(), projectId: "pluscoops" });
const db = getFirestore();

const existing = new Set((await db.collection("flag_history").select().get()).docs.map((d) => d.id));
let planned = 0;
let skipped = 0;
let batch = db.batch();
let inBatch = 0;

for (const year of YEARS) {
  const [vals, entries] = await Promise.all([
    db.collection("forecast_validations").where("year", "==", year).get(),
    db.collection("data_entries").where("year", "==", year).get(),
  ]);
  const flagsByDoc = new Map(entries.docs.map((d) => [d.id, d.data().flags ?? {}]));

  for (const v of vals.docs) {
    const { clientId } = v.data();
    for (const [stepId, rec] of Object.entries(v.data().stepValidations ?? {})) {
      if (!rec?.targetRfq || !rec.validatedAt) continue;
      const id = `${clientId}_${year}_${stepId}`;
      if (existing.has(id)) {
        skipped += 1;
        continue;
      }
      const flags = flagsByDoc.get(`${clientId}_${year}_${rec.targetRfq}`) ?? {};
      planned += 1;
      if (!APPLY) continue;
      batch.set(db.doc(`flag_history/${id}`), {
        clientId,
        year,
        stepId,
        targetRfq: rec.targetRfq,
        status: rec.status,
        validatedAt: rec.validatedAt,
        ...(rec.validatedBy ? { validatedBy: rec.validatedBy } : {}),
        flags: Array.isArray(flags) ? Object.fromEntries(flags.map((f) => [f.key, f])) : flags,
        updatedAt: new Date().toISOString(),
        seeded: true,
      });
      if (++inBatch === 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }
}
if (APPLY && inBatch > 0) await batch.commit();

console.log(
  `${APPLY ? "Wrote" : "Would write"} ${planned} snapshot(s); ${skipped} already existed (left as is).`
);
