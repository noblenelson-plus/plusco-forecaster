// lib/hooks/use-users-map.ts

/**
 * Loads a `uid or email → display name` map for resolving user references to
 * readable labels (e.g. the Business Lead filter shows names, not emails).
 * People without a display name get one built from their email.
 * Users are keyed by email; older references (notes, submissions) store the
 * uid, so both keys are mapped.
 *
 * Reading the users collection is allowed for any authenticated user
 * (see firestoreRules.txt). The hook is tolerant of failure: on error it
 * returns an empty map and callers fall back to the raw value.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { UserProfile } from "../services/user-service";
import { isValidEmail, nameFromEmail } from "../format/email";

export function useUsersMap(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const next = new Map<string, string>();
        for (const d of snap.docs) {
          const u = d.data() as Partial<UserProfile>;
          // No display name (never signed in) → a name built from the email,
          // so labels never show a raw address.
          const email = u.email || (isValidEmail(d.id) ? d.id : "");
          const name = u.displayName || (email ? nameFromEmail(email) : d.id);
          next.set(d.id, name);
          if (u.uid) next.set(u.uid, name);
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
