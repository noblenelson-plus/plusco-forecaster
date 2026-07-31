// scripts/backfill-bl-validation.mjs
//
// Backfill « BL Forecast Validation » — coche les étapes de validation jusqu'à
// un jalon donné (par défaut RFQ2) pour tous les clients d'une année.
//
// Contexte
// --------
// La « BL Forecast Validation » est une check-list de jalons (voir
// lib/constants/confirmation-steps.ts) stockée par {client, année} dans la
// collection `forecast_validations` (doc id = `{cl_id}_{année}`, champ `steps`).
// Ordre des jalons :
//   rfq0, mqv-2027q1, rfq1, mqv-2027q2, rfq2, mqv-2027q3, rfq3, mqv-2027q4
// « Jusqu'à RFQ2 » = toutes les cases jusqu'à `rfq2` inclus, soit :
//   [rfq0, mqv-2027q1, rfq1, mqv-2027q2, rfq2]
//
// Sûreté
// ------
//   - DRY-RUN par défaut : aucune écriture tant que `--apply` n'est pas passé.
//   - ADDITIF (union) : on FUSIONNE avec les steps déjà présents. On ne décoche
//     JAMAIS une case existante (un client déjà à rfq3 garde rfq3).
//   - Écrit la même forme de document que l'app (forecast-validation-service.ts) :
//     { clientId, year, steps (triés/dédupliqués), meta:{updatedAt,updatedBy}, updatedAt },
//     via setDoc(..., { merge:true }).
//
// Identifiants (ÉCRITURE sur le projet Forecaster `pluscoops`)
// ------------------------------------------------------------
//   - Par défaut : ADC gcloud (applicationDefault). Ton compte doit avoir les
//     droits d'ÉCRITURE Firestore sur `pluscoops` (`gcloud auth application-default login`).
//   - Ou une clé de service pluscoops : FORECASTER_SA=/chemin/vers/sa.json
//
// Usage
// -----
//   node scripts/backfill-bl-validation.mjs                  # DRY-RUN, jusqu'à rfq2, année courante
//   node scripts/backfill-bl-validation.mjs --apply          # applique
//   node scripts/backfill-bl-validation.mjs --up-to=rfq3     # change le jalon plafond
//   node scripts/backfill-bl-validation.mjs --year=2026      # force l'année
//   node scripts/backfill-bl-validation.mjs --client=CL_ABC  # un seul cl_id
//   node scripts/backfill-bl-validation.mjs --only-mapped    # seulement les clients avec CL_MediaBox_IDs

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─── Arguments ─────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const ONLY_MAPPED = process.argv.includes("--only-mapped");
const yearArg = (process.argv.find((a) => a.startsWith("--year=")) || "").split("=")[1];
const clientArg = (process.argv.find((a) => a.startsWith("--client=")) || "").split("=")[1] || null;
const upToArg = (process.argv.find((a) => a.startsWith("--up-to=")) || "").split("=")[1] || "rfq2";
const YEAR = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear();

// ─── Jalons (doit rester synchro avec lib/constants/confirmation-steps.ts) ─────
const CONFIRMATION_STEP_IDS = [
  "rfq0",
  "mqv-2027q1",
  "rfq1",
  "mqv-2027q2",
  "rfq2",
  "mqv-2027q3",
  "rfq3",
  "mqv-2027q4",
];

const cutoffIndex = CONFIRMATION_STEP_IDS.indexOf(upToArg);
if (cutoffIndex === -1) {
  console.error(
    `--up-to invalide: "${upToArg}". Valeurs possibles: ${CONFIRMATION_STEP_IDS.join(", ")}`
  );
  process.exit(1);
}
const TARGET_STEPS = CONFIRMATION_STEP_IDS.slice(0, cutoffIndex + 1);
const UPDATED_BY = "script:backfill-bl-validation";

