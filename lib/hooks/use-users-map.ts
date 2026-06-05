// lib/hooks/use-users-map.ts

/**
 * Loads a `uid → display name` map for resolving user references to readable
 * labels (e.g. the Business Lead filter shows names, not UIDs).
 *
 * Reading the users collection is allowed for any authenticated user
 * (see firestoreRules.txt). The hook is tolerant of failure: on error it
 * returns an empty map and callers fall back to the raw UID.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { UserProfile } from "../services/user-service";

export function useUsersMap(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const next = new Map<string, string>();
        for (const d of snap.docs) {
          const u = d.data() as Omit<UserProfile, "uid">;
          next.set(d.id, u.displayName || u.email || d.id);
        }
        if (!cancelled) setMap(next);
      } catch (err) {
        console.error("Failed to load users map:", err);
      }
    }

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
