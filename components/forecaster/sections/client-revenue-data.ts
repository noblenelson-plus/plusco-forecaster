// components/forecaster/sections/client-revenue-data.ts

/**
 * Builds one row per client for the Client Revenue table. Primary reads the
 * primary submission's chosen mode (BL/OF); Secondary reads the comparison
 * submission's chosen mode — reproducing "RFQ2-BL vs RFQ1-OF". Currency
 * (CAD-normalized vs native USD) is already handled upstream by the hook.
 */

import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Client } from "../../../lib/types/client.types";
import type { MonthlyMap } from "../../../lib/types/common.types";

const sumM = (m?: MonthlyMap) =>
  Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

// Sum every stream of a client's revenue (a Record<streamKey, MonthlyMap>).
function sumClientRevenue(byStream: Record<string, MonthlyMap> | undefined): number {
  if (!byStream) return 0;
  return Object.values(byStream).reduce((a, m) => a + sumM(m), 0);
}

export interface ClientRevenueRow {
  clientId: string;
  name: string;
  businessLead: string;
  feeStructure: string;
  status: string;
  notes: string;
  primary: number;
  secondary: number;
  variance: number; // primary − secondary
  relative: number | null; // variance %
}

export interface ClientRevenueResult {
  rows: ClientRevenueRow[];
  totalPrimary: number;
  totalSecondary: number;
}

export function computeClientRevenue(
  data: ScopeForecastData,
  comparisonData: ScopeForecastData,
  clients: Client[],
  usersMap: Map<string, string>,
  year: number,
  scopedClientIds: string[],
  primaryMode: RevenueMode,
  secondaryMode: RevenueMode,
  hasComparison: boolean
): ClientRevenueResult {
  const clientById = new Map(clients.map((c) => [c.cl_id, c]));

  // clientId → summed revenue, for the chosen mode on each side.
  const primaryByClient = new Map(
    data.revenueByMode[primaryMode].byClient.map((r) => [r.clientId, sumClientRevenue(r.byStream)])
  );
  const secondaryByClient = new Map(
    hasComparison
      ? comparisonData.revenueByMode[secondaryMode].byClient.map((r) => [r.clientId, sumClientRevenue(r.byStream)])
      : []
  );

  let totalPrimary = 0;
  let totalSecondary = 0;

  const rows: ClientRevenueRow[] = scopedClientIds.map((id) => {
    const client = clientById.get(id);
    const primary = primaryByClient.get(id) ?? 0;
    const secondary = secondaryByClient.get(id) ?? 0;
    const variance = primary - secondary;
    totalPrimary += primary;
    totalSecondary += secondary;

    return {
      clientId: id,
      name: client?.CL_Name ?? id,
      businessLead: client?.CL_Business_Lead ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead : "",
      feeStructure: client?.Client_Fee_Structure ?? "",
      status: client?.Client_Status_By_Year?.[year] ?? client?.Client_Status_2026 ?? "",
      notes: client?.Client_Notes ?? "",
      primary,
      secondary,
      variance,
      relative: secondary > 0 ? (variance / secondary) * 100 : null,
    };
  });

  // Sort by Variance $ descending (matches Looker's default).
  rows.sort((a, b) => b.variance - a.variance);

  return { rows, totalPrimary, totalSecondary };
}