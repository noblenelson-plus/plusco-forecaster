// lib/services/assignment-service.ts

import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";
import { UserProfile } from "./user-service";
import type { Client } from "../types/client.types";

/**
 * User ↔ client assignment service.
 *
 * Single source of truth: the `assignedClients` (string[]) field on `users`
 * documents, plus `assignedAgencies` (string[]) for agency-scoped access. No
 * duplication on the `clients` side, so nothing can desync.
 *
 * The list of users with access to a client is computed by in-memory
 * inversion (see getUsersForClient) — trivial at the target scale (~200
 * clients, a few dozen users).
 *
 * A user's *effective* accessible clients = explicitly assigned clients ∪
 * every client whose CL_Agency is in `assignedAgencies` (auto-including
 * clients added to those agencies later). See fetchAccessibleClients.
 */

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Ajoute un ou plusieurs clients aux assignations d'un utilisateur.
 * Utilise arrayUnion → idempotent, pas de doublons.
 */
export async function assignClientsToUser(
  uid: string,
  clIds: string[]
): Promise<void> {
  if (clIds.length === 0) return;
  await updateDoc(doc(db, "users", uid), {
    assignedClients: arrayUnion(...clIds),
  });
}

/**
 * Retire un ou plusieurs clients des assignations d'un utilisateur.
 * Utilise arrayRemove → idempotent.
 */
export async function removeClientsFromUser(
  uid: string,
  clIds: string[]
): Promise<void> {
  if (clIds.length === 0) return;
  await updateDoc(doc(db, "users", uid), {
    assignedClients: arrayRemove(...clIds),
  });
}

/**
 * Replaces a user's entire assignment list.
 * Used by the "bulk assign" drawer (a single Save for N changes).
 */
export async function setUserAssignments(
  uid: string,
  clIds: string[]
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    assignedClients: clIds,
  });
}

/**
 * Replaces a user's full access in one write: explicit clients + agencies.
 * Used by the bulk assignment drawer, which edits both at once.
 */
export async function setUserAccess(
  uid: string,
  clIds: string[],
  agencies: string[]
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    assignedClients: clIds,
    assignedAgencies: agencies,
  });
}

// ─── Effective accessible clients ─────────────────────────────────────────────

// Firestore caps "in" queries at 30 values — batch when needed.
const IN_QUERY_LIMIT = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toClient(d: { id: string; data: () => unknown }): Client {
  return { cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) };
}

/**
 * Fetches the full client docs a user may access, scoped by role:
 *   - ADMIN         → every client
 *   - BUSINESS_LEAD → assignedClients ∪ every client of an assignedAgency
 *
 * Returns raw docs (hidden clients included, sorted by name) — callers apply
 * their own hidden-client filtering, which differs by surface (admins keep
 * hidden clients on the Clients page). Deduplicates clients reachable through
 * both an explicit assignment and an agency.
 *
 * Centralizes the role-scoped fetch previously hand-rolled in
 * use-accessible-clients, forecast-selectors and the Clients page.
 */
export async function fetchAccessibleClients(
  profile: Pick<UserProfile, "assignedClients" | "assignedAgencies"> | null,
  isAdmin: boolean
): Promise<Client[]> {
  const byName = (a: Client, b: Client) => a.CL_Name.localeCompare(b.CL_Name);

  if (isAdmin) {
    const snap = await getDocs(collection(db, "clients"));
    return snap.docs.map(toClient).sort(byName);
  }

  if (!profile) return [];

  const assigned = profile.assignedClients ?? [];
  const agencies = profile.assignedAgencies ?? [];

  const queries = [
    // Explicitly assigned clients, batched on document id.
    ...chunk(assigned, IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(collection(db, "clients"), where("__name__", "in", ids)))
    ),
    // Every client belonging to an assigned agency (auto-includes future ones).
    ...chunk(agencies, IN_QUERY_LIMIT).map((ags) =>
      getDocs(query(collection(db, "clients"), where("CL_Agency", "in", ags)))
    ),
  ];

  if (queries.length === 0) return [];

  const snapshots = await Promise.all(queries);
  // Dedupe by id — a client can be reached via both paths.
  const byId = new Map<string, Client>();
  snapshots.forEach((s) => s.docs.forEach((d) => byId.set(d.id, toClient(d))));
  return [...byId.values()].sort(byName);
}

// ─── Lectures / helpers (en mémoire, pas de requête Firestore) ────────────────

/**
 * Inverse la relation : retourne tous les utilisateurs ayant accès
 * à un client donné.
 *
 * @param users Liste complète des users (déjà chargée, ex. page admin)
 * @param clId  ID du client ciblé
 */
export function getUsersForClient(
  users: UserProfile[],
  clId: string
): UserProfile[] {
  return users.filter((u) => (u.assignedClients ?? []).includes(clId));
}

/**
 * Retourne les utilisateurs n'ayant PAS accès au client — utile pour
 * alimenter le combobox "Add person" sans proposer de doublons.
 */
export function getUsersNotOnClient(
  users: UserProfile[],
  clId: string
): UserProfile[] {
  return users.filter((u) => !(u.assignedClients ?? []).includes(clId));
}

/**
 * Calcule le diff entre l'état initial et l'état édité d'une liste
 * d'assignations — pour afficher "+3 / −1" dans l'UI avant Save.
 */
export function diffAssignments(
  initial: string[],
  edited: string[]
): { added: string[]; removed: string[]; hasChanges: boolean } {
  const initialSet = new Set(initial);
  const editedSet = new Set(edited);
  const added = edited.filter((id) => !initialSet.has(id));
  const removed = initial.filter((id) => !editedSet.has(id));
  return { added, removed, hasChanges: added.length > 0 || removed.length > 0 };
}