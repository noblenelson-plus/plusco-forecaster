// lib/services/labs-partner-service.ts

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  deleteField,
  updateDoc,
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

/**
 * Identity used for duplicate detection within a year: two partners are "the
 * same" only when their {name, mediaType, description} match (case-insensitive,
 * trimmed). Same name + media type with a different description is allowed.
 */
function partnerIdentityKey(
  name: string,
  mediaType: string,
  description: string
): string {
  return `${name.trim().toLowerCase()}|${mediaType}|${description
    .trim()
    .toLowerCase()}`;
}

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

/**
 * One-shot read of every LABS partner (no subscription). Used by batch jobs
 * such as the Report Center, which need the partner → media-type mapping once.
 */
export async function fetchLabsPartners(): Promise<LabsPartner[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({
    partnerId: d.id,
    ...(d.data() as Omit<LabsPartner, "partnerId">),
  }));
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface CreateLabsPartnerInput {
  year: number;
  name: string;
  mediaType: MediaType;
  description?: string;
  /** MediaBox publisher shortcode IDs that fall under this partner. */
  mediaboxPublisherIds?: string[];
}

/**
 * Create a new LABS partner with an auto-generated document ID.
 *
 * Two partners may share a name and media type as long as their descriptions
 * differ — the description disambiguates them in the forecast UI. Only a fully
 * identical partner ({year, name, mediaType, description}, case-insensitive) is
 * rejected, to prevent accidental exact duplicates.
 */
export async function createLabsPartner(
  input: CreateLabsPartnerInput
): Promise<LabsPartner> {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Partner name is required.");
  const description = input.description?.trim() ?? "";

  // Uniqueness check — Firestore equality is case-sensitive, so we fetch all
  // partners for the year and compare in memory (case-insensitive) on the
  // {name, mediaType, description} triple. Same name + media type with a
  // different description is allowed.
  const existingSnap = await getDocs(
    query(collection(db, COLLECTION), where("year", "==", input.year))
  );
  const newKey = partnerIdentityKey(trimmedName, input.mediaType, description);
  const duplicate = existingSnap.docs.some((d) => {
    const data = d.data();
    return (
      partnerIdentityKey(
        String(data.name ?? ""),
        String(data.mediaType ?? ""),
        String(data.description ?? "")
      ) === newKey
    );
  });
  if (duplicate) {
    throw new Error(
      `An identical partner "${trimmedName}" (${input.mediaType}${
        description ? `, "${description}"` : ""
      }) already exists for ${input.year}.`
    );
  }

  const payload: Record<string, unknown> = {
    name: trimmedName,
    year: input.year,
    mediaType: input.mediaType,
  };
  if (description) payload.description = description;
  const publisherIds = normalizePublisherIds(input.mediaboxPublisherIds);
  if (publisherIds.length) payload.mediaboxPublisherIds = publisherIds;

  const ref = await addDoc(collection(db, COLLECTION), payload);

  return {
    partnerId: ref.id,
    name: trimmedName,
    year: input.year,
    mediaType: input.mediaType,
    ...(description ? { description } : {}),
    ...(publisherIds.length ? { mediaboxPublisherIds: publisherIds } : {}),
  };
}

export interface UpdateLabsPartnerInput {
  name: string;
  mediaType: MediaType;
  description?: string;
}

/**
 * Edit a partner's name, media type and description. Enforces the same identity
 * uniqueness as creation ({year, name, mediaType, description}, case-insensitive)
 * within the partner's year, excluding the partner itself. An empty description
 * clears the field. MediaBox publisher IDs are managed separately by
 * updateLabsPartnerPublishers.
 */
export async function updateLabsPartner(
  partnerId: string,
  year: number,
  input: UpdateLabsPartnerInput
): Promise<void> {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Partner name is required.");
  const description = input.description?.trim() ?? "";

  const existingSnap = await getDocs(
    query(collection(db, COLLECTION), where("year", "==", year))
  );
  const newKey = partnerIdentityKey(trimmedName, input.mediaType, description);
  const duplicate = existingSnap.docs.some((d) => {
    if (d.id === partnerId) return false; // ignore the partner being edited
    const data = d.data();
    return (
      partnerIdentityKey(
        String(data.name ?? ""),
        String(data.mediaType ?? ""),
        String(data.description ?? "")
      ) === newKey
    );
  });
  if (duplicate) {
    throw new Error(
      `An identical partner "${trimmedName}" (${input.mediaType}${
        description ? `, "${description}"` : ""
      }) already exists for ${year}.`
    );
  }

  await updateDoc(doc(db, COLLECTION, partnerId), {
    name: trimmedName,
    mediaType: input.mediaType,
    description: description ? description : deleteField(),
  });
}

/**
 * Replace a partner's MediaBox publisher IDs. Always writes the field (even
 * empty) so de-selecting every publisher actually clears it — arrays are
 * replaced wholesale by Firestore, so no merge surprises here.
 */
export async function updateLabsPartnerPublishers(
  partnerId: string,
  mediaboxPublisherIds: string[]
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, partnerId), {
    mediaboxPublisherIds: normalizePublisherIds(mediaboxPublisherIds),
  });
}

/** Trim, drop empties, and de-duplicate a list of publisher shortcode IDs. */
function normalizePublisherIds(ids?: string[]): string[] {
  if (!ids) return [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (id) seen.add(id);
  }
  return Array.from(seen);
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