// ─── Initialisation Firebase (pluscoops) ───────────────────────────────────────
const credential = process.env.FORECASTER_SA
  ? cert(require(process.env.FORECASTER_SA))
  : applicationDefault();
const app = initializeApp({ credential, projectId: "pluscoops" }, "forecaster");
const db = getFirestore(app);

// ─── Helpers ───────────────────────────────────────────────────────────────────
function normalizeSteps(raw) {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((s) => typeof s === "string"))].sort()
    : [];
}

// ─── Programme principal ────────────────────────────────────────────────────────
async function main() {
  console.log("─".repeat(78));
  console.log("Backfill BL Forecast Validation");
  console.log(`Année: ${YEAR}   Mode: ${APPLY ? "APPLY (écriture)" : "DRY-RUN (aucune écriture)"}`);
  console.log(`Cible: cocher jusqu'à "${upToArg}" → [${TARGET_STEPS.join(", ")}]`);
  if (clientArg) console.log(`Filtre client: ${clientArg}`);
  if (ONLY_MAPPED) console.log("Filtre: uniquement les clients avec CL_MediaBox_IDs");
  console.log("Comportement: ADDITIF (union avec l'existant, aucune case décochée)");
  console.log("─".repeat(78));

  let clientDocs = (await db.collection("clients").get()).docs;
  if (clientArg) clientDocs = clientDocs.filter((d) => d.id === clientArg);
  if (ONLY_MAPPED) {
    clientDocs = clientDocs.filter((d) => {
      const ids = d.data().CL_MediaBox_IDs;
      return Array.isArray(ids) && ids.some((x) => typeof x === "string" && x.trim());
    });
  }

  if (clientDocs.length === 0) {
    console.error("Aucun client à traiter (vérifie l'accès à pluscoops / les filtres).");
    process.exit(1);
  }

  const toWrite = []; // { clId, name, before, after, added }
  let unchanged = 0;

  for (const doc of clientDocs) {
    const clId = doc.id;
    const name = doc.data().CL_Name || clId;

    const valSnap = await db.doc(`forecast_validations/${clId}_${YEAR}`).get();
    const before = normalizeSteps(valSnap.exists ? valSnap.data().steps : []);

    const after = [...new Set([...before, ...TARGET_STEPS])].sort();
    const added = after.filter((s) => !before.includes(s));

    if (added.length === 0) {
      unchanged++;
      continue;
    }
    toWrite.push({ clId, name, before, after, added });
  }

  // ─── Rapport ─────────────────────────────────────────────────────────────────
  console.log(`\n### À mettre à jour (${toWrite.length})   |   Déjà OK: ${unchanged}\n`);
  for (const w of toWrite) {
    console.log(
      `  ${w.name}  [${w.clId}]  +[${w.added.join(", ")}]` +
        (w.before.length ? `   (avait: [${w.before.join(", ")}])` : "   (nouveau doc)")
    );
  }

  if (!APPLY) {
    console.log(`\n${"─".repeat(78)}`);
    console.log("DRY-RUN terminé. Relance avec --apply pour écrire.");
    console.log("─".repeat(78));
    return;
  }

  console.log(`\n${"─".repeat(78)}\nApplication des écritures...`);
  let ok = 0;
  let fail = 0;
  const now = new Date().toISOString();
  for (const w of toWrite) {
    try {
      await db.doc(`forecast_validations/${w.clId}_${YEAR}`).set(
        {
          clientId: w.clId,
          year: YEAR,
          steps: w.after,
          meta: { updatedAt: now, updatedBy: UPDATED_BY },
          updatedAt: now,
        },
        { merge: true }
      );
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ✗ ${w.name} [${w.clId}]: ${e.message}`);
    }
  }
  console.log(`\nTerminé. ${ok} écriture(s) réussie(s), ${fail} échec(s).`);
  console.log("─".repeat(78));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nErreur fatale:", err);
    process.exit(1);
  });
