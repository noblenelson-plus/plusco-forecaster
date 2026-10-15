// lib/format/access.ts

/**
 * Access resolution, as pure functions (no Firebase). This is the reference
 * logic: firestoreRules.txt and storage.rules mirror it â€” change them
 * together.
 *
 * A person's access comes from three sources:
 *   1. Client team (CL_Team_Emails) â€” read + edit their clients; the team
 *      spaces (Forecast, Flags, Milestones, Clients) and the Forecaster tab.
 *   2. Email domain â€” every company email sees Media Investments, Labs
 *      Pacing and Reports (AGENCY_DEFAULT_TABS) for the agencies its domain
 *      maps to; a company-wide domain (config/company_domains, e.g.
 *      pluscompany.com) sees every agency, like an admin.
 *   3. Grants (dashboard_grants/{email}) â€” per tab, the clients of chosen
 *      agencies Ã— regions, or specific clients (CLIENT_GRANT_TABS only),
 *      read-only; a Forecaster grant may also allow editing. Exec KPI and
 *      MediaBox Adoption are grants only.
 *   4. MediaBox allocations (CL_MediaBox_Emails), once the switch
 *      (config/mediabox_allocations) is on: on ALLOCATION_TABS an agency
 *      email sees its allocated clients (and its team's clients with no
 *      MediaBox link) instead of its whole agency, and reads only their data.
 *   Admins see and edit everything. Disabled users get nothing. Tabs an
 *   admin hides (config/dashboard_access) disappear for everyone, admins too.
 *
 * Actuals stay admin-only and the RFQ lock / closed months still apply on top
 * of canWriteClient; those checks live where they always did.
 */

import {
  AGENCY_DEFAULT_TABS,
  ALLOCATION_TABS,
  CLIENT_GRANT_TABS,
  DASHBOARD_TABS,
  type DashboardAccessConfig,
  type DashboardGrantDoc,
  type DashboardTabId,
  type GrantScope,
} from "../types/access.types";
import type { Client } from "../types/client.types";
import { UNASSIGNED_AGENCY, scopeCoversAgency, type AgencyScope } from "./agency-scope";
import { isOnClientTeam } from "./client-team";
import { emailDomain, normalizeDomain, normalizeEmail } from "./email";

export { scopeCoversAgency };
export type DashboardScope = AgencyScope;

/** Everything needed to resolve one person's access. */
export interface AccessContext {
  /** Signed-in email (normalized by the helpers). */
  email: string;
  isAdmin: boolean;
  disabled?: boolean;
  /** agency name â†’ its email domains (the `agencies` collection). */
  agencyDomains: Record<string, string[]>;
  /** config/company_domains: domains that map to every agency. */
  companyDomains: string[];
  /** The person's own grants (dashboard_grants/{email}.tabs). */
  grants: DashboardGrantDoc["tabs"];
  dashboardAccess: DashboardAccessConfig;
  /** config/mediabox_allocations is on (absent = off). */
  mediaboxAllocations?: boolean;
}

// Admins and company-wide domains also get rows the sync couldn't map to an
// agency ("_unassigned").
const EVERYTHING: AgencyScope = { all: true, agencies: [], includesUnassigned: true };
const NOTHING: AgencyScope = { all: false, agencies: [], includesUnassigned: false };

// â”€â”€â”€ Normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TAB_SET = new Set<string>(DASHBOARD_TABS);

/** Tolerant read of `config/dashboard_access` (older docs carried grants too). */
export function normalizeDashboardAccess(raw: unknown): DashboardAccessConfig {
  const doc = raw as { hiddenTabs?: unknown; hiddenSubtabs?: unknown } | null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    hiddenTabs: [...new Set(strings(doc?.hiddenTabs).filter((t) => TAB_SET.has(t)))].sort(),
    hiddenSubtabs: [...new Set(strings(doc?.hiddenSubtabs).filter((x) => x.includes("/")))].sort(),
  };
}

/** Tolerant read of one tab's scope; null when it covers nothing. */
export function normalizeGrantScope(raw: unknown, tab: DashboardTabId): GrantScope | null {
  const s = raw as Partial<GrantScope> | null;
  if (!s || typeof s !== "object") return null;
  const list = (v: unknown) =>
    [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim()))].sort();
  // Specific clients only on the tabs that allow them (never Media
  // Investments / Reports, whose data is split by agency).
  const clients = CLIENT_GRANT_TABS.includes(tab) ? list(s.clients) : [];
  if (clients.length) {
    // The "specific clients" kind: the agency Ã— region rule stays empty.
    const scope: GrantScope = { allAgencies: false, agencies: [], allRegions: false, regions: [], clients };
    if (tab === "forecaster" && s.edit === true) scope.edit = true;
    return scope;
  }
  const scope: GrantScope = {
    allAgencies: s.allAgencies === true,
    agencies: s.allAgencies === true ? [] : list(s.agencies),
    allRegions: s.allRegions === true,
    regions: s.allRegions === true ? [] : list(s.regions),
  };
  if (tab === "forecaster" && s.edit === true) scope.edit = true;
  const empty = (!scope.allAgencies && !scope.agencies.length) || (!scope.allRegions && !scope.regions.length);
  return empty ? null : scope;
}

