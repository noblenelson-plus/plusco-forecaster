// components/forecaster/forecaster-tabs.config.ts

import {
  LayoutDashboard,
  Gauge,
  Activity,
  Box,
  Waves,
  FileText,
  type LucideIcon,
} from "lucide-react";

// Top-level tabs of the home Dashboard. Order here drives the tab bar
// left-to-right; the page renders by tab id, not position. Tabs with sub-tabs
// (Forecaster Dashboard, Exec KPI Dashboard, Media Investments Report, Reports)
// list them in dashboard-pages.config.ts.
export type ForecasterTab =
  | "forecaster"
  | "labs-pacing"
  | "exec-kpis"
  | "mediaocean"
  | "mediabox"
  | "reports";

export const FORECASTER_TABS: { id: ForecasterTab; label: string; icon: LucideIcon }[] = [
  { id: "forecaster", label: "Forecaster Dashboard", icon: LayoutDashboard },
  { id: "labs-pacing", label: "Labs Pacing", icon: Activity },
  { id: "exec-kpis", label: "Exec KPI Dashboard", icon: Gauge },
  { id: "mediaocean", label: "Media Investments Report (Mediaocean)", icon: Waves },
  { id: "mediabox", label: "MediaBox Adoption", icon: Box },
  { id: "reports", label: "Reports (Raw Data Download)", icon: FileText },
];

/** The capability flags that decide which dashboard pages a role sees. */
export interface DashboardPerms {
  canViewRevenue: boolean;
  canViewGlobalDashboard: boolean;
}

/** Every page shown — used where no role applies (the admin page list). */
export const ALL_DASHBOARD_PERMS: DashboardPerms = {
  canViewRevenue: true,
  canViewGlobalDashboard: true,
};

// The high-level, all-clients dashboards — Exec and Admin only.
const GLOBAL_DASHBOARD_TABS: ForecasterTab[] = ["exec-kpis"];

/**
 * The top-level tabs a user may see, from their capability flags:
 *   - Viewer (no revenue, no global) → Forecaster Dashboard (Media, Labs,
 *     Product only — see the revenue sub-tabs in dashboard-pages.config.ts),
 *     Labs Pacing, Media Investments Report, MediaBox, Reports.
 *   - Business Lead (revenue) → the above, with Forecast Summary + Revenues.
 *   - Exec / Admin (revenue + global) → the full set incl. Exec KPI Dashboard.
 *
 * Labs Pacing reads the same forecast data as the Labs sub-tab (each user's
 * accessible clients only). The Media Investments Report and Reports are open
 * to everyone because their data is agency-partitioned: each user only
 * receives their own agencies' rows (Admin: all), enforced by Firestore/Storage
 * rules — see lib/format/agency-scope.ts.
 */
export function visibleForecasterTabs(perms: DashboardPerms) {
  return FORECASTER_TABS.filter(
    (t) => !(GLOBAL_DASHBOARD_TABS.includes(t.id) && !perms.canViewGlobalDashboard)
  );
}
