// lib/services/rfq-service.ts

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  RFQ,
  RFQFormData,
  RFQStatus,
  buildRFQId,
  sortRFQs,
} from "../types/rfq.types";
import type { AxisId } from "../types/forecaster.types";

const COLLECTION = "rfqs";

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Récupère tous les RFQs (one-shot), triés année desc puis type. */
export async function fetchRFQs(): Promise<RFQ[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  const rfqs = snapshot.docs.map((d) => ({
    rfq_id: d.id,
    ...(d.data() as Omit<RFQ, "rfq_id">),
  }));
  return sortRFQs(rfqs);
}

/**
 * Abonnement temps réel à la collection rfqs.
 * Utilisé par les sélecteurs de la nav pour refléter instantanément
 * les changements de statut (lock/unlock) faits par un admin.
 */
export function subscribeToRFQs(
  onChange: (rfqs: RFQ[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const rfqs = snapshot.docs.map((d) => ({
        rfq_id: d.id,
        ...(d.data() as Omit<RFQ, "rfq_id">),
      }));
      onChange(sortRFQs(rfqs));
    },
    (error) => {
      console.error("Error listening to RFQs:", error);
      onError?.(error);
    }
  );
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Crée un RFQ. L'ID est dérivé de l'année + type ({year}_{type}),
 * ce qui garantit l'unicité — une création sur un couple existant
 * lèverait une collision, donc on vérifie d'abord côté appelant
 * (la page admin filtre les types déjà existants pour l'année).
 */
export async function createRFQ(formData: RFQFormData): Promise<RFQ> {
  const rfq_id = buildRFQId(formData.year, formData.type);
  const now = new Date().toISOString();
  const payload = {
    year: formData.year,
    type: formData.type,
    status: formData.status,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, COLLECTION, rfq_id), payload);
  return { rfq_id, ...payload };
}

// ─── Update ───────────────────────────────────────────────────────────────────

/** Bascule ou force le statut d'un RFQ (LOCKED / UNLOCKED). */
export async function updateRFQStatus(
  rfq_id: string,
  status: RFQStatus
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, rfq_id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Sets the closed months (1–12) for one axis of an RFQ. Writes the full
 * per-axis array so toggling a single month replaces that axis's set; the
 * other axes are left untouched (dotted field path update).
 */
export async function updateRFQAxisClosedMonths(
  rfq_id: string,
  axisId: AxisId,
  months: number[]
): Promise<void> {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  await updateDoc(doc(db, COLLECTION, rfq_id), {
    [`closedMonths.${axisId}`]: sorted,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Supprime un RFQ.
 * ⚠️ Ne supprime PAS les data_entries associées — à confirmer plus tard
 * si un nettoyage en cascade est souhaité.
 */
export async function deleteRFQ(rfq_id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, rfq_id));
}

// ─── Helpers dérivés ──────────────────────────────────────────────────────────

/** Liste des années distinctes présentes dans les RFQs, décroissante. */
export function getRFQYears(rfqs: RFQ[]): number[] {
  return [...new Set(rfqs.map((r) => r.year))].sort((a, b) => b - a);
}

/** RFQs d'une année donnée, dans l'ordre RFQ0 → FINAL. */
export function getRFQsForYear(rfqs: RFQ[], year: number): RFQ[] {
  return rfqs.filter((r) => r.year === year);
}