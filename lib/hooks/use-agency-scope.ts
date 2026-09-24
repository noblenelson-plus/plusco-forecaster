// lib/hooks/use-agency-scope.ts

import { useEffect, useMemo, useState } from "react";
import { useUserProfile } from "./use-user-profile";
import { resolveAgenciesForEmail } from "../services/agency-service";
import {
  agencyScopeKey,
  resolveAgencyScope,
  type AgencyScope,
} from "../format/agency-scope";

// One lookup per email per page load, shared by every hook instance (the
// MediaOcean sections and Reports pages each call useAgencyScope).
const domainAgencyCache = new Map<string, Promise<string[]>>();

function domainAgenciesFor(email: string): Promise<string[]> {
  const key = email.trim().toLowerCase();
  let p = domainAgencyCache.get(key);
  if (!p) {
    p = resolveAgenciesForEmail(key).catch(() => {
      domainAgencyCache.delete(key); // let a later mount retry
      return [];
    });
    domainAgencyCache.set(key, p);
  }
  return p;
}

/**
 * The current user's agency scope for agency-partitioned data (MediaOcean tab,
 * Reports) — see lib/format/agency-scope.ts. Includes the agencies the user's
 * email domain maps to right now, resolved live from the agencies ↔ domains
 * mapping (the rules check the same mapping), so a mapping change applies to
 * everyone without a sync. `key` changes only when the scope does, so it is
 * safe as an effect dependency.
 */
export function useAgencyScope(): {
  scope: AgencyScope;
  key: string;
  loading: boolean;
} {
  const { profile, loading: profileLoading } = useUserProfile();
  const email = profile?.email ?? "";
  const privileged = profile?.role === "ADMIN";
  const [domain, setDomain] = useState<{ email: string; agencies: string[] } | null>(null);

  useEffect(() => {
    if (!email || privileged) return;
    let cancelled = false;
    domainAgenciesFor(email).then((agencies) => {
      if (!cancelled) setDomain({ email, agencies });
    });
    return () => {
      cancelled = true;
    };
  }, [email, privileged]);

  const domainReady = privileged || !email || domain?.email === email;
  const resolved = resolveAgencyScope(
    profile,
    domain?.email === email ? domain.agencies : []
  );
  const key = agencyScopeKey(resolved);
  // Re-memoize on the key so consumers get a referentially stable object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => resolved, [key]);
  return { scope, key, loading: profileLoading || !domainReady };
}
