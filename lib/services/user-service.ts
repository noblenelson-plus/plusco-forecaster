// lib/services/user-service.ts

/**
 * Firestore service — "users" collection, one doc per person keyed by the
 * lowercase email (`users/{email}`, see UserRecord in access.types.ts).
 *
 * A person lands here two ways: an admin adds them by email (they can be put
 * on client teams or dashboard grants before they ever sign in), or they sign
 * in with Google and `ensureUserProfile` creates their row. Either way the row
 * grants nothing by itself — access comes from client teams and dashboard
 * grants (lib/format/access.ts). Role is USER by default; only admins change
 * it. There are no invites: an admin-added row is linked on first sign-in.
 */

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
import type { User } from "firebase/auth";
import { db } from "../firebase";
import type { AppRole, UserRecord } from "../types/access.types";
import { isValidEmail, normalizeEmail } from "../format/email";

const COLLECTION = "users";

/** Kept as the name most call sites import. */
export type UserProfile = UserRecord;
export type { AppRole } from "../types/access.types";

const userRef = (email: string) => doc(db, COLLECTION, normalizeEmail(email));

function toUser(d: { id: string; data: () => unknown }): UserRecord {
  const data = d.data() as Partial<UserRecord>;
  return {
    email: d.id,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    uid: data.uid ?? null,
    role: data.role === "ADMIN" ? "ADMIN" : "USER",
    lastLoginAt: data.lastLoginAt ?? null,
    createdAt: data.createdAt ?? null,
    createdBy: data.createdBy ?? null,
    disabled: data.disabled ?? null,
  };
}

/**
 * Creates or refreshes the signed-in person's row, on every auth state change.
 *   - Existing row (self sign-up or added by an admin) → links the uid and
 *     refreshes name, photo and lastLoginAt. Role and `disabled` are never
 *     touched (the rules reserve them to admins).
 *   - No row → creates it with role USER.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  const email = normalizeEmail(user.email);
  if (!isValidEmail(email)) throw new Error("Signed-in account has no email.");
  const ref = userRef(email);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    await updateDoc(ref, {
      uid: user.uid,
      displayName: user.displayName ?? snapshot.data().displayName ?? null,
      photoURL: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(ref, {
    email,
    uid: user.uid,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    role: "USER",
    createdBy: null,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });
}

/** Every person, sorted by email (admin page, team pickers). */
export async function fetchUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map(toUser).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Adds a person by email before they sign in (admin). Refuses an email that
 * already has a row so an existing person's role or links are never reset.
 */
export async function createUserManually(
  email: string,
  role: AppRole,
  createdBy: string
): Promise<UserRecord> {
  const id = normalizeEmail(email);
  if (!isValidEmail(id)) throw new Error(`"${email}" is not a valid email.`);
  const ref = userRef(id);
  if ((await getDoc(ref)).exists()) throw new Error(`${id} is already a user.`);
  await setDoc(ref, {
    email: id,
    uid: null,
    displayName: null,
    photoURL: null,
    role,
    createdBy: normalizeEmail(createdBy) || null,
    createdAt: serverTimestamp(),
    lastLoginAt: null,
  });
  return toUser(await getDoc(ref));
}

/** Changes a person's role (admin). */
export async function setUserRole(email: string, role: AppRole): Promise<void> {
  await updateDoc(userRef(email), { role });
}

/**
 * Revokes or restores a person's access (admin). A disabled person keeps
 * their row and team memberships but gets no access anywhere.
 */
export async function setUserDisabled(email: string, disabled: boolean): Promise<void> {
  await updateDoc(userRef(email), { disabled });
}

/**
 * Deletes a person's row (admin). Their email stays on any client team it is
 * on; a later sign-in recreates the row with role USER.
 */
export async function deleteUserRecord(email: string): Promise<void> {
  await deleteDoc(userRef(email));
}
