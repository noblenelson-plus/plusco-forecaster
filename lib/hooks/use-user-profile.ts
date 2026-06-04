// lib/hooks/use-user-profile.ts

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth-context";
import { UserProfile } from "../user-service";

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

/**
 * Subscribes in real-time to the current user's Firestore profile document.
 * - Returns null while loading or if no user is authenticated.
 * - Automatically unsubscribes when the user changes or the component unmounts.
 */
export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile({ uid: user.uid, ...(snapshot.data() as Omit<UserProfile, "uid">) });
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
  }, [user]);

  return {
    profile,
    loading,
    isAdmin: profile?.role === "ADMIN",
  };
}