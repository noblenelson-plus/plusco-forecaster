// lib/user-service.ts

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "../firebase";

export type UserRole = "ADMIN" | "BUSINESS_LEAD";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  assignedClients: string[];
  createdAt: unknown; // Firestore ServerTimestamp
  lastLoginAt: unknown; // Firestore ServerTimestamp
}

/**
 * Ensures a Firestore user profile document exists for the given Firebase Auth user.
 * - If the document doesn't exist, creates it with default BUSINESS_LEAD role.
 * - If it exists, updates lastLoginAt without overwriting existing fields.
 * - Returns the final profile data.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    // First login — create the profile document
    const newProfile: Omit<UserProfile, "uid"> = {
      email: user.email ?? "",
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      role: "BUSINESS_LEAD",
      assignedClients: [],
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(userRef, newProfile);
    console.log("Created new user profile for:", user.email);

    return { uid: user.uid, ...newProfile };
  }

  // Existing user — update lastLoginAt only
  await setDoc(
    userRef,
    { lastLoginAt: serverTimestamp() },
    { merge: true }
  );

  return { uid: user.uid, ...(snapshot.data() as Omit<UserProfile, "uid">) };
}