/** A grant of the "specific clients" kind. */
export function isClientGrant(scope: GrantScope | null | undefined): boolean {
  return !!scope?.clients?.length;
}

/** Tolerant read of a grant doc's tabs (empty scopes and unknown tabs dropped). */
export function normalizeGrantTabs(raw: unknown): DashboardGrantDoc["tabs"] {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: DashboardGrantDoc["tabs"] = {};
  for (const tab of DASHBOARD_TABS) {
    const scope = normalizeGrantScope(src[tab], tab);
    if (scope) out[tab] = scope;
  }
  return out;
}

/**
 * "All agencies Â· QC/East", or "Clients: Acme, Globex" â€” for lists.
 * `clientName` resolves a client id to its name (falls back to the id).
 */
export function grantScopeLabel(scope: GrantScope, clientName?: (id: string) => string | undefined): string {
  const edit = scope.edit ? " Â· can edit" : "";
  if (isClientGrant(scope)) {
    const names = scope.clients!.map((id) => clientName?.(id) || id).sort((a, b) => a.localeCompare(b));
    return `Clients: ${names.join(", ")}${edit}`;
  }
  const a = scope.allAgencies ? "All agencies" : scope.agencies.join(", ");
  const r = scope.allRegions ? "all regions" : scope.regions.join(", ");
  return `${a} Â· ${r}${edit}`;
}

// â”€â”€â”€ Agencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** The caller's domain is company-wide (maps to every agency). */
export function isCompanyDomain(email: string, companyDomains: string[]): boolean {
  const d = emailDomain(email);
  return !!d && companyDomains.map(normalizeDomain).includes(d);
}

/**
 * The agencies the email domain maps to ("my agencies"); `all` for a
 * company-wide domain. Never includes "_unassigned".
 */
export function myAgencies(
  email: string,
  agencyDomains: Record<string, string[]>,
  companyDomains: string[]
): { all: boolean; agencies: string[] } {
  if (isCompanyDomain(email, companyDomains)) return { all: true, agencies: [] };
  const d = emailDomain(email);
  const agencies = Object.entries(agencyDomains)
    .filter(([name, domains]) => name !== UNASSIGNED_AGENCY && domains.map(normalizeDomain).includes(d))
    .map(([name]) => name)
    .sort();
  return { all: false, agencies: d ? agencies : [] };
}

/** What the email domain alone shows on the agency-default tabs. */
export function domainScope(ctx: AccessContext): AgencyScope {
  const mine = myAgencies(ctx.email, ctx.agencyDomains, ctx.companyDomains);
  if (mine.all) return EVERYTHING;
  return { all: false, agencies: mine.agencies, includesUnassigned: false };
}

// â”€â”€â”€ MediaBox allocations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AllocationFields = Pick<Client, "CL_MediaBox_IDs" | "CL_MediaBox_Emails" | "CL_Team_Emails">;

/** The email is allocated to the client in MediaBox (CL_MediaBox_Emails). */
export function isAllocatedTo(email: string, client: Pick<Client, "CL_MediaBox_Emails">): boolean {
  const e = normalizeEmail(email);
  return !!e && (client.CL_MediaBox_Emails ?? []).includes(e);
}

/**
 * Allocations replace the email domain for this person: the switch is on and
 * the domain isn't company-wide (those keep every client). Admins aside.
 */
function allocationsReplaceDomain(ctx: AccessContext): boolean {
  return !!ctx.mediaboxAllocations && !ctx.isAdmin && !isCompanyDomain(ctx.email, ctx.companyDomains);
}

/**
 * With allocations on: the person's allocated clients, plus their team's
 * clients that have no MediaBox link (nobody can be allocated to those).
 */
export function allocationCoversClient(ctx: AccessContext, client: AllocationFields): boolean {
  if (isAllocatedTo(ctx.email, client)) return true;
  return !(client.CL_MediaBox_IDs ?? []).length && isOnClientTeam(ctx.email, client);
}

// â”€â”€â”€ Grants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Whether a grant scope covers a client (listed, or agency Ã— region). */
export function grantCoversClient(
  scope: GrantScope | null | undefined,
  client: Pick<Client, "cl_id" | "CL_Agency" | "CL_Business_Unit_Region">
): boolean {
  if (!scope) return false;
  if (scope.clients?.includes(client.cl_id)) return true;
  return (
    (scope.allAgencies || scope.agencies.includes(client.CL_Agency)) &&
    (scope.allRegions || scope.regions.includes(client.CL_Business_Unit_Region))
  );
}

