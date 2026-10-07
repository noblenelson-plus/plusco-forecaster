// components/forecaster/dashboard-pages.config.ts

import { FORECASTER_TABS, type ForecasterTab } from "./forecaster-tabs.config";

/**
 * Registry of the dashboard sub-tabs. The lists live here (not in their
 * containers) so the dashboard and Admin → Dashboard Access share one source
 * of ids and labels.
 *
 * Page ids: "tab/sub" ("exec-kpis/meta"). Who sees a tab is decided by
 * client teams and dashboard grants (forecaster-tabs.config.ts); a sub-tab is
 * visible to everyone who sees its tab unless an admin hid it
 * (config/dashboard_access `hiddenSubtabs`, for work-in-progress pages —
 * admins still see it). Add a new sub-tab here, not in its container.
 */

type SubTabDef = {
  readonly id: string;
  readonly label: string;
};

export const FORECASTER_SUBTABS = [
  { id: "exec", label: "Forecast Summary" },
  { id: "revenue", label: "Revenues" },
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

export interface DashboardSubPage {
  /** "tab/sub". */
  id: string;
  label: string;
}

/** Every tab in tab-bar order with its sub-tabs (Admin → Dashboard Access). */
export const DASHBOARD_PAGES: { id: ForecasterTab; label: string; children: DashboardSubPage[] }[] =
  FORECASTER_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    children: (SUBTABS_BY_TAB[t.id] ?? []).map((sub) => ({
      id: subPageId(t.id, sub.id),
      label: sub.label,
    })),
  }));

/** Every sub-tab page id (to drop stale ids from a saved config). */
export const SUBTAB_PAGE_IDS: ReadonlySet<string> = new Set(
  DASHBOARD_PAGES.flatMap((p) => p.children.map((c) => c.id))
);

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
