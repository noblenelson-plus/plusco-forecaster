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
import { RFQ_TYPE_ORDER, buildRFQId } from "../types/rfq.types";
import type { MediaType, MonthlyMap } from "../types/common.types";
import {
  type AxisData,
  type AxisId,
  type AxisMeta,
  type DataEntry,
  buildDataEntryId,
  emptyAxisData,
  REVENUE_COMMISSION_TYPE,
} from "../types/forecaster.types";
import {
  computeCommission,
  ensureRevenueShape,
} from "../format/revenue-commission";

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

/**
 * Axis data + its per-side "last updated" stamps for a triplet, in a single
 * read. Used by the grid, which displays when BL_INPUT and ADMIN_INPUT were
 * last saved. For axes whose actuals live in the annual doc (Media, Labs), only
 * the BL stamp here is meaningful — the actuals stamp comes from that doc.
 */
export async function fetchAxisDataWithMeta(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId
): Promise<{ data: AxisData; meta: AxisMeta }> {
  const entry = await fetchDataEntry(clientId, year, rfq);
  return {
    data: normalizeAxisData(entry?.axes?.[axisId]),
    meta: entry?.axisMeta?.[axisId] ?? {},
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
  userUid?: string,
  /**
   * Which sides this write touched, for the per-side "last updated" stamps.
   * Defaults to BL only (the common path); callers that also write actuals in
   * the same doc (Revenue's GAIA) pass touchedActuals explicitly. A side left
   * out keeps its previous stamp (deep merge).
   */
  opts?: { touchedBL?: boolean; touchedActuals?: boolean }
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();

  const touchedBL = opts?.touchedBL ?? true;
  const touchedActuals = opts?.touchedActuals ?? false;
  const meta: AxisMeta = {};
  if (touchedBL) meta.blUpdatedAt = now;
  if (touchedActuals) meta.actualsUpdatedAt = now;

  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: data },
      updatedAt: now,
      ...(Object.keys(meta).length ? { axisMeta: { [axisId]: meta } } : {}),
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );

  // createdAt: set once, after the fact, only if missing. The doc was just
  // written so this read hits the local cache.
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (snapshot.exists() && !snapshot.data().createdAt) {
    await updateDoc(doc(db, COLLECTION, entryId), { createdAt: now });
  }
}

// ─── Revenue commission sync (derived from Media + rates) ────────────────────

/**
 * Recomputes the Revenue Commission row from the persisted Media forecast and
 * the given commission rates, and writes it to Firestore — preserving the other
 * revenue streams (their stored values are re-read and kept). Used to keep the
 * commission in sync whenever Media is saved or the client's rates change.
 *
 * `yearRates` is the `commissionsConfig[year]` slice (passed in so this stays
 * decoupled from the clients collection).
 */
export async function syncRevenueCommission(
  clientId: string,
  year: number,
  rfq: RFQType,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined,
  userUid?: string
): Promise<void> {
  const media = await fetchAxisData(clientId, year, rfq, "media");
  const revenue = ensureRevenueShape(
    await fetchAxisData(clientId, year, rfq, "revenue")
  );
  const { months } = computeCommission(media, yearRates);
  const row = revenue.buckets[0]?.rows.find(
    (r) => r.rowType === REVENUE_COMMISSION_TYPE
  );
  if (row) row.months = months;
  await saveAxisData(clientId, year, rfq, "revenue", revenue, userUid);
}

/**
 * Propagates a commission-rate change across every RFQ of a (client, year):
 * recomputes and writes the Revenue Commission for each existing submission.
 * RFQs with no submission are skipped (nothing to sync), and LOCKED RFQs are
 * skipped — a locked submission is a frozen snapshot and must not be rewritten.
 */
export async function propagateCommissionForYear(
  clientId: string,
  year: number,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined,
  userUid?: string
): Promise<void> {
  const types = (Object.keys(RFQ_TYPE_ORDER) as RFQType[]).sort(
    (a, b) => RFQ_TYPE_ORDER[a] - RFQ_TYPE_ORDER[b]
  );
  for (const type of types) {
    const entry = await fetchDataEntry(clientId, year, type);
    if (!entry) continue; // no submission for this RFQ — nothing to sync
    const rfqSnap = await getDoc(doc(db, "rfqs", buildRFQId(year, type)));
    if (rfqSnap.exists() && rfqSnap.data().status === "LOCKED") continue;
    await syncRevenueCommission(clientId, year, type, yearRates, userUid);
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
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: { actuals } },
      updatedAt: now,
      axisMeta: { [axisId]: { actualsUpdatedAt: now } },
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );
}