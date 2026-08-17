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
  Database,
  Receipt,
  type LucideIcon,
} from "lucide-react";

// Tabs for the home Dashboard (the merged comparison dashboard). A Summary
// leads, then one tab per axis, and the external-source tabs close it out.
export type ForecasterTab =
  | "exec"
  | "exec-kpis"
  | "media"
  | "labs"
  | "revenue"
  | "product"
  | "mediabox"
  | "mediaocean"
  | "mir-raw"
  | "billing-summary";

export const FORECASTER_TABS: { id: ForecasterTab; label: string; icon: LucideIcon }[] = [
  { id: "exec", label: "Summary", icon: LayoutDashboard },
  { id: "exec-kpis", label: "Executive KPIs", icon: Gauge },
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "labs", label: "Labs", icon: FlaskConical },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "product", label: "Product", icon: Package },
  { id: "mediabox", label: "MediaBox Adoption", icon: Box },
  { id: "mediaocean", label: "MediaOcean", icon: Waves },
  { id: "mir-raw", label: "MIR Raw Data", icon: Database },
  { id: "billing-summary", label: "Billing Summary", icon: Receipt },
];

// Tabs surfacing revenue figures â€” hidden from users without revenue access
// (agency Viewers). The Summary leads with revenue KPIs, so it goes too.
const REVENUE_TABS: ForecasterTab[] = ["exec", "revenue"];
// The high-level, all-clients dashboard â€” Exec and Admin only.
const GLOBAL_DASHBOARD_TABS: ForecasterTab[] = ["exec-kpis", "mir-raw", "billing-summary"];

/**
 * The dashboard tabs a user may see, from their capability flags:
 *   - Viewer (no revenue, no global) â†’ Media Spend, Labs, Product, MediaBox,
 *     MediaOcean.
 *   - Business Lead (revenue) â†’ the above + Summary + Revenue.
 *   - Exec / Admin (revenue + global) â†’ the full set incl. Executive KPIs.
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
