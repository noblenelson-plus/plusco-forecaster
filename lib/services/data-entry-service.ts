// lib/services/data-entry-service.ts

/**
 * Service Firestore — collection "data_entries".
 *
 * Un document par triplet {client, année, RFQ} (voir forecaster.types.ts).
 * Toutes les écritures d'axe passent par le dot-path "axes.{axisId}" :
 * sauvegarder l'axe Media ne touche jamais Revenue ni Labs, même si les
 * trois vivent dans le même document.
 *
 * Stratégie V1 (Save explicite) :
 *   1. fetchDataEntry() au montage du grid (+ fetch du RFQ de comparaison)
 *   2. édition locale (dirty map dans use-forecaster-grid)
 *   3. saveAxisData() au clic sur Save — un seul write, axe complet
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { RFQType } from "../types/rfq.types";
import {
  type AxisData,
  type AxisId,
  type DataEntry,
  buildDataEntryId,
  emptyAxisData,
} from "../types/forecaster.types";

const COLLECTION = "data_entries";

// ─── Lecture ──────────────────────────────────────────────────────────────────

/**
 * Récupère le document d'un triplet {client, année, RFQ}.
 * Retourne null s'il n'existe pas encore (aucune saisie faite) —
 * c'est un cas normal, pas une erreur.
 */
export async function fetchDataEntry(
  clientId: string,
  year: number,
  rfq: RFQType
): Promise<DataEntry | null> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (!snapshot.exists()) return null;
  return {
    entry_id: snapshot.id,
    ...(snapshot.data() as Omit<DataEntry, "entry_id">),
  };
}

/**
 * Données d'un axe pour un triplet donné — toujours un AxisData utilisable.
 * Si le document ou l'axe n'existe pas, retourne un AxisData vide :
 * le grid n'a jamais à gérer null.
 */
export async function fetchAxisData(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId
): Promise<AxisData> {
  const entry = await fetchDataEntry(clientId, year, rfq);
  return normalizeAxisData(entry?.axes?.[axisId]);
}

/**
 * Coerce a raw stored axis into a usable AxisData.
 * Legacy docs stored `actuals` as a single MonthlyMap (no media type); that
 * shape is no longer supported, so a non-array `actuals` is ignored (→ []).
 */
function normalizeAxisData(raw: Partial<AxisData> | undefined): AxisData {
  if (!raw) return emptyAxisData();
  return {
    buckets: Array.isArray(raw.buckets) ? raw.buckets : [],
    actuals: Array.isArray(raw.actuals) ? raw.actuals : [],
  };
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

/**
 * Sauvegarde l'axe complet d'un triplet — crée le document au premier Save.
 *
 * setDoc + merge plutôt que updateDoc : pas besoin de savoir si le doc
 * existe déjà, et seuls les champs fournis sont écrits. Le dot-path est
 * exprimé via un objet imbriqué { axes: { [axisId]: ... } } qui, avec
 * merge:true, fusionne au niveau des clés sans écraser les autres axes.
 */
export async function saveAxisData(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId,
  data: AxisData,
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();

  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: data },
      updatedAt: now,
      // createdAt n'est posé qu'à la création — merge ne l'écrase pas
      // s'il existe, mais pour éviter de le réécrire à chaque Save on
      // l'ajoute seulement via mergeFields implicite : ici on accepte
      // qu'il soit mis à jour au premier Save uniquement si absent.
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );

  // createdAt : posé une seule fois, après coup, seulement s'il manque.
  // Lecture légère (le doc vient d'être écrit, il est en cache local).
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (snapshot.exists() && !snapshot.data().createdAt) {
    await updateDoc(doc(db, COLLECTION, entryId), { createdAt: now });
  }
}

/**
 * Met à jour SEULEMENT les actuals d'un axe (ADMIN_INPUT).
 * Compatible avec une future security rule qui n'autoriserait que les
 * admins à toucher "axes.{axisId}.actuals".
 */
export async function saveAxisActuals(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId,
  actuals: AxisData["actuals"],
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: { actuals } },
      updatedAt: new Date().toISOString(),
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );
}