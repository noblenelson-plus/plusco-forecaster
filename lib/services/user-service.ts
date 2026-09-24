// lib/user-service.ts

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "../firebase";
import { resolveAgenciesForEmail } from "./agency-service";
import { getInviteForEmail, deleteInvite } from "./invite-service";

// Single source of truth for the role union lives in user.types.ts; re-exported
// here for the many call sites importing it from the user service.
export type { UserRole } from "../types/user.types";
import type { UserRole } from "../types/user.types";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  assignedClients: string[];
  // Agency-scoped access — see AppUser.assignedAgencies. Optional: absent on
  // pre-migration docs, treated as "no agency access".
  assignedAgencies?: string[];
  // When true, access is revoked: the user is blocked at the layout gate even
  // if their domain would otherwise grant agency access. Reversible by an admin.
  disabled?: boolean;
  createdAt: unknown; // Firestore ServerTimestamp
  lastLoginAt: unknown; // Firestore ServerTimestamp
}

/**
 * Ensures a Firestore user profile document exists for the given Firebase Auth user.
 * - If the document doesn't exist, creates it. Role + client assignments come
 *   from a matching pending invite (if any); otherwise the default VIEWER. The
 *   email domain seeds agency access either way (a company-wide domain grants
 *   all). An unmatched domain and no invite leaves the user on the "access
 *   pending" screen until an admin acts. A consumed invite is then deleted.
 * - If it exists, updates lastLoginAt without overwriting existing fields.
 * - Returns the final profile data.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    // First login — match the email domain to one or more agencies for
    // automatic, read-only agency-employee access.
    const email = user.email ?? "";
    const agencies = email ? await resolveAgenciesForEmail(email) : [];
    // A pending invite pre-provisions the role and (for BLs) client access.
    const invite = email ? await getInviteForEmail(email) : null;

    const newProfile: Omit<UserProfile, "uid"> = {
      email,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      role: invite?.role ?? "VIEWER",
      assignedClients: invite?.assignedClients ?? [],
      assignedAgencies: agencies,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(userRef, newProfile);
    console.log("Created new user profile for:", user.email);

    // Consume the invite — best effort; a failure here must not block login.
    if (invite) {
      try {
        await deleteInvite(email);
      } catch (err) {
        console.warn("Could not delete consumed invite:", err);
      }
    }

    return { uid: user.uid, ...newProfile };
  }

  // Existing user — update lastLoginAt only. Agencies are NOT re-synced here:
  // Firestore rules reserve `assignedAgencies` writes to admins, so a non-admin
  // writing their own would be denied. Re-syncing from the domain happens on
  // admin actions instead (role change, or the "Sync agencies" admin action).
  await setDoc(
    userRef,
    { lastLoginAt: serverTimestamp() },
    { merge: true }
  );

  return { uid: user.uid, ...(snapshot.data() as Omit<UserProfile, "uid">) };
}

/**
 * Revokes or restores a user's access (admin-only). A disabled user is blocked
 * at the layout gate regardless of any domain-granted agency access.
 */
export async function setUserDisabled(
  uid: string,
  disabled: boolean
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { disabled });
}