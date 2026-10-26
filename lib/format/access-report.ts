// lib/format/access-report.ts

/**
 * The access report — Admin → Dashboard Access → Export. Pure (no Firebase):
 * who can see each dashboard and why, resolved with the same logic as the app
 * and the rules (lib/format/access.ts). Three read-only tabs:
 *   - Dashboard Access: one row per dashboard × person × source of access
 *     (Admin, Client Team - Forecaster / MediaBox / Forecaster & MediaBox,
 *     Grant), with the agencies and their regions — "Cossette Media (Ontario,
 *     QC/East), Mekanism (USA)" — and the number of clients it opens.
 *   - Client teams - Client List: every client's Forecaster team seats (GM,
 *     Business Lead, Digital Lead, Collaborator) and its MediaBox users.
 *   - Grant - Client List: the exact clients each grant gives (person ×
 *     dashboard × client).
 * The editable grants tab of the same workbook comes from buildGrantSheet
 * (grant-sheet.ts). Hidden and test clients are left out, as on the dashboard.
 */

import {
  AGENCY_DEFAULT_TABS,
  ALLOCATION_TABS,
  DASHBOARD_TABS,
  type DashboardAccessConfig,
  type DashboardGrantDoc,
  type DashboardTabId,
  type UserRecord,
} from "../types/access.types";
import type { Client } from "../types/client.types";
import {
  allocationCoversClient,
  domainScope,
  grantCoversClient,
  hiddenPagesFor,
  isAllocatedTo,
  type AccessContext,
} from "./access";
import { isOnClientTeam, teamSeats, TEAM_ROLES, TEAM_ROLE_LABELS } from "./client-team";
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
  /** config/mediabox_allocations is on. */
  mediaboxAllocations?: boolean;
  tabLabels: Record<DashboardTabId, string>;
}

/** "Access Granted Via" values, in the order rows are listed per dashboard. */
export const ACCESS_SOURCES = {
  admin: "Admin",
  team: "Client Team - Forecaster",
  mediabox: "Client Team - MediaBox",
  teamAndMediabox: "Client Team - Forecaster & MediaBox",
  global: "Email domain - all agencies",
  domain: "Email domain - own agency",
  grant: "Grant (Person added)",
} as const;

const SOURCE_ORDER: string[] = Object.values(ACCESS_SOURCES);

/** What the dashboard shows: hidden and test clients are left out. */
const shownClients = (clients: Client[]) =>
  clients
    .filter((c) => !isClientHidden(c) && !isTestClient(c.CL_Name))
    .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));

const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort().join(", ");

/** "Cossette Media (Ontario, QC/East), Mekanism (USA)" — each agency with its own regions. */
function agencyRegions(clients: Client[]): string {
  const byAgency = new Map<string, string[]>();
  for (const c of clients) {
    const agency = c.CL_Agency || "No agency";
    byAgency.set(agency, [...(byAgency.get(agency) ?? []), c.CL_Business_Unit_Region]);
  }
  return [...byAgency.keys()]
    .sort()
    .map((a) => {
      const regions = uniq(byAgency.get(a)!);
      return regions ? `${a} (${regions})` : a;
    })
    .join(", ");
}

function namer(users: UserRecord[]) {
  const names = new Map(users.map((u) => [u.email, u.displayName]));
  return (email: string) => names.get(email) || nameFromEmail(email);
}

/**
 * Dashboard Access tab: one row per dashboard × person × source — Dashboard
 * Name, Agencies (Regions), # Clients, Access Granted Via, Name, Email — sorted
 * by dashboard, then source, then name, so filtering on a dashboard lists
 * everyone who sees it and filtering on a name lists everything they see.
 * People who haven't signed in yet are included (their access applies on
 * first sign-in). Tabs hidden for everyone and revoked people are left out; a
 * source that opens no client gets no row.
 */