/**
 * The agencies a grant scope covers, for agency-tagged data (regions don't
 * apply; specific-client grants open no agency data â€” their rule is empty).
 */
function grantAgencyScope(scope: GrantScope | null | undefined): AgencyScope {
  if (!scope) return NOTHING;
  return scope.allAgencies ? EVERYTHING : { all: false, agencies: scope.agencies, includesUnassigned: false };
}

function unionScopes(a: AgencyScope, b: AgencyScope): AgencyScope {
  const all = a.all || b.all;
  return {
    all,
    agencies: all ? [] : [...new Set([...a.agencies, ...b.agencies])].sort(),
    includesUnassigned: a.includesUnassigned || b.includesUnassigned,
  };
}

/** The Forecaster grant that allows editing, if any. */
export function editGrant(ctx: AccessContext): GrantScope | null {
  const g = ctx.grants.forecaster;
  return g?.edit ? g : null;
}

// â”€â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Tab and sub-tab ids hidden on the dashboard â€” for everyone, admins
 * included (they unhide them on Dashboard Access, which always lists them).
 * Hiding is presentation only; it doesn't change what anyone may read.
 */
export function hiddenPagesFor(ctx: Pick<AccessContext, "dashboardAccess">): Set<string> {
  return new Set([...ctx.dashboardAccess.hiddenTabs, ...ctx.dashboardAccess.hiddenSubtabs]);
}

/**
 * Whether the caller may open a tab (ignores hiding â€” see openTabs).
 * `allocatedClientCount`: clients whose CL_MediaBox_Emails lists them (only
 * loaded while allocations are on).
 */
export function canOpenTab(
  ctx: AccessContext,
  tab: DashboardTabId,
  teamClientCount: number,
  allocatedClientCount = 0
): boolean {
  if (ctx.disabled) return false;
  if (ctx.isAdmin) return true;
  if (ctx.grants[tab]) return true;
  if (tab === "forecaster") return teamClientCount > 0;
  if (ctx.mediaboxAllocations && ALLOCATION_TABS.includes(tab)) {
    // Company-wide domains keep every client; agency emails need an
    // allocation, or a team client (its unlinked clients show there).
    if (isCompanyDomain(ctx.email, ctx.companyDomains)) return true;
    return allocatedClientCount > 0 || teamClientCount > 0;
  }
  if (AGENCY_DEFAULT_TABS.includes(tab)) {
    const d = domainScope(ctx);
    return d.all || d.agencies.length > 0;
  }
  return false;
}

/** The tabs the caller sees, in tab-bar order (hidden ones dropped, admins included). */
export function openTabs(ctx: AccessContext, teamClientCount: number, allocatedClientCount = 0): DashboardTabId[] {
  const hidden = hiddenPagesFor(ctx);
  return DASHBOARD_TABS.filter((t) => canOpenTab(ctx, t, teamClientCount, allocatedClientCount) && !hidden.has(t));
}

/** Whether a tab shows a client (presentation; the rules enforce reads). */
export function tabCoversClient(
  ctx: AccessContext,
  tab: DashboardTabId,
  client: ClientAccessFields
): boolean {
  if (ctx.disabled) return false;
  if (ctx.isAdmin) return true;
  if (grantCoversClient(ctx.grants[tab], client)) return true;
  if (tab === "forecaster") return isOnClientTeam(ctx.email, client);
  if (ctx.mediaboxAllocations && ALLOCATION_TABS.includes(tab)) {
    return isCompanyDomain(ctx.email, ctx.companyDomains) || allocationCoversClient(ctx, client);
  }
  if (AGENCY_DEFAULT_TABS.includes(tab)) return scopeCoversAgency(domainScope(ctx), client.CL_Agency);
  return false;
}

/**
 * The agencies of agency-tagged data (Media Investments collections, Reports
 * files, KPI docs) a tab shows: the domain's agencies on the agency-default
 * tabs, plus the tab's grant.
 */
export function tabAgencyScope(ctx: AccessContext, tab: DashboardTabId): AgencyScope {
  if (ctx.disabled) return NOTHING;
  if (ctx.isAdmin) return EVERYTHING;
  const base = AGENCY_DEFAULT_TABS.includes(tab) ? domainScope(ctx) : NOTHING;
  return unionScopes(base, grantAgencyScope(ctx.grants[tab]));
}

/** Every agency the caller may read agency-tagged data for (any tab). */
export function readableAgencyScope(ctx: AccessContext): AgencyScope {
  return DASHBOARD_TABS.reduce((acc, t) => unionScopes(acc, tabAgencyScope(ctx, t)), NOTHING);
}

