// lib/dashboard/widgets/widget.types.ts

import type { RFQ } from "../../types/rfq.types";

/**
 * The slice of state every dashboard widget renders against: the filtered
 * client scope plus the global submission context. Widgets read forecast data
 * for these clients/year/rfq and render a ratio card or a chart.
 */
export interface DashboardScope {
  clientIds: string[];
  year: number | null;
  rfq: RFQ | null;
}

/**
 * A dashboard widget — a self-contained card or chart. Register one in
 * `registry.ts` to make it appear on the dashboard.
 */
export interface DashboardWidget {
  id: string;
  title: string;
  /** Grid columns to span on large screens (1 = half width, 2 = full). Default 1. */
  span?: 1 | 2;
  Component: React.FC<{ scope: DashboardScope }>;
}
