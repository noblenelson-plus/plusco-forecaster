// scripts/unvalidate-milestones.mjs
//
// Resets the "Milestones" back to *not validated* — from RFQ0 up to a given
// milestone (default: Prelim RFQ3), for every client, for one year. This is the
// exact inverse of validate-milestones.mjs.
//
// How "not validated" is stored
// -----------------------------
// A milestone has no explicit "not_validated" record: the status is derived from
// the ABSENCE of a stepValidations.{stepId} entry (see lib/flags/status.ts and
// forecast-validation-service.ts → clearStepValidation, which deletes the field).
// So un-validating a step = deleting stepValidations.{stepId} with FieldValue.delete().
//
// Milestones order (must stay in sync with lib/constants/confirmation-steps.ts):
//   rfq0, mqv-2027q1, rfq1, mqv-2027q2, rfq2, mqv-2027q3, rfq3, mqv-2027q4
//   (mqv-* ids back the "Prelim" milestones — historical ids, don't be fooled by 2027)
// "Up to Prelim RFQ3" (default here) = every step through `mqv-2027q3` inclusive:
//   [rfq0, mqv-2027q1, rfq1, mqv-2027q2, rfq2, mqv-2027q3]
//
// Safety
// ------
//   - DRY-RUN by default: nothing is written until you pass `--apply`.
//   - Only deletes the targeted steps' records; steps beyond the cutoff (rfq3,
//     mqv-2027q4) are never touched. The RFQ's stored flags on data_entries are
//     untouched (they are shared across steps), exactly like clearStepValidation.
//   - A step that is already absent is skipped (no write).
//
// Credentials (WRITES to Forecaster project `pluscoops`)
// ------------------------------------------------------
//   - Default: gcloud ADC (applicationDefault). Your account needs Firestore WRITE
//     on `pluscoops` (`gcloud auth application-default login`).
//   - Or a pluscoops service-account key: FORECASTER_SA=/path/to/sa.json
//
// Usage
// -----
//   node scripts/unvalidate-milestones.mjs                       # DRY-RUN, up to Prelim RFQ3, year 2026
//   node scripts/unvalidate-milestones.mjs --apply               # apply
//   node scripts/unvalidate-milestones.mjs --up-to=rfq3          # different cutoff milestone
//   node scripts/unvalidate-milestones.mjs --year=2026           # force the year
//   node scripts/unvalidate-milestones.mjs --client=CL_ABC       # a single cl_id
//   node scripts/unvalidate-milestones.mjs --include-hidden      # include CL_Hidden clients (skipped by default)

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─── Arguments ─────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const INCLUDE_HIDDEN = process.argv.includes("--include-hidden");
const yearArg = (process.argv.find((a) => a.startsWith("--year=")) || "").split("=")[1];
const clientArg = (process.argv.find((a) => a.startsWith("--client=")) || "").split("=")[1] || null;
const upToArg = (process.argv.find((a) => a.startsWith("--up-to=")) || "").split("=")[1] || "mqv-2027q3";
const YEAR = yearArg ? parseInt(yearArg, 10) : 2026;

// ─── Milestones (keep in sync with lib/constants/confirmation-steps.ts) ────────
const CONFIRMATION_STEPS = [
  { id: "rfq0", targetRfq: "RFQ0" },
  { id: "mqv-2027q1", targetRfq: "RFQ1" }, // Prelim RFQ1
  { id: "rfq1", targetRfq: "RFQ1" },
  { id: "mqv-2027q2", targetRfq: "RFQ2" }, // Prelim RFQ2
  { id: "rfq2", targetRfq: "RFQ2" },
  { id: "mqv-2027q3", targetRfq: "RFQ3" }, // Prelim RFQ3
  { id: "rfq3", targetRfq: "RFQ3" },
  { id: "mqv-2027q4", targetRfq: "FINAL" }, // Prelim FINAL
];
const STEP_IDS = CONFIRMATION_STEPS.map((s) => s.id);

const cutoffIndex = STEP_IDS.indexOf(upToArg);
if (cutoffIndex === -1) {
  console.error(`--up-to invalid: "${upToArg}". Allowed: ${STEP_IDS.join(", ")}`);
  process.exit(1);
}
const TARGET_STEPS = CONFIRMATION_STEPS.slice(0, cutoffIndex + 1);
const UPDATED_BY = "script:unvalidate-milestones";

// ─── Firebase init (pluscoops) ─────────────────────────────────────────────────
const credential = process.env.FORECASTER_SA
  ? cert(require(process.env.FORECASTER_SA))
  : applicationDefault();
const app = initializeApp({ credential, projectId: "pluscoops" }, "forecaster");
const db = getFirestore(app);

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("─".repeat(78));
  console.log("Un-validate Milestones (reset to 'not validated')");
  console.log(`Year: ${YEAR}   Mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);
  console.log(
    `Target: reset up to "${upToArg}" → [${TARGET_STEPS.map((s) => s.id).join(", ")}]`
  );
  if (clientArg) console.log(`Client filter: ${clientArg}`);
  console.log(
    `Hidden clients: ${INCLUDE_HIDDEN ? "INCLUDED" : "skipped (pass --include-hidden to include)"}`
  );
  console.log("Behavior: deletes the targeted stepValidations records; steps beyond cutoff untouched");
  console.log("─".repeat(78));

  let clientDocs = (await db.collection("clients").get()).docs;
  if (clientArg) clientDocs = clientDocs.filter((d) => d.id === clientArg);
  if (!INCLUDE_HIDDEN) clientDocs = clientDocs.filter((d) => d.data().CL_Hidden !== true);

  if (clientDocs.length === 0) {
    console.error("No clients to process (check pluscoops access / filters).");
    process.exit(1);
  }

  const toWrite = []; // { clId, name, stepIds: [...] }
  let unchanged = 0;

  for (const clientDoc of clientDocs) {
    const clId = clientDoc.id;
    const name = clientDoc.data().CL_Name || clId;

    const valSnap = await db.doc(`forecast_validations/${clId}_${YEAR}`).get();
    if (!valSnap.exists) {
      unchanged++;
      continue;
    }
    const existing = valSnap.data().stepValidations || {};

    // Only steps that currently HAVE a record need a delete.
    const stepsToClear = TARGET_STEPS.filter((s) => existing[s.id] !== undefined);

    if (stepsToClear.length === 0) {
      unchanged++;
      continue;
    }
    toWrite.push({ clId, name, stepIds: stepsToClear.map((s) => s.id) });
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  console.log(`\n### To reset (${toWrite.length})   |   Already OK: ${unchanged}\n`);
  for (const w of toWrite) {
    console.log(`  ${w.name}  [${w.clId}]  -[${w.stepIds.join(", ")}]`);
  }

  if (!APPLY) {
    console.log(`\n${"─".repeat(78)}`);
    console.log("DRY-RUN done. Re-run with --apply to write.");
    console.log("─".repeat(78));
    return;
  }

  console.log(`\n${"─".repeat(78)}\nApplying writes...`);
  let ok = 0;
  let fail = 0;
  const now = new Date().toISOString();
  for (const w of toWrite) {
    try {
      const ref = db.doc(`forecast_validations/${w.clId}_${YEAR}`);
      const update = { updatedAt: now, "meta.updatedBy": UPDATED_BY };
      for (const stepId of w.stepIds) {
        update[`stepValidations.${stepId}`] = FieldValue.delete();
      }
      await ref.update(update);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ✗ ${w.name} [${w.clId}]: ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} write(s) succeeded, ${fail} failure(s).`);
  console.log("─".repeat(78));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  });
