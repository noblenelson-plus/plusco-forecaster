// components/forecaster/forecaster-tabs.config.ts

import { TrendingUp, DollarSign, Package, type LucideIcon } from "lucide-react";

// Tabs for the Forecaster comparison dashboard. Media and Labs are merged into
// one section (unlike the main Dashboard's four tabs).
export type ForecasterTab = "media-labs" | "revenue" | "product";

export const FORECASTER_TABS: { id: ForecasterTab; label: string; icon: LucideIcon }[] = [
  { id: "media-labs", label: "Media & Labs", icon: TrendingUp },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "product", label: "Product", icon: Package },
];