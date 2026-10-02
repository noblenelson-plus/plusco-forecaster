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
import type { UserRole } from "../../lib/types/user.types";

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

/** Every role, lowest access first (the column order of Admin → Dashboard Pages). */
export const DASHBOARD_ROLES: readonly UserRole[] = [
  "VIEWER",
  "BUSINESS_LEAD",
  "EXEC",
  "ADMIN",
];
const EXEC_AND_ADMIN: readonly UserRole[] = ["EXEC", "ADMIN"];

/**
 * `roles` is who sees the tab by default — admins can change it per role in
 * Admin → Dashboard Pages (dashboard-pages.config.ts resolves the effective
 * access). Which clients each tab covers is decided in app/(protected)/page.tsx:
 * the Forecaster Dashboard shows the user's assigned clients (Admin: all); every
 * other tab shows the agencies their email domain maps to (Admin and
 * company-wide domains: all). The Media Investments Report and Reports data is
 * agency-partitioned and enforced by Firestore/Storage rules — see
 * lib/format/agency-scope.ts.
 */
export const FORECASTER_TABS: {
  id: ForecasterTab;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}[] = [
  { id: "forecaster", label: "Forecaster", icon: LayoutDashboard, roles: DASHBOARD_ROLES },
  { id: "labs-pacing", label: "Labs Pacing", icon: Activity, roles: DASHBOARD_ROLES },
  // The high-level KPI dashboard and MediaBox Adoption: Execs (and Admins).
  { id: "exec-kpis", label: "Exec KPI Dashboard", icon: Gauge, roles: EXEC_AND_ADMIN },
  { id: "mediaocean", label: "Media Investments Report (Mediaocean)", icon: Waves, roles: DASHBOARD_ROLES },
  { id: "mediabox", label: "MediaBox Adoption", icon: Box, roles: EXEC_AND_ADMIN },
  { id: "reports", label: "Reports (Raw Data Download)", icon: FileText, roles: DASHBOARD_ROLES },
];
