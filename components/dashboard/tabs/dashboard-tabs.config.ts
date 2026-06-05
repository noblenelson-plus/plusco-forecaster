// components/dashboard/tabs/dashboard-tabs.config.ts

import { TrendingUp, DollarSign, FlaskConical, type LucideIcon } from "lucide-react";

export type DashboardTab = "media" | "revenue" | "labs";

export const DASHBOARD_TABS: { id: DashboardTab; label: string; icon: LucideIcon }[] = [
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "labs", label: "Labs", icon: FlaskConical },
];
