// lib/services/agency-service.ts

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Agency } from "../types/agency.types";
import type { ClientAgency } from "../constants/client.constants";

// A single email domain (e.g. "mekanism.com") may belong to more than one
// agency, and some domains span every agency (see company-wide domains below),
// so domain matching always resolves to a *list* of agencies.

// Company-wide domains live in one config doc; a match grants access to ALL
// agencies (auto-covering agencies added later), set once instead of being
// replicated onto every agency.
const COMPANY_DOMAINS_DOC = "company_domains";

/**
 * Agency ↔ email-domain service.
 *
 * The `agencies` collection is the single source for the domain → agency map
 * used at sign-in to grant automatic "agency employee" (VIEWER) access.
 * Documents use the agency name as their id (a `ClientAgency` value), so the
 * granted `assignedAgencies` entry matches `clients.CL_Agency` directly.
 */

function toAgency(d: { id: string; data: () => unknown }): Agency {
  return { id: d.id, ...(d.data() as Omit<Agency, "id">) };
}

/**
 * Extracts the lowercase domain from an email address ("Jo@Mekanism.com" →
 * "mekanism.com"). Returns null when the address has no "@" part.
 */
export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** Fetches every agency, sorted by name. */
export async function fetchAgencies(): Promise<Agency[]> {
  const snap = await getDocs(collection(db, "agencies"));
  return snap.docs.map(toAgency).sort((a, b) => a.name.localeCompare(b.name));
}

/** Finds every agency owning a domain within an already-loaded list. */
export function matchAgenciesByDomain(
  agencies: Agency[],
  domain: string
): Agency[] {
  const d = domain.toLowerCase();
  return agencies.filter((a) =>
    (a.domains ?? []).some((x) => x.toLowerCase() === d)
  );
}

// ─── Company-wide domains ─────────────────────────────────────────────────────

/** Fetches the domains that grant access to every agency. */
export async function fetchCompanyDomains(): Promise<string[]> {
  const snap = await getDoc(doc(db, "config", COMPANY_DOMAINS_DOC));
  return snap.exists() ? ((snap.data().domains as string[]) ?? []) : [];
}

/** Replaces the company-wide domain list (normalized like agency domains). */
export async function saveCompanyDomains(domains: string[]): Promise<void> {
  const normalized = Array.from(
    new Set(
      domains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean)
    )
  );
  await setDoc(
    doc(db, "config", COMPANY_DOMAINS_DOC),
    { domains: normalized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolves every agency an email may access by matching its domain against both
 * the per-agency domains and the company-wide list. A company-wide match grants
 * ALL agencies; otherwise it is the union of agencies claiming that domain.
 * Returns [] when the email has no domain or nothing claims it. Used at first
 * sign-in to seed automatic agency access.
 */
export async function resolveAgenciesForEmail(
  email: string
): Promise<ClientAgency[]> {
  const domain = extractDomain(email);
  if (!domain) return [];

  const [agencies, companyDomains] = await Promise.all([
    fetchAgencies(),
    fetchCompanyDomains(),
  ]);

  // A company-wide domain grants access to every agency.
  if (companyDomains.some((x) => x.toLowerCase() === domain)) {
    return agencies.map((a) => a.name);
  }

  return matchAgenciesByDomain(agencies, domain).map((a) => a.name);
}

/**
 * Re-syncs the given users' `assignedAgencies` from their email domain, in one
 * pass (fetches the mapping once). Agencies are UNIONED with what each user
 * already has — never removed — so a not-yet-configured domain can't wipe
 * manually- or migration-set access. Only changed users are written. Must run
 * as an admin (Firestore rules reserve `assignedAgencies` writes to admins).
 * Returns the affected uids and their new agency lists.
 */
export async function syncUserAgenciesFromDomains(
  users: { uid: string; email: string; assignedAgencies?: string[] }[]
): Promise<{ uid: string; agencies: ClientAgency[] }[]> {
  const [agencies, companyDomains] = await Promise.all([
    fetchAgencies(),
    fetchCompanyDomains(),
  ]);

  const resolveLocal = (email: string): ClientAgency[] => {
    const domain = extractDomain(email);
    if (!domain) return [];
    if (companyDomains.some((x) => x.toLowerCase() === domain)) {
      return agencies.map((a) => a.name);
    }
    return matchAgenciesByDomain(agencies, domain).map((a) => a.name);
  };

  const changes: { uid: string; agencies: ClientAgency[] }[] = [];
  for (const u of users) {
    const current = u.assignedAgencies ?? [];
    const merged = Array.from(
      new Set([...current, ...resolveLocal(u.email)])
    ) as ClientAgency[];
    if (merged.length !== current.length) {
      await updateDoc(doc(db, "users", u.uid), { assignedAgencies: merged });
      changes.push({ uid: u.uid, agencies: merged });
    }
  }
  return changes;
}

/**
 * Creates or replaces an agency. Domains are normalized (lowercased, "@"
 * stripped, blanks/dupes removed). The document id is the agency name.
 */
export async function saveAgency(
  name: ClientAgency,
  domains: string[]
): Promise<void> {
  const normalized = Array.from(
    new Set(
      domains
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    )
  );
  await setDoc(
    doc(db, "agencies", name),
    { name, domains: normalized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Deletes an agency's domain mapping. */
export async function deleteAgency(name: string): Promise<void> {
  await deleteDoc(doc(db, "agencies", name));
}
