// lib/services/resource-service.ts

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Resource, ResourceFormData } from "../types/resource.types";

const COLLECTION = "resources";

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all resources in real time, ordered oldest-first (by createdAt).
 * The collection is tiny, so we sort in memory rather than force a server index.
 */
export function subscribeToResources(
  onData: (resources: Resource[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const resources = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Resource, "id">),
      }));
      resources.sort(
        (a, b) =>
          (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.name.localeCompare(b.name)
      );
      onData(resources);
    },
    (err) => onError?.(err)
  );
}

// ─── Writes (admin-only; enforced by Firestore rules) ───────────────────────────

/** Trim + validate a resource form; throws on missing name/url. */
function normalize(input: ResourceFormData): {
  name: string;
  url: string;
  description: string;
} {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name) throw new Error("Name is required.");
  if (!url) throw new Error("Link is required.");
  return { name, url, description: input.description.trim() };
}

export async function createResource(
  input: ResourceFormData
): Promise<void> {
  const { name, url, description } = normalize(input);
  const payload: Record<string, unknown> = {
    name,
    url,
    createdAt: Date.now(),
  };
  if (description) payload.description = description;
  await addDoc(collection(db, COLLECTION), payload);
}

export async function updateResource(
  id: string,
  input: ResourceFormData
): Promise<void> {
  const { name, url, description } = normalize(input);
  await updateDoc(doc(db, COLLECTION, id), {
    name,
    url,
    // An empty description clears the field rather than storing "".
    description: description ? description : deleteField(),
  });
}

export async function deleteResource(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
