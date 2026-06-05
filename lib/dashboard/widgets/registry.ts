// lib/dashboard/widgets/registry.ts

/**
 * Registry of dashboard widgets, rendered in order by DashboardGrid.
 *
 * To add a ratio card or chart: create a component under
 * `components/dashboard/widgets/` taking `{ scope }`, then add an entry here.
 * No other file changes.
 */

import ClientsInScopeCard from "../../../components/dashboard/widgets/clients-in-scope-card";
import type { DashboardWidget } from "./widget.types";

export const WIDGETS: DashboardWidget[] = [
  {
    id: "clients-in-scope",
    title: "Clients in scope",
    span: 1,
    Component: ClientsInScopeCard,
  },
];
