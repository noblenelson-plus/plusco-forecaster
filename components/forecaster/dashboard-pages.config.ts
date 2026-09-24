// components/forecaster/dashboard-pages.config.ts

import { FORECASTER_TABS, type ForecasterTab } from "./forecaster-tabs.config";

/**
 * Registry of every dashboard page an admin can show/hide from
 * Admin → Dashboard Pages: each top-level tab (FORECASTER_TABS) and each
 * sub-tab below. The sub-tab lists live here (not in their containers) so the
 * admin page and the dashboard share one source of ids and labels.
 *
 * Page ids: a tab's id ("exec-kpis") or "tab/sub" ("exec-kpis/meta"). Hidden
 * ids are stored in config/dashboard_pages (dashboard-pages-service.ts).
 * Hiding is presentation only — data access is unchanged (security rules).
 */

export const EXEC_KPIS_SUBTABS = [
  { id: "summary", label: "Executive Summary" },
  { id: "investment", label: "Investment Strategy KPIs" },
  { id: "meta", label: "Meta" },
  { id: "labs-pacing", label: "Labs Pacing" },
  { id: "billups", label: "Billups" },
  { id: "local-media", label: "Local Media" },
] as const;
export type ExecSubTab = (typeof EXEC_KPIS_SUBTABS)[number]["id"];

export const MEDIAOCEAN_SUBTABS = [
  { id: "investments", label: "Media Investments" },
  { id: "kpis", label: "KPIs Media and Labs" },
] as const;
export type MediaOceanSubTab = (typeof MEDIAOCEAN_SUBTABS)[number]["id"];

export const REPORTS_SUBTABS = [
  { id: "mir-raw", label: "Mediaocean Data (MIR)" },
  { id: "billing", label: "Mediaocean Billing Summary" },
] as const;
export type ReportsSubTab = (typeof REPORTS_SUBTABS)[number]["id"];

type SubTabDef = { readonly id: string; readonly label: string };

const SUBTABS_BY_TAB: Partial<Record<ForecasterTab, readonly SubTabDef[]>> = {
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

/** The sub-tabs of `tab` that are not hidden (keeps the caller's element type). */
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
