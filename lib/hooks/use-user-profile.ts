// lib/hooks/use-user-profile.ts

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth-context";
import type { UserProfile } from "../services/user-service";
import type { AppRole } from "../types/access.types";
import { normalizeEmail } from "../format/email";
import { resolvePermissions, type UserPermissions } from "../types/user.types";

// Capability flags from the legacy model, still read by a few screens: a USER
// gets the Business Lead set (edit + revenue on the clients they may write —
// which clients is decided by the team, see lib/format/access.ts).
const USER_PERMISSIONS = resolvePermissions("BUSINESS_LEAD");
const ADMIN_PERMISSIONS = resolvePermissions("ADMIN");
const NO_PERMISSIONS = resolvePermissions("VIEWER");

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  /** Signed-in, normalized email ("" when signed out). */
  email: string;
  permissions: UserPermissions;
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
  const isAdmin = role === "ADMIN";
  const permissions = useMemo(
    () => (!role || profile?.disabled ? NO_PERMISSIONS : isAdmin ? ADMIN_PERMISSIONS : USER_PERMISSIONS),
    [role, isAdmin, profile?.disabled]
  );

  return { profile, loading, role, isAdmin, email, permissions };
}
