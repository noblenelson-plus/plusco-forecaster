// components/forecaster/sections/revenue-by-group-data.ts

/**
 * Revenue by group (Agency / Agency + Region / Region / GM) for the Revenues
 * tab: rolls the Client Revenue rows (computeClientRevenue — same modes, same
 * revenue-types filter, same scope) up by a client attribute, so GMs can see
 * e.g. "Cossette Media: −$500K vs last year" and which clients drive it. The
 * grand total therefore always equals the Client Revenue table's. Pure.
 */

import { CLIENT_GM_PODS } from "../../../lib/constants/client.constants";
import type { Client } from "../../../lib/types/client.types";
import type { ClientRevenueRow } from "./client-revenue-data";

export type RevenueGroupBy = "agency" | "agencyRegion" | "region" | "gm";

export const REVENUE_GROUP_OPTIONS: { id: RevenueGroupBy; label: string }[] = [
  { id: "agency", label: "Agency" },
  { id: "agencyRegion", label: "Agency + Region" },
  { id: "region", label: "Region" },
  { id: "gm", label: "GM" },
];

export interface RevenueGroupRow {
  group: string;
  clients: number;
  primary: number;
  secondary: number;
  /** primary − secondary. */
  change: number;
  /** change / |secondary| × 100; null when secondary is 0. */
  changePct: number | null;
  /** The group's clients, biggest |change| first (for the drill-down). */
  members: ClientRevenueRow[];
}

const gmLabel = (v?: string) => (v ? CLIENT_GM_PODS.find((g) => g.value === v)?.label ?? v : "");

function groupLabel(c: Client | undefined, by: RevenueGroupBy): string {
  if (!c) return "—";
  const agency = c.CL_Agency || "No agency";
  const region = c.CL_Business_Unit_Region || "No region";
  switch (by) {
    case "agency":
      return agency;
    case "agencyRegion":
      return `${agency} · ${region}`;
    case "region":
      return region;
    case "gm":
      return gmLabel(c.GM_Pod) || "No GM";
  }
}

/** Groups ordered by the biggest drop first (most negative change), then name. */
export function computeRevenueByGroup(
  rows: ClientRevenueRow[],
  clients: Client[],
  by: RevenueGroupBy
): RevenueGroupRow[] {
  const byId = new Map(clients.map((c) => [c.cl_id, c]));
  const acc = new Map<string, RevenueGroupRow>();
  for (const r of rows) {
    const g = groupLabel(byId.get(r.clientId), by);
    const cur =
      acc.get(g) ??
      { group: g, clients: 0, primary: 0, secondary: 0, change: 0, changePct: null, members: [] };
    cur.clients += 1;
    cur.primary += r.primary;
    cur.secondary += r.secondary;
    cur.members.push(r);
    acc.set(g, cur);
  }
  return [...acc.values()]
    .map((g) => {
      const change = g.primary - g.secondary;
      return {
        ...g,
        change,
        // Divide by the size of the base so a negative base keeps the sign right.
        changePct: g.secondary !== 0 ? (change / Math.abs(g.secondary)) * 100 : null,
        members: [...g.members].sort(
          (a, b) => Math.abs(b.primary - b.secondary) - Math.abs(a.primary - a.secondary)
        ),
      };
    })
    .sort((a, b) => a.change - b.change || a.group.localeCompare(b.group));
}
