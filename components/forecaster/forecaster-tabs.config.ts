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
import type { GrantableDashboardId } from "../../lib/types/access.types";

// Top-level tabs of the home Dashboard. Order here drives the tab bar
// left-to-right; the page renders by tab id, not position. Tabs with sub-tabs
// (Forecaster Dashboard, Exec KPI Dashboard, Media Investments Report, Reports)
// list them in dashboard-pages.config.ts.
export type ForecasterTab = "forecaster" | GrantableDashboardId;

/**
 * Who sees a tab (app/(protected)/page.tsx, via useAccess):
 *   - Forecaster → admins and anyone on a client team; it shows their team
 *     clients (Admin: all).
 *   - Every other tab → admins and people granted it in Admin → Dashboard
 *     Access (by email domain or person); it shows every client (Global mode)
 *     or the clients of their agencies (Agency mode). Agency-partitioned data
 *     (Media Investments Report, Reports) follows the same scope, enforced by
 *     Firestore/Storage rules — see lib/format/access.ts.
 */
export const FORECASTER_TABS: {
  id: ForecasterTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "forecaster", label: "Forecaster", icon: LayoutDashboard },
  { id: "labs-pacing", label: "Labs Pacing", icon: Activity },
  { id: "exec-kpis", label: "Exec KPI Dashboard", icon: Gauge },
  { id: "mediaocean", label: "Media Investments Report (Mediaocean)", icon: Waves },
  { id: "mediabox", label: "MediaBox Adoption", icon: Box },
  { id: "reports", label: "Reports (Raw Data Download)", icon: FileText },
];