// â”€â”€â”€ Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * One `clients` read the rules can verify: the whole collection, equality
 * filters on agency and/or region, or a single client by id (a get). The
 * team's `array-contains` query is separate.
 */
export interface ClientQuerySpec {
  agency?: string;
  region?: string;
  /** One client doc, read by id (specific-client grants). */
  id?: string;
  /** The clients allocated to this email in MediaBox (`CL_MediaBox_Emails` array-contains). */
  allocatedTo?: string;
}

/** The client queries covering one grant scope. */
export function grantQuerySpecs(scope: GrantScope): ClientQuerySpec[] {
  if (isClientGrant(scope)) return scope.clients!.map((id) => ({ id }));
  if (scope.allAgencies && scope.allRegions) return [{}];
  if (scope.allAgencies) return scope.regions.map((region) => ({ region }));
  if (scope.allRegions) return scope.agencies.map((agency) => ({ agency }));
  return scope.agencies.flatMap((agency) => scope.regions.map((region) => ({ agency, region })));
}

/** Dedupes specs; a whole-collection read makes the rest redundant. */
function dedupeSpecs(specs: ClientQuerySpec[]): ClientQuerySpec[] {
  if (specs.some((s) => !s.agency && !s.region && !s.id && !s.allocatedTo)) return [{}];
  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = s.id
      ? `id:${s.id}`
      : s.allocatedTo
        ? `allocated:${s.allocatedTo}`
        : `${s.agency ?? "*"}|${s.region ?? "*"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Every client query (beyond the team's) needed to load what the caller may
 * read: the domain's agencies, their MediaBox allocations (while the switch
 * is on â€” those clients may sit in another agency), then each grant scope.
 * The domain's agency docs stay readable with allocations on (Media
 * Investments / Reports still follow agencies); only their data narrows.
 */
export function readableClientQueries(ctx: AccessContext): ClientQuerySpec[] {
  if (ctx.disabled) return [];
  if (ctx.isAdmin) return [{}];
  const specs: ClientQuerySpec[] = [];
  const d = domainScope(ctx);
  if (d.all) specs.push({});
  else for (const agency of d.agencies) specs.push({ agency });
  if (allocationsReplaceDomain(ctx)) specs.push({ allocatedTo: normalizeEmail(ctx.email) });
  for (const scope of Object.values(ctx.grants)) if (scope) specs.push(...grantQuerySpecs(scope));
  return dedupeSpecs(specs);
}

/** The client queries for the edit grant (beyond the team's); empty without one. */
export function editableClientQueries(ctx: AccessContext): ClientQuerySpec[] {
  const g = editGrant(ctx);
  return g && !ctx.disabled ? dedupeSpecs(grantQuerySpecs(g)) : [];
}

type ClientAccessFields = Pick<
  Client,
  "cl_id" | "CL_Agency" | "CL_Business_Unit_Region" | "CL_Team_Emails" | "CL_MediaBox_IDs" | "CL_MediaBox_Emails"
>;

/**
 * Read a client's data (forecast, milestones, product tracking, MediaBox
 * totals, â€¦): admin, team member, any grant covering it, or through the email
 * domain â€” its agency, or, while allocations are on for an agency email, only
 * its MediaBox allocations. Rules: canReadClientData.
 */
export function canReadClient(ctx: AccessContext, client: ClientAccessFields): boolean {
  if (ctx.disabled) return false;
  if (ctx.isAdmin || isOnClientTeam(ctx.email, client)) return true;
  if (allocationsReplaceDomain(ctx) ? isAllocatedTo(ctx.email, client) : scopeCoversAgency(domainScope(ctx), client.CL_Agency)) {
    return true;
  }
  return DASHBOARD_TABS.some((t) => grantCoversClient(ctx.grants[t], client));
}

/** Edit a client's forecast / flags / milestones / product tracking. Rules: canWriteClient. */
export function canWriteClient(ctx: AccessContext, client: ClientAccessFields): boolean {
  if (ctx.disabled) return false;
  return ctx.isAdmin || isOnClientTeam(ctx.email, client) || grantCoversClient(editGrant(ctx), client);
}

/** The team spaces (Forecast, Flags, Milestones, Clients): admin, a team, or an edit grant. */
export function canOpenTeamSpaces(ctx: AccessContext, teamClientCount: number): boolean {
  if (ctx.disabled) return false;
  return ctx.isAdmin || teamClientCount > 0 || !!editGrant(ctx);
}

/** Past the "Access pending" screen: a team space or any tab. */
export function hasAnyAccess(ctx: AccessContext, teamClientCount: number, allocatedClientCount = 0): boolean {
  return canOpenTeamSpaces(ctx, teamClientCount) || openTabs(ctx, teamClientCount, allocatedClientCount).length > 0;
}
