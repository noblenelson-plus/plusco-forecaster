// components/forecaster/forecaster-tabs.config.ts

import {
  LayoutDashboard,
  Gauge,
  TrendingUp,
  FlaskConical,
  DollarSign,
  Package,
  Box,
  Waves,
  FileText,
  type LucideIcon,
} from "lucide-react";

// Tabs for the home Dashboard (the merged comparison dashboard). Order here
// drives the tab bar left-to-right; the page renders by tab id, not position.
// "Reports" groups the two Looker-export replacements (MIR Raw Data and
// Billing Summary) into a single tab with sub-tabs — see reports-tabs.tsx.
export type ForecasterTab =
  | "exec"
  | "revenue"
  | "media"
  | "labs"
  | "product"
  | "exec-kpis"
  | "mediabox"
  | "mediaocean"
  | "reports";

export const FORECASTER_TABS: { id: ForecasterTab; label: string; icon: LucideIcon }[] = [
  { id: "exec", label: "Forecast Summary", icon: LayoutDashboard },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "labs", label: "Labs", icon: FlaskConical },
  { id: "product", label: "Product", icon: Package },
  { id: "exec-kpis", label: "Executive KPIs", icon: Gauge },
  { id: "mediabox", label: "MediaBox Adoption", icon: Box },
  { id: "mediaocean", label: "MediaOcean", icon: Waves },
  { id: "reports", label: "Reports", icon: FileText },
];

// Tabs surfacing revenue figures — hidden from users without revenue access
// (agency Viewers). The Summary leads with revenue KPIs, so it goes too.
const REVENUE_TABS: ForecasterTab[] = ["exec", "revenue"];
// The high-level, all-clients dashboards — Exec and Admin only. Reports (MIR
// Raw Data + Billing Summary) carries the same gating its two former tabs had.
const GLOBAL_DASHBOARD_TABS: ForecasterTab[] = ["exec-kpis", "reports"];

/**
 * The dashboard tabs a user may see, from their capability flags:
 *   - Viewer (no revenue, no global) → Media Spend, Labs, Product, MediaBox,
 *     MediaOcean.
 *   - Business Lead (revenue) → the above + Forecast Summary + Revenue.
 *   - Exec / Admin (revenue + global) → the full set incl. Executive KPIs and
 *     Reports.
 */
export function visibleForecasterTabs(perms: {
  canViewRevenue: boolean;
  canViewGlobalDashboard: boolean;
}) {
  return FORECASTER_TABS.filter((t) => {
    if (REVENUE_TABS.includes(t.id) && !perms.canViewRevenue) return false;
    if (GLOBAL_DASHBOARD_TABS.includes(t.id) && !perms.canViewGlobalDashboard)
      return false;
    return true;
  });
}
