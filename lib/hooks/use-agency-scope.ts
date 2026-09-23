// lib/hooks/use-agency-scope.ts

import { useMemo } from "react";
import { useUserProfile } from "./use-user-profile";
import {
  agencyScopeKey,
  resolveAgencyScope,
  type AgencyScope,
} from "../format/agency-scope";

/**
 * The current user's agency scope for agency-partitioned data (MediaOcean tab,
 * Reports) — see lib/format/agency-scope.ts. `key` changes only when the scope
 * does, so it is safe as an effect dependency.
 */
export function useAgencyScope(): {
  scope: AgencyScope;
  key: string;
  loading: boolean;
} {
  const { profile, loading } = useUserProfile();
  const resolved = resolveAgencyScope(profile);
  const key = agencyScopeKey(resolved);
  // Re-memoize on the key so consumers get a referentially stable object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => resolved, [key]);
  return { scope, key, loading };
}
