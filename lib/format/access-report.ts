// lib/format/access-report.ts

/**
 * The access report — Admin → Dashboard Access → Export. Pure (no Firebase):
 * for every person, what they can see and why, resolved with the same logic
 * as the app and the rules (lib/format/access.ts). Two read-only tabs:
 *   - Summary: one row per person — status, last sign-in, email agency, top
 *     client role, team clients, then one column per dashboard tab ("Agency:
 *     Cossette Media — 88 clients", "Own clients — 12", "Grant: … — 61").
 *   - Grant clients: the exact clients each grant gives (person × tab ×
 *     client), e.g. Sandra's list.
 * The editable tabs of the same workbook come from buildGrantSheet
 * (grant-sheet.ts) and buildTeamSheet (team-sheet.ts).
 */

import {
  AGENCY_DEFAULT_TABS,
  DASHBOARD_TABS,
  type DashboardAccessConfig,
  type DashboardGrantDoc,
  type DashboardTabId,
  type UserRecord,
} from "../types/access.types";
import type { Client } from "../types/client.types";
import {
  canOpenTab,
  domainScope,
  editGrant,
  grantCoversClient,
  grantScopeLabel,
  hiddenPagesFor,
  myAgencies,
  tabCoversClient,
  type AccessContext,
} from "./access";
import { isOnClientTeam, teamMemberships, TEAM_ROLES, TEAM_ROLE_LABELS } from "./client-team";
import { isClientHidden, isTestClient } from "./client";
import { nameFromEmail, normalizeEmail } from "./email";

export interface AccessReportInput {
  users: UserRecord[];
  /** Every client (admin read). */
  clients: Client[];
  grants: DashboardGrantDoc[];
  agencyDomains: Record<string, string[]>;
  companyDomains: string[];
  dashboardAccess: DashboardAccessConfig;
  tabLabels: Record<DashboardTabId, string>;
}

const day = (u: UserRecord | undefined) => u?.lastLoginAt?.toDate?.().toISOString().slice(0, 10) ?? "";

/** Summary tab: one row per person (users + anyone granted without a row). */
export function buildAccessSummary(input: AccessReportInput): string[][] {
  const { users, clients, grants, agencyDomains, companyDomains, dashboardAccess, tabLabels } = input;
  // What the dashboard shows: hidden and test clients are left out.
  const shown = clients.filter((c) => !isClientHidden(c) && !isTestClient(c.CL_Name));
  const memberships = teamMemberships(clients);
  const userBy = new Map(users.map((u) => [u.email, u]));
  const grantBy = new Map(grants.map((g) => [normalizeEmail(g.email), g.tabs]));
  const emails = [...new Set([...userBy.keys(), ...grantBy.keys()])];
  const nameOf = (e: string) => userBy.get(e)?.displayName || nameFromEmail(e);

  const header = [
    "Email",
    "Name",
    "App role",
    "Status",
    "Last sign-in",
    "Agency (from email)",
    "Client role",
    "Team clients",
    ...DASHBOARD_TABS.map((t) => tabLabels[t]),
    "Can edit beyond team",
  ];
  const rows = emails
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map((email) => {
      const u = userBy.get(email);
      const isAdmin = u?.role === "ADMIN";
      const disabled = !!u?.disabled;
      const ctx: AccessContext = {
        email,
        isAdmin,
        disabled,
        agencyDomains,
        companyDomains,
        grants: grantBy.get(email) ?? {},
        dashboardAccess,
      };
      const mine = memberships.get(email) ?? new Map();
      const held = new Set([...mine.values()].flat());
      const topRole = TEAM_ROLES.find((r) => held.has(r));
      const teamCount = mine.size;
      const agencies = myAgencies(email, agencyDomains, companyDomains);
      const hidden = hiddenPagesFor(ctx);

      const tabCell = (tab: DashboardTabId): string => {
        if (disabled) return "Revoked";
        if (isAdmin) return `Admin — all ${shown.length} clients`;
        if (!canOpenTab(ctx, tab, teamCount)) return "—";
        const parts: string[] = [];
        if (tab === "forecaster" && teamCount) parts.push("Own clients");
        if (AGENCY_DEFAULT_TABS.includes(tab)) {
          const d = domainScope(ctx);
          parts.push(d.all ? "All agencies" : `Agency: ${d.agencies.join(", ")}`);
        }
        const g = ctx.grants[tab];
        if (g) parts.push(`Grant: ${grantScopeLabel(g)}`);
        const n = shown.filter((c) => tabCoversClient(ctx, tab, c)).length;
        const text = `${parts.join(" + ")} — ${n} client${n !== 1 ? "s" : ""}`;
        return hidden.has(tab) ? `${text} (tab hidden)` : text;
      };

      const status = disabled ? "Revoked" : !u ? "No user yet" : u.lastLoginAt ? "Active" : "Never signed in";
      const edit = editGrant(ctx);
      return [
        email,
        nameOf(email),
        isAdmin ? "Admin" : "User",
        status,
        day(u),
        agencies.all ? "All agencies" : agencies.agencies.join(", ") || "— (not a company domain)",
        isAdmin ? "Admin" : topRole ? TEAM_ROLE_LABELS[topRole] : "—",
        String(teamCount),
        ...DASHBOARD_TABS.map(tabCell),
        isAdmin ? "Everything" : edit ? `${grantScopeLabel(edit)} — ${shown.filter((c) => grantCoversClient(edit, c) && !isOnClientTeam(email, c)).length} more clients` : "",
      ];
    });
  return [header, ...rows];
}

/** Grant clients tab: person × tab × client for every grant (hidden/test clients left out). */
export function buildGrantClients(input: AccessReportInput): string[][] {
  const { users, clients, grants, tabLabels } = input;
  const shown = clients
    .filter((c) => !isClientHidden(c) && !isTestClient(c.CL_Name))
    .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
  const names = new Map(users.map((u) => [u.email, u.displayName]));
  const nameOf = (e: string) => names.get(e) || nameFromEmail(e);
  const rows: string[][] = [];
  for (const g of [...grants].sort((a, b) => nameOf(a.email).localeCompare(nameOf(b.email)))) {
    for (const tab of DASHBOARD_TABS) {
      const scope = g.tabs[tab];
      if (!scope) continue;
      for (const c of shown) {
        if (!grantCoversClient(scope, c)) continue;
        rows.push([g.email, nameOf(g.email), tabLabels[tab], c.cl_id, c.CL_Name, c.CL_Agency, c.CL_Business_Unit_Region, scope.edit ? "Yes" : "No"]);
      }
    }
  }
  return [["Email", "Name", "Tab", "Client ID", "Client Name", "Agency", "Region", "Can edit"], ...rows];
}
