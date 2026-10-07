// lib/format/access.ts

/**
 * Access resolution for the user & access rebuild, as pure functions (no
 * Firebase). This is the reference logic: firestoreRules.txt and storage.rules
 * must mirror it (isAdmin, isOnClientTeam, myAgencies, dashboard grants,
 * canReadClientData, canWriteClient) — change both together.
 *
 *   - Admin → everything, every client (including "_unassigned" rows).
 *   - Client team (CL_Team_Emails) → read + write that client in the team
 *     spaces (Forecast, Flags, Milestones, Clients, Forecaster dashboard).
 *   - Dashboard grant (config/dashboard_access, by email domain or person)
 *     → opens that dashboard; GLOBAL mode shows every client, AGENCY mode the
 *     agencies the viewer's email domain maps to. A company-wide domain
 *     (config/company_domains) maps to every agency, but still needs a grant.
 *   - Disabled users get nothing.
 *
 * Actuals stay admin-only and the RFQ lock / closed months still apply on top
 * of canWriteClient; those checks live where they always did.
 */

import {
  GRANTABLE_DASHBOARDS,
  type DashboardAccessConfig,
  type DashboardGrant,
  type DashboardMode,
  type GrantableDashboardId,
} from "../types/access.types";
import type { Client } from "../types/client.types";
import { UNASSIGNED_AGENCY } from "./agency-scope";
import { isOnClientTeam } from "./client-team";
import { emailDomain, normalizeDomain, normalizeEmail, normalizeEmailList } from "./email";

/** Everything needed to resolve one person's access. */
export interface AccessContext {
  /** Signed-in email (normalized by the helpers). */
  email: string;
  isAdmin: boolean;
  disabled?: boolean;
  /** agency name → its email domains (the `agencies` collection). */
  agencyDomains: Record<string, string[]>;
  /** config/company_domains: domains that map to every agency. */
  companyDomains: string[];
  dashboardAccess: DashboardAccessConfig;
}

/** Clients a dashboard shows: every client, or those of the listed agencies. */
export interface DashboardScope {
  all: boolean;
  /** When `all` is false (sorted). */
  agencies: string[];
  /** Rows tagged "_unassigned" — Admin only. */
  includesUnassigned: boolean;
}

const ALL_CLIENTS: DashboardScope = { all: true, agencies: [], includesUnassigned: false };
const ADMIN_SCOPE: DashboardScope = { all: true, agencies: [], includesUnassigned: true };

// ─── Config normalization ─────────────────────────────────────────────────────

/** A dashboard nobody was granted: closed until an admin opens it. */
export function closedGrant(mode: DashboardMode = "AGENCY"): DashboardGrant {
  return { mode, domains: [], users: [] };
}

/**
 * Tolerant read of a `config/dashboard_access` doc: unknown dashboards are
 * dropped, missing ones are closed, domains / emails are normalized.
 */
export function normalizeDashboardAccess(raw: unknown): DashboardAccessConfig {
  const src = (raw as { dashboards?: Record<string, Partial<DashboardGrant>> } | null)
    ?.dashboards ?? {};
  const dashboards = {} as Record<GrantableDashboardId, DashboardGrant>;
  for (const id of GRANTABLE_DASHBOARDS) {
    const g = src[id] ?? {};
    dashboards[id] = {
      mode: g.mode === "GLOBAL" ? "GLOBAL" : "AGENCY",
      domains: [...new Set((g.domains ?? []).map(normalizeDomain).filter(Boolean))].sort(),
      users: normalizeEmailList(g.users ?? []),
    };
  }
  return { dashboards };
}

// ─── Agencies ─────────────────────────────────────────────────────────────────

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

// ─── Dashboards ───────────────────────────────────────────────────────────────

/** The grant lists the caller's email domain or the caller. */
export function matchesGrant(email: string, grant: DashboardGrant): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  return grant.users.includes(e) || grant.domains.includes(emailDomain(e));
}

/** Admin, or granted on that dashboard. */
export function canOpenDashboard(ctx: AccessContext, id: GrantableDashboardId): boolean {
  if (ctx.disabled) return false;
  return ctx.isAdmin || matchesGrant(ctx.email, ctx.dashboardAccess.dashboards[id]);
}

/** The clients dashboard `id` shows the caller; null when they can't open it. */
export function dashboardScope(
  ctx: AccessContext,
  id: GrantableDashboardId
): DashboardScope | null {
  if (!canOpenDashboard(ctx, id)) return null;
  if (ctx.isAdmin) return ADMIN_SCOPE;
  if (ctx.dashboardAccess.dashboards[id].mode === "GLOBAL") return ALL_CLIENTS;
  const mine = myAgencies(ctx.email, ctx.agencyDomains, ctx.companyDomains);
  return mine.all ? ALL_CLIENTS : { all: false, agencies: mine.agencies, includesUnassigned: false };
}

/** Whether a scope covers a client / row of the given agency. */
export function scopeCoversAgency(scope: DashboardScope | null, agency: string): boolean {
  if (!scope) return false;
  if (agency === UNASSIGNED_AGENCY) return scope.includesUnassigned;
  return scope.all || scope.agencies.includes(agency);
}

/** Dashboards the caller may open (the Forecaster dashboard excluded). */
export function openDashboards(ctx: AccessContext): GrantableDashboardId[] {
  return GRANTABLE_DASHBOARDS.filter((id) => canOpenDashboard(ctx, id));
}

// ─── Clients ──────────────────────────────────────────────────────────────────

type ClientAccessFields = Pick<Client, "CL_Agency" | "CL_Team_Emails">;

/**
 * Read a client and its data (forecast, milestones, product tracking, …):
 * admin, team member, or a dashboard grant whose scope covers its agency.
 * Rules: canReadClientData = isAdmin || isOnClientTeam || dashCanReadAll
 * || dashCanReadAgency(CL_Agency).
 */
export function canReadClient(ctx: AccessContext, client: ClientAccessFields): boolean {
  if (ctx.disabled) return false;
  if (ctx.isAdmin || isOnClientTeam(ctx.email, client)) return true;
  return GRANTABLE_DASHBOARDS.some((id) =>
    scopeCoversAgency(dashboardScope(ctx, id), client.CL_Agency)
  );
}

/** Edit a client's forecast / flags / milestones / product tracking. */
export function canWriteClient(ctx: AccessContext, client: Pick<Client, "CL_Team_Emails">): boolean {
  if (ctx.disabled) return false;
  return ctx.isAdmin || isOnClientTeam(ctx.email, client);
}

/** The Forecaster dashboard and the team spaces: admin or on ≥1 client team. */
export function canOpenTeamSpaces(
  ctx: Pick<AccessContext, "isAdmin" | "disabled">,
  teamClientCount: number
): boolean {
  if (ctx.disabled) return false;
  return ctx.isAdmin || teamClientCount > 0;
}

/** Past the "Access pending" screen: admin, a team, or any dashboard grant. */
export function hasAnyAccess(ctx: AccessContext, teamClientCount: number): boolean {
  return canOpenTeamSpaces(ctx, teamClientCount) || openDashboards(ctx).length > 0;
}
