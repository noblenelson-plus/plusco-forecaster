// lib/format/agency-scope.ts

import type { UserRole } from "../types/user.types";

/**
 * Agency scope for agency-partitioned data: the MediaOcean tab collections
 * (tagged `_agency` by their syncs) and the Reports snapshots (one Storage file
 * per agency). Security rules enforce the same scope server-side
 * (firestoreRules.txt `canReadAgencyData`, storage.rules `reports/`); this
 * mirror only decides what the app asks for, so it never issues a read the
 * rules would reject.
 *
 *   - ADMIN → every agency, including UNASSIGNED_AGENCY rows.
 *   - Everyone else, Execs included → strictly the agencies their email domain
 *     maps to right now (agencies ↔ domains mapping + company-wide domains,
 *     resolved live — see use-agency-scope.ts). Same model as the former
 *     per-agency Looker dashboards.
 */

// Tag for rows without a recognized agency — Admin only. Must match
// UNASSIGNED_AGENCY in scripts/lib/agency.mjs.
export const UNASSIGNED_AGENCY = "_unassigned";

export interface AgencyScope {
  /** True for Admin: read every agency. */
  all: boolean;
  /** When `all` is false, the agencies the user may read (sorted, deduped). */
  agencies: string[];
}

export const EMPTY_AGENCY_SCOPE: AgencyScope = { all: false, agencies: [] };

export function resolveAgencyScope(
  profile: { role: UserRole } | null,
  /** Agencies the user's email domain maps to (live mapping). */
  domainAgencies: string[] = []
): AgencyScope {
  if (!profile) return EMPTY_AGENCY_SCOPE;
  if (profile.role === "ADMIN") return { all: true, agencies: [] };
  const agencies = [...new Set(domainAgencies)]
    .filter((a) => a !== UNASSIGNED_AGENCY)
    .sort();
  return { all: false, agencies };
}

/** Stable string key for effect dependencies / caches. */
export function agencyScopeKey(scope: AgencyScope): string {
  return scope.all ? "*" : scope.agencies.join("|");
}

/** Human label for the data the user is seeing ("All agencies", "Cossette Media, Showroom"). */
export function agencyScopeLabel(scope: AgencyScope): string {
  if (scope.all) return "All agencies";
  return scope.agencies.length ? scope.agencies.join(", ") : "No agency";
}
