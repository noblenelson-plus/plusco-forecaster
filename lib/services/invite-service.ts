// lib/services/invite-service.ts

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Invite } from "../types/invite.types";
import type { UserRole } from "../types/user.types";

/**
 * Pending-invite service (pre-provisioned access, keyed by lowercased email).
 * See invite.types.ts for the why. Consumed by ensureUserProfile at first login.
 */

const normEmail = (email: string) => email.trim().toLowerCase();

function toInvite(d: { id: string; data: () => unknown }): Invite {
  return { email: d.id, ...(d.data() as Omit<Invite, "email">) };
}

/** Every pending invite, sorted by email (admin-only list read). */
export async function fetchInvites(): Promise<Invite[]> {
  const snap = await getDocs(collection(db, "invites"));
  return snap.docs.map(toInvite).sort((a, b) => a.email.localeCompare(b.email));
}

/** Creates (or overwrites) an invite for an email. */
export async function createInvite(
  email: string,
  role: UserRole,
  assignedClients: string[] = [],
  createdBy?: string | null
): Promise<void> {
  const id = normEmail(email);
  await setDoc(doc(db, "invites", id), {
    email: id,
    role,
    assignedClients,
    createdBy: createdBy ?? null,
    createdAt: serverTimestamp(),
  });
}

/** Updates the pre-provisioned role of a pending invite. */
export async function updateInviteRole(
  email: string,
  role: UserRole
): Promise<void> {
  await updateDoc(doc(db, "invites", normEmail(email)), { role });
}

/** Updates the pre-provisioned client assignments of a pending invite. */
export async function updateInviteClients(
  email: string,
  assignedClients: string[]
): Promise<void> {
  await updateDoc(doc(db, "invites", normEmail(email)), { assignedClients });
}

/** Revokes a pending invite. */
export async function deleteInvite(email: string): Promise<void> {
  await deleteDoc(doc(db, "invites", normEmail(email)));
}

/**
 * Looks up the invite for an email (used at first sign-in). Returns null when
 * there is none.
 */
export async function getInviteForEmail(email: string): Promise<Invite | null> {
  const id = normEmail(email);
  const snap = await getDoc(doc(db, "invites", id));
  return snap.exists() ? toInvite({ id, data: () => snap.data() }) : null;
}
