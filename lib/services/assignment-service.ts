// lib/services/assignment-service.ts

import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";
import { UserProfile } from "./user-service";

/**
 * Service d'assignation utilisateur ↔ client.
 *
 * Source de vérité unique : le champ `assignedClients` (string[]) sur les
 * documents de la collection `users`. Aucune duplication côté `clients`,
 * donc aucun risque de désynchronisation.
 *
 * La liste des utilisateurs ayant accès à un client se calcule par
 * inversion en mémoire (voir getUsersForClient) — trivial à l'échelle
 * visée (~200 clients, quelques dizaines d'users).
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
 * Remplace entièrement la liste d'assignations d'un utilisateur.
 * Utilisé par le drawer "bulk assign" (un seul Save pour N changements).
 */
export async function setUserAssignments(
  uid: string,
  clIds: string[]
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    assignedClients: clIds,
  });
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