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
import type { UserProfile } from "./user-service";
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
 * Adds one or more clients to a user's assignments.
 * Uses arrayUnion → idempotent, no duplicates.
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
 * Removes one or more clients from a user's assignments.
 * Uses arrayRemove → idempotent.
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
 * Replaces a user's explicit client assignments (write grants for a Business
 * Lead). `assignedAgencies` is intentionally left untouched — it is derived
 * from the user's email domain at sign-in, not edited by hand.
 */
export async function setUserAssignments(
  uid: string,
  clIds: string[]
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    assignedClients: clIds,
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

// ─── Write scope (client-side mirror of the Firestore `canWriteClient` rule) ──

/**
 * Whether the current user may WRITE a client's data (forecast, milestones,
 * flags). Mirrors the `canWriteClient` function in firestoreRules.txt so the UI
 * can hide/skip clients a batch write would be rejected for:
 *   - ADMIN → every client.
 *   - EXEC  → every client of an assigned agency (agency-wide) or an explicit
 *             grant.
 *   - BL    → only explicitly assigned clients (never agency-wide).
 *   - VIEWER (or no profile) → none.
 *
 * Read scope is broader (assigned ∪ agency for everyone) — this is strictly the
 * write subset. The real enforcement stays in the Firestore rules; this only
 * prevents a doomed write from being attempted.
 */
export function canWriteClient(
  client: Pick<Client, "cl_id" | "CL_Agency">,
  profile: Pick<UserProfile, "role" | "assignedClients" | "assignedAgencies"> | null,
  isAdmin: boolean
): boolean {
  if (isAdmin || profile?.role === "ADMIN") return true;
  if (!profile) return false;

  const assigned = new Set(profile.assignedClients ?? []);
  const agencies = new Set(profile.assignedAgencies ?? []);

  if (profile.role === "EXEC") {
    return assigned.has(client.cl_id) || agencies.has(client.CL_Agency);
  }
  if (profile.role === "BUSINESS_LEAD") {
    return assigned.has(client.cl_id);
  }
  return false; // VIEWER — read-only
}

/** The subset of `clients` the current user may write to (see canWriteClient). */
export function filterWritableClients(
  clients: Client[],
  profile: Pick<UserProfile, "role" | "assignedClients" | "assignedAgencies"> | null,
  isAdmin: boolean
): Client[] {
  return clients.filter((c) => canWriteClient(c, profile, isAdmin));
}

// ─── Reads / helpers (in memory, no Firestore query) ──────────────────────────

/**
 * Inverts the relation: returns every user with access to a given client.
 *
 * @param users Full user list (already loaded, e.g. the admin page)
 * @param clId  Target client id
 */
export function getUsersForClient(
  users: UserProfile[],
  clId: string
): UserProfile[] {
  return users.filter((u) => (u.assignedClients ?? []).includes(clId));
}

/**
 * Returns the users who do NOT have access to the client — used to populate
 * the "Add person" combobox without offering duplicates.
 */
export function getUsersNotOnClient(
  users: UserProfile[],
  clId: string
): UserProfile[] {
  return users.filter((u) => !(u.assignedClients ?? []).includes(clId));
}

/**
 * Computes the diff between the initial and edited assignment lists — to show
 * "+3 / −1" in the UI before Save.
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