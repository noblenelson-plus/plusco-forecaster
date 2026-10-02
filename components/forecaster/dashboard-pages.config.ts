// components/forecaster/dashboard-pages.config.ts

import {
  DASHBOARD_ROLES,
  FORECASTER_TABS,
  type ForecasterTab,
} from "./forecaster-tabs.config";
import type { UserRole } from "../../lib/types/user.types";

/**
 * Registry of every dashboard page an admin manages from Admin → Dashboard
 * Pages: each top-level tab (FORECASTER_TABS) and each sub-tab below, with the
 * roles that see it. The sub-tab lists live here (not in their containers) so
 * the admin page and the dashboard share one source of ids and labels.
 *
 * Page ids: a tab's id ("exec-kpis") or "tab/sub" ("exec-kpis/meta"). Admins
 * pick the roles per page; saved choices live in config/dashboard_pages
 * (dashboard-pages-service.ts, which also maps ids saved under an older layout
 * — update it if you move a page). A page nobody edited keeps its default
 * roles. A sub-tab shows only if its tab shows for that role.
 *
 * Presentation only — data access is unchanged (security rules). That is why
 * revenue pages are locked off for Viewers: the rules don't hide revenue
 * figures, so showing those pages to a Viewer would really expose them.
 */

type SubTabDef = {
  readonly id: string;
  readonly label: string;
  /** Shows revenue figures — never shown to Viewers (no revenue access). */
  readonly revenue?: boolean;
};

export const FORECASTER_SUBTABS = [
  // The Summary leads with revenue KPIs, so it is a revenue page too.
  { id: "exec", label: "Forecast Summary", revenue: true },
  { id: "revenue", label: "Revenues", revenue: true },
  { id: "media", label: "Media" },
  { id: "labs", label: "Labs" },
  { id: "product", label: "Product" },
] as const satisfies readonly SubTabDef[];
export type ForecasterSubTab = (typeof FORECASTER_SUBTABS)[number]["id"];

export const EXEC_KPIS_SUBTABS = [
  { id: "summary", label: "Media & Labs KPIs" },
  { id: "investment", label: "Investment Strategy KPIs" },
  { id: "meta", label: "Meta" },
  { id: "labs-pacing", label: "Deal Pacing" },
  { id: "billups", label: "Billups" },
  { id: "local-media", label: "Local Media" },
] as const satisfies readonly SubTabDef[];
export type ExecSubTab = (typeof EXEC_KPIS_SUBTABS)[number]["id"];

export const MEDIAOCEAN_SUBTABS = [
  { id: "investments", label: "Media Investments" },
  { id: "kpis", label: "KPIs Media and Labs" },
] as const satisfies readonly SubTabDef[];
export type MediaOceanSubTab = (typeof MEDIAOCEAN_SUBTABS)[number]["id"];

export const REPORTS_SUBTABS = [
  { id: "mir-raw", label: "Mediaocean Data (MIR)" },
  { id: "billing", label: "Mediaocean Billing Summary" },
] as const satisfies readonly SubTabDef[];
export type ReportsSubTab = (typeof REPORTS_SUBTABS)[number]["id"];

const SUBTABS_BY_TAB: Partial<Record<ForecasterTab, readonly SubTabDef[]>> = {
  forecaster: FORECASTER_SUBTABS,
  "exec-kpis": EXEC_KPIS_SUBTABS,
  mediaocean: MEDIAOCEAN_SUBTABS,
  reports: REPORTS_SUBTABS,
};

/** Page id of a sub-tab, e.g. subPageId("exec-kpis", "meta") → "exec-kpis/meta". */
export function subPageId(tab: ForecasterTab, sub: string): string {
  return `${tab}/${sub}`;
}

export interface DashboardPage {
  id: string;
  label: string;
  /** Who sees it when no admin has changed it. */
  defaultRoles: readonly UserRole[];
  /** Roles that may never see it (switch locked on the admin page). */
  lockedRoles: readonly UserRole[];
  children: Omit<DashboardPage, "children">[];
}

const NO_ROLES: readonly UserRole[] = [];
const REVENUE_LOCKED: readonly UserRole[] = ["VIEWER"];

/** Every page, tabs in tab-bar order with their sub-tabs nested. */
export const DASHBOARD_PAGES: DashboardPage[] = FORECASTER_TABS.map((t) => ({
  id: t.id,
  label: t.label,
  defaultRoles: t.roles,
  lockedRoles: NO_ROLES,
  children: (SUBTABS_BY_TAB[t.id] ?? []).map((s) => {
    const locked = s.revenue ? REVENUE_LOCKED : NO_ROLES;
    return {
      id: subPageId(t.id, s.id),
      label: s.label,
      defaultRoles: DASHBOARD_ROLES.filter((r) => !locked.includes(r)),
      lockedRoles: locked,
    };
  }),
}));

const PAGE_BY_ID = new Map(
  DASHBOARD_PAGES.flatMap((p) => [p, ...p.children]).map((p) => [p.id, p])
);

/** Saved role choices per page id (only pages an admin has set). */
export type PageAccess = Readonly<Record<string, readonly UserRole[]>>;

/**
 * The roles that see a page: the admin's choice, else the page default; a page
 * hidden under the older all-or-nothing switch (`hidden`) sees no one. Locked
 * roles are always removed.
 */
export function pageRoles(
  pageId: string,
  access: PageAccess,
  hidden: ReadonlySet<string> = new Set()
): UserRole[] {
  const page = PAGE_BY_ID.get(pageId);
  if (!page) return [];
  const chosen = access[pageId] ?? (hidden.has(pageId) ? NO_ROLES : page.defaultRoles);
  return DASHBOARD_ROLES.filter((r) => chosen.includes(r) && !page.lockedRoles.includes(r));
}

/** The full, effective role map for every page (what the admin page edits). */
export function resolvePageAccess(
  access: PageAccess,
  hidden: ReadonlySet<string> = new Set()
): Record<string, UserRole[]> {
  return Object.fromEntries([...PAGE_BY_ID.keys()].map((id) => [id, pageRoles(id, access, hidden)]));
}

/**
 * The page ids a role does NOT see — a sub-tab is also hidden when its tab is.
 * The dashboard filters its tab bar and sub-tab containers with this set.
 */
export function hiddenPagesForRole(
  role: UserRole | null | undefined,
  access: PageAccess,
  hidden: ReadonlySet<string> = new Set()
): Set<string> {
  const out = new Set<string>();
  for (const page of DASHBOARD_PAGES) {
    const tabOn = !!role && pageRoles(page.id, access, hidden).includes(role);
    if (!tabOn) out.add(page.id);
    for (const child of page.children) {
      if (!tabOn || !pageRoles(child.id, access, hidden).includes(role!)) out.add(child.id);
    }
  }
  return out;
}

/** The sub-tabs of `tab` not in `hidden` (keeps the caller's element type). */
export function visibleSubtabs<T extends SubTabDef>(
  tab: ForecasterTab,
  subtabs: readonly T[],
  hidden: ReadonlySet<string>
): T[] {
  return subtabs.filter((s) => !hidden.has(subPageId(tab, s.id)));
}

/**
 * A tab shows unless it is hidden itself, or it has sub-tabs and every one of
 * them is hidden (an empty sub-tab bar would be a dead end).
 */
export function isTabVisible(tab: ForecasterTab, hidden: ReadonlySet<string>): boolean {
  if (hidden.has(tab)) return false;
  const subs = SUBTABS_BY_TAB[tab];
  return !subs || visibleSubtabs(tab, subs, hidden).length > 0;
}
