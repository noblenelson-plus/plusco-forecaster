// lib/services/labs-partner-service.ts

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { LabsPartner } from "../types/labs.types";
import type { MediaType } from "../types/common.types";

const COLLECTION = "labs_partners";

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all LABS partners in real time, ordered by year (desc) then name.
 * Grouping by year is done in-memory by the caller.
 */
export function subscribeToLabsPartners(
  onData: (partners: LabsPartner[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // No server-side orderBy: ordering by two distinct fields would force a
  // composite index. The collection is tiny and the caller already groups
  // by year in memory, so we sort the snapshot here instead.
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const partners = snap.docs.map((d) => ({
        partnerId: d.id,
        ...(d.data() as Omit<LabsPartner, "partnerId">),
      }));
      partners.sort(
        (a, b) => b.year - a.year || a.name.localeCompare(b.name)
      );
      onData(partners);
    },
    (err) => onError?.(err)
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface CreateLabsPartnerInput {
  year: number;
  name: string;
  mediaType: MediaType;
  description?: string;
}

/**
 * Create a new LABS partner with an auto-generated document ID.
 * Throws if a partner with the same {year, case-insensitive name}
 * already exists, to prevent accidental duplicates.
 */
export async function createLabsPartner(
  input: CreateLabsPartnerInput
): Promise<LabsPartner> {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Partner name is required.");

  // Uniqueness check — Firestore equality is case-sensitive, so we fetch
  // all partners for the year and compare in memory (case-insensitive).
  const existingSnap = await getDocs(
    query(collection(db, COLLECTION), where("year", "==", input.year))
  );
  const lowered = trimmedName.toLowerCase();
  const duplicate = existingSnap.docs.some(
    (d) => String(d.data().name ?? "").trim().toLowerCase() === lowered
  );
  if (duplicate) {
    throw new Error(
      `A partner named "${trimmedName}" already exists for ${input.year}.`
    );
  }

  const payload: Record<string, unknown> = {
    name: trimmedName,
    year: input.year,
    mediaType: input.mediaType,
  };
  const description = input.description?.trim();
  if (description) payload.description = description;

  const ref = await addDoc(collection(db, COLLECTION), payload);

  return {
    partnerId: ref.id,
    name: trimmedName,
    year: input.year,
    mediaType: input.mediaType,
    ...(description ? { description } : {}),
  };
}

export async function deleteLabsPartner(partnerId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, partnerId));
}

// ─── In-memory helpers ────────────────────────────────────────────────────────

/** Unique sorted list of years present in the partner list (most recent first). */
export function getLabsPartnerYears(partners: LabsPartner[]): number[] {
  return Array.from(new Set(partners.map((p) => p.year))).sort((a, b) => b - a);
}

/** Filter partners belonging to a given year. */
export function getLabsPartnersForYear(
  partners: LabsPartner[],
  year: number
): LabsPartner[] {
  return partners.filter((p) => p.year === year);
}