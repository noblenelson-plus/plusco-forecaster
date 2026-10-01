// components/forecaster/dashboard-pages.config.ts

import {
  ALL_DASHBOARD_PERMS,
  FORECASTER_TABS,
  type DashboardPerms,
  type ForecasterTab,
} from "./forecaster-tabs.config";

/**
 * Registry of every dashboard page an admin can show/hide from
 * Admin → Dashboard Pages: each top-level tab (FORECASTER_TABS) and each
 * sub-tab below. The sub-tab lists live here (not in their containers) so the
 * admin page and the dashboard share one source of ids and labels.
 *
 * Page ids: a tab's id ("exec-kpis") or "tab/sub" ("exec-kpis/meta"). Hidden
 * ids are stored in config/dashboard_pages (dashboard-pages-service.ts, which
 * also maps ids saved under an older layout — update it if you move a page).
 * Hiding is presentation only — data access is unchanged (security rules).
 */

type SubTabDef = {
  readonly id: string;
  readonly label: string;
  /** Shows revenue figures — hidden from roles without revenue access. */
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
  { id: "summary", label: "Executive Summary" },
  { id: "investment", label: "Investment Strategy KPIs" },
  { id: "meta", label: "Meta" },
  { id: "labs-pacing", label: "Labs Pacing" },
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
  children: { id: string; label: string }[];
}

/** Every switchable page, tabs in tab-bar order with their sub-tabs nested. */
export const DASHBOARD_PAGES: DashboardPage[] = FORECASTER_TABS.map((t) => ({
  id: t.id,
  label: t.label,
  children: (SUBTABS_BY_TAB[t.id] ?? []).map((s) => ({
    id: subPageId(t.id, s.id),
    label: s.label,
  })),
}));

/**
 * The sub-tabs of `tab` this role may see and an admin has not hidden (keeps
 * the caller's element type). Without `perms`, every role's sub-tabs count.
 */
export function visibleSubtabs<T extends SubTabDef>(
  tab: ForecasterTab,
  subtabs: readonly T[],
  hidden: ReadonlySet<string>,
  perms: DashboardPerms = ALL_DASHBOARD_PERMS
): T[] {
  return subtabs.filter(
    (s) =>
      !(s.revenue && !perms.canViewRevenue) && !hidden.has(subPageId(tab, s.id))
  );
}

/**
 * A tab shows unless it is hidden itself, or it has sub-tabs and none of them
 * is left for this role (an empty sub-tab bar would be a dead end).
 */
export function isTabVisible(
  tab: ForecasterTab,
  hidden: ReadonlySet<string>,
  perms: DashboardPerms = ALL_DASHBOARD_PERMS
): boolean {
  if (hidden.has(tab)) return false;
  const subs = SUBTABS_BY_TAB[tab];
  return !subs || visibleSubtabs(tab, subs, hidden, perms).length > 0;
}
