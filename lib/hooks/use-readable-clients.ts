// lib/hooks/use-readable-clients.ts

/**
 * Every client the current user may read on the dashboard: their team
 * clients plus those their dashboard grants cover (fetchReadableClients).
 * Hidden clients are removed. Sorted by name. Each dashboard tab narrows this
 * list to its own scope (team for Forecaster, Global / Agency for the rest).
 */

import { useEffect, useState } from "react";
import { useUserProfile } from "./use-user-profile";
import { useAccess } from "./use-access";
import { fetchReadableClients } from "../services/assignment-service";
import { isClientHidden } from "../format/client";
import type { Client } from "../types/client.types";

interface Result {
  /** The request this result answers (stale results are ignored). */
  key: string;
  clients: Client[];
  error: string | null;
}

export function useReadableClients(): { clients: Client[]; loading: boolean; error: string | null } {
  const { profile, isAdmin } = useUserProfile();
  const { readableQueries, loading: accessLoading } = useAccess();
  const ready = !!profile && !accessLoading;
  const key = ready ? `${profile.email}|${isAdmin}|${JSON.stringify(readableQueries)}` : "";
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchReadableClients(profile, isAdmin, readableQueries)
      .then((docs) => {
        if (!cancelled) setResult({ key, clients: docs.filter((c) => !isClientHidden(c)), error: null });
      })
      .catch((err) => {
        console.error("Failed to load clients:", err);
        if (!cancelled) setResult({ key, clients: [], error: "Failed to load clients." });
      });
    return () => {
      cancelled = true;
    };
    // Everything the fetch depends on is captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = result && result.key === key ? result : null;
  return {
    clients: current?.clients ?? [],
    loading: !current,
    error: current?.error ?? null,
  };
}
