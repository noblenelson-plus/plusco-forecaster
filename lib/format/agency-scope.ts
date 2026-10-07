// lib/format/agency-scope.ts

import { CLIENT_AGENCIES } from "../constants/client.constants";

/**
 * Agency scope — which clients / agency-partitioned rows a dashboard shows:
 * the MediaOcean tab collections (tagged `_agency` by their syncs), the
 * Reports snapshots (one Storage file per agency) and the client universe of
 * each dashboard tab. Resolved per dashboard from its Global / Agency mode
 * (dashboardScope in lib/format/access.ts, read through useAgencyScope).
 * Security rules enforce the same scope server-side (firestoreRules.txt,
 * storage.rules); this mirror only decides what the app asks for, so it never
 * issues a read the rules would reject.
 */

// Tag for rows without a recognized agency — admins and Global dashboards
// only. Must match UNASSIGNED_AGENCY in scripts/lib/agency.mjs.
export const UNASSIGNED_AGENCY = "_unassigned";

export interface AgencyScope {
  /** Every agency. */
  all: boolean;
  /** When `all` is false, the agencies covered (sorted, deduped). */
  agencies: string[];
  /** Rows tagged UNASSIGNED_AGENCY (admin, Global mode). */
  includesUnassigned: boolean;
}

export const EMPTY_AGENCY_SCOPE: AgencyScope = { all: false, agencies: [], includesUnassigned: false };

/** Whether a scope covers a client / row of the given agency. */
export function scopeCoversAgency(scope: AgencyScope | null, agency: string): boolean {
  if (!scope) return false;
  if (agency === UNASSIGNED_AGENCY) return scope.includesUnassigned;
  return scope.all || scope.agencies.includes(agency);
}

/**
 * The `_agency` values to query one by one, or null for the whole collection
 * (only when the scope covers everything, "_unassigned" included — the one
 * case the rules accept an unfiltered read).
 */
export function scopeQueryAgencies(scope: AgencyScope): string[] | null {
  if (scope.all && scope.includesUnassigned) return null;
  if (scope.all) return CLIENT_AGENCIES.map((a) => a.value);
  return scope.agencies;
}

/** Stable string key for effect dependencies / caches. */
export function agencyScopeKey(scope: AgencyScope): string {
  if (scope.all) return scope.includesUnassigned ? "*" : "*agencies";
  return scope.agencies.join("|");
}

/** Human label for the data the user is seeing ("All agencies", "Cossette Media, Showroom"). */
export function agencyScopeLabel(scope: AgencyScope): string {
  if (scope.all) return "All agencies";
  return scope.agencies.length ? scope.agencies.join(", ") : "No agency";
}