export function buildDashboardAccess(input: AccessReportInput): string[][] {
  const { users, clients, grants, agencyDomains, companyDomains, dashboardAccess, mediaboxAllocations, tabLabels } = input;
  const shown = shownClients(clients);
  const userBy = new Map(users.map((u) => [u.email, u]));
  const grantBy = new Map(grants.map((g) => [normalizeEmail(g.email), g.tabs]));
  const nameOf = namer(users);
  const hidden = hiddenPagesFor({ dashboardAccess });
  // Everyone with a user row or a grant, plus client-team members and MediaBox
  // users who haven't signed in yet (they see these dashboards on first
  // sign-in) — only on company domains, the only ones that can sign in.
  const signInDomains = new Set([...Object.values(agencyDomains).flat(), ...companyDomains].map((d) => d.toLowerCase()));
  const seated = shown.flatMap((c) => [...(c.CL_Team_Emails ?? []), ...(mediaboxAllocations ? c.CL_MediaBox_Emails ?? [] : [])]);
  const emails = [
    ...new Set([
      ...userBy.keys(),
      ...grantBy.keys(),
      ...seated.map(normalizeEmail).filter((e) => signInDomains.has(e.split("@")[1] ?? "")),
    ]),
  ].filter((e) => e && !userBy.get(e)?.disabled);

  const rows: { tab: number; source: string; name: string; cells: string[] }[] = [];
  // `everything`: the source opens every agency and region (shown as "All agencies").
  const add = (tab: DashboardTabId, source: string, email: string, covered: Client[], everything = false) => {
    if (covered.length === 0) return;
    rows.push({
      tab: DASHBOARD_TABS.indexOf(tab),
      source,
      name: nameOf(email),
      cells: [
        tabLabels[tab],
        everything ? "All agencies" : agencyRegions(covered),
        String(covered.length),
        source,
        nameOf(email),
        email,
      ],
    });
  };

  for (const email of emails) {
    const tabs = DASHBOARD_TABS.filter((t) => !hidden.has(t));
    if (userBy.get(email)?.role === "ADMIN") {
      for (const tab of tabs) add(tab, ACCESS_SOURCES.admin, email, shown, true);
      continue;
    }
    const ctx: AccessContext = {
      email,
      isAdmin: false,
      disabled: false,
      agencyDomains,
      companyDomains,
      grants: grantBy.get(email) ?? {},
      dashboardAccess,
      mediaboxAllocations,
    };
    const team = shown.filter((c) => isOnClientTeam(email, c));
    for (const tab of tabs) {
      if (tab === "forecaster") add(tab, ACCESS_SOURCES.team, email, team);
      if (mediaboxAllocations && ALLOCATION_TABS.includes(tab)) {
        // Team ∪ MediaBox allocation, labelled by which of the two it comes from.
        const covered = shown.filter((c) => allocationCoversClient(ctx, c));
        const viaTeam = covered.some((c) => team.includes(c));
        const viaMediabox = covered.some((c) => isAllocatedTo(email, c));
        const source = viaTeam && viaMediabox ? ACCESS_SOURCES.teamAndMediabox : viaTeam ? ACCESS_SOURCES.team : ACCESS_SOURCES.mediabox;
        add(tab, source, email, covered);
      } else if (AGENCY_DEFAULT_TABS.includes(tab)) {
        const d = domainScope(ctx);
        if (d.all) add(tab, ACCESS_SOURCES.global, email, shown, true);
        else add(tab, ACCESS_SOURCES.domain, email, shown.filter((c) => d.agencies.includes(c.CL_Agency)));
      }
      const g = ctx.grants[tab];
      if (g) {
        const covered = shown.filter((c) => grantCoversClient(g, c));
        add(tab, ACCESS_SOURCES.grant, email, covered, !g.clients?.length && g.allAgencies && g.allRegions);
      }
    }
  }

  rows.sort(
    (a, b) =>
      a.tab - b.tab ||
      SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) ||
      a.name.localeCompare(b.name)
  );
  return [["Dashboard Name", "Agencies (Regions)", "# Clients", "Access Granted Via", "Name", "Email"], ...rows.map((r) => r.cells)];
}

/**
 * Client teams - Client List tab: per client (by name), its Forecaster team
 * seats (GM, Business Lead, Digital Lead, Collaborator) then the people
 * allocated to it in MediaBox (Role "User"). The Forecaster team opens the
 * Forecaster dashboard; team + MediaBox users open the dashboards that follow
 * MediaBox allocations. A person on both is listed under each.
 */
export function buildClientTeamList(input: Pick<AccessReportInput, "users" | "clients">): string[][] {
  const nameOf = namer(input.users);
  const order = new Map(TEAM_ROLES.map((r, i) => [r, i]));
  const rows: string[][] = [];
  for (const c of shownClients(input.clients)) {
    const base = [c.cl_id, c.CL_Name, c.CL_Agency, c.CL_Business_Unit_Region];
    const seats = teamSeats(c).sort((a, b) => order.get(a.role)! - order.get(b.role)! || a.email.localeCompare(b.email));
    for (const s of seats) {
      rows.push([ACCESS_SOURCES.team, ...base, TEAM_ROLE_LABELS[s.role], s.email, nameOf(s.email)]);
    }
    const mediabox = [...new Set((c.CL_MediaBox_Emails ?? []).map(normalizeEmail).filter(Boolean))].sort();
    for (const email of mediabox) {
      rows.push([ACCESS_SOURCES.mediabox, ...base, "User", email, nameOf(email)]);
    }
  }
  return [["Access Granted Via", "Client ID", "Client Name", "Agency", "Region", "Role", "Email", "Name"], ...rows];
}

/** Grant - Client List tab: person × dashboard × client for every grant. */
export function buildGrantClients(input: Pick<AccessReportInput, "users" | "clients" | "grants" | "tabLabels">): string[][] {
  const { grants, tabLabels } = input;
  const shown = shownClients(input.clients);
  const nameOf = namer(input.users);
  const rows: string[][] = [];
  for (const g of [...grants].sort((a, b) => nameOf(a.email).localeCompare(nameOf(b.email)))) {
    for (const tab of DASHBOARD_TABS) {
      const scope = g.tabs[tab];
      if (!scope) continue;
      for (const c of shown) {
        if (!grantCoversClient(scope, c)) continue;
        rows.push([g.email, nameOf(g.email), tabLabels[tab], c.cl_id, c.CL_Name, c.CL_Agency, c.CL_Business_Unit_Region]);
      }
    }
  }
  return [["Email", "Name", "Dashboard Name", "Client ID", "Client Name", "Agency", "Region"], ...rows];
}
