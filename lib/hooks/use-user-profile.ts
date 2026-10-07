// lib/hooks/use-user-profile.ts

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth-context";
import type { UserProfile } from "../services/user-service";
import type { AppRole } from "../types/access.types";
import { normalizeEmail } from "../format/email";

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  /** Signed-in, normalized email ("" when signed out). */
  email: string;
}

/**
 * Subscribes in real time to the signed-in person's `users/{email}` doc.
 * `profile` is null while loading, when signed out, or before the first
 * sign-in has created the row.
 */
export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const email = normalizeEmail(user?.email);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, "users", email),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<UserProfile>;
          setProfile({
            email,
            displayName: data.displayName ?? null,
            photoURL: data.photoURL ?? null,
            uid: data.uid ?? null,
            role: data.role === "ADMIN" ? "ADMIN" : "USER",
            lastLoginAt: data.lastLoginAt ?? null,
            createdAt: data.createdAt ?? null,
            createdBy: data.createdBy ?? null,
            disabled: data.disabled ?? null,
          });
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to user profile:", error);
        setProfile(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [email]);

  const role = profile?.role ?? null;
  // What a person may do is decided by client teams and dashboard grants
  // (lib/format/access.ts, useAccess) — the role only says admin or not.
  const isAdmin = role === "ADMIN";

  return { profile, loading, role, isAdmin, email };
}
