// lib/hooks/use-accessible-clients.ts

/**
 * Fetches the clients the current user may access, scoped by role:
 *   - ADMIN          → every client
 *   - BUSINESS_LEAD  → `assignedClients` ∪ every client of an `assignedAgency`
 *
 * Returns the full `Client` docs (not a summary) so callers can read any
 * field — the dashboard facets need agency / GM pod / region / office / tier /
 * business lead. Hidden clients are removed. Sorted by name.
 *
 * The role-scoped fetch (including agency expansion) lives in
 * `fetchAccessibleClients` (assignment-service), shared with
 * `forecast-selectors.tsx` and `app/(protected)/clients/page.tsx`.
 */

import { useEffect, useState } from "react";
import { useUserProfile } from "./use-user-profile";
import { fetchAccessibleClients } from "../services/assignment-service";
import type { Client } from "../types/client.types";
import { isClientHidden } from "../format/client";

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
        const docs = await fetchAccessibleClients(profile, isAdmin);
        const data = docs
          // Hidden clients are removed everywhere this hook feeds (dashboard, …).
          .filter((c) => !isClientHidden(c));

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
