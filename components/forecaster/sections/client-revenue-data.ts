// components/forecaster/sections/client-revenue-data.ts

/**
 * Builds one row per client for the Client Revenue table. Primary reads the
 * primary submission's chosen mode (BL/OF); Secondary reads the comparison
 * submission's chosen mode — reproducing "RFQ2-BL vs RFQ1-OF". Currency
 * (CAD-normalized vs native USD) is already handled upstream by the hook.
 *
 * The revenue-types filter narrows which streams count toward each client's
 * total: deselecting a type lowers every client's figure (and the grand total)
 * by that type's amount. Commission and Commission Overwrite are summed as one
 * "Commission" via sumSelectedStreams. A null selection means all streams.
 *
 * Official (OF) revenue is a single reported figure with no per-stream breakdown
 * (its only key is the synthetic "official"), so the BL revenue-type filter must
 * NOT apply to a side showing OF — otherwise every selection zeroes it out. Both
 * sides therefore bypass the filter (pass null) when their mode is "official".
 */

import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Client } from "../../../lib/types/client.types";
import { resolveClientStatus } from "../../../lib/format/client";
import { sumSelectedStreams } from "./revenue-types-data";

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
  hasComparison: boolean,
  selectedStreams: ReadonlySet<string> | null
): ClientRevenueResult {
  const clientById = new Map(clients.map((c) => [c.cl_id, c]));

  // clientId → revenue summed over the selected streams, per side. A side in
  // Official mode ignores the BL revenue-type filter (see file header): its
  // single "official" key is never in that set, so filtering would zero it.
  const primaryByClient = new Map(
    data.revenueByMode[primaryMode].byClient.map((r) => [
      r.clientId,
      primaryMode === "official"
        ? sumSelectedStreams(r.byStream, null)
        : sumSelectedStreams(r.byStream, selectedStreams),
    ])
  );
  const secondaryByClient = new Map(
    hasComparison
      ? comparisonData.revenueByMode[secondaryMode].byClient.map((r) => [
          r.clientId,
          secondaryMode === "official"
            ? sumSelectedStreams(r.byStream, null)
            : sumSelectedStreams(r.byStream, selectedStreams),
        ])
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
      status: client ? resolveClientStatus(client, year) : "",
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