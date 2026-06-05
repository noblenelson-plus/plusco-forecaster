// lib/hooks/use-accessible-clients.ts

/**
 * Fetches the clients the current user may access, scoped by role:
 *   - ADMIN          → every client
 *   - BUSINESS_LEAD  → only `assignedClients`
 *
 * Returns the full `Client` docs (not a summary) so callers can read any
 * field — the dashboard facets need agency / GM pod / region / office / tier /
 * business lead. Sorted by name.
 *
 * Centralizes the role-scoped fetch that also lives, hand-rolled, in
 * `forecast-selectors.tsx` and `app/(protected)/clients/page.tsx`.
 */

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUserProfile } from "./use-user-profile";
import type { Client } from "../types/client.types";

// Firestore caps "in" queries at 30 values — batch when a BL has more.
const IN_QUERY_LIMIT = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface UseAccessibleClientsResult {
  clients: Client[];
  loading: boolean;
  error: string | null;
}

export function useAccessibleClients(): UseAccessibleClientsResult {
  const { profile, isAdmin } = useUserProfile();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    async function fetchClients() {
      setLoading(true);
      setError(null);
      try {
        let docs;
        if (isAdmin) {
          docs = (await getDocs(collection(db, "clients"))).docs;
        } else {
          const assigned = profile?.assignedClients ?? [];
          if (assigned.length === 0) {
            if (!cancelled) setClients([]);
            return;
          }
          const snapshots = await Promise.all(
            chunk(assigned, IN_QUERY_LIMIT).map((ids) =>
              getDocs(query(collection(db, "clients"), where("__name__", "in", ids)))
            )
          );
          docs = snapshots.flatMap((s) => s.docs);
        }

        const data: Client[] = docs
          .map((d) => ({ cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) }))
          .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));

        if (!cancelled) setClients(data);
      } catch (err) {
        console.error("Failed to load accessible clients:", err);
        if (!cancelled) setError("Failed to load clients.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchClients();
    return () => {
      cancelled = true;
    };
  }, [profile, isAdmin]);

  return { clients, loading, error };
}
