// components/forecaster/sections/product-revenue-data.ts

/**
 * Builds one row per client for the Product Revenue table — the Product Fees
 * stream only, pulled out of the same per-client revenue breakdown the Client
 * Revenue table uses. Primary reads the primary submission's mode (BL/OF),
 * Secondary the comparison submission's mode.
 *
 * This is client-grain: every Product Fees line for a client is already summed
 * into one figure upstream, so there is no per-product (Product Name) split
 * here. That split needs the individual rows exposed on ScopeForecastData
 * (a `revenueDetail` mirroring `labsDetail`), which is a change to the scope
 * hook — see the handoff note for Tristan.
 *
 * The revenue-types filter gates this whole section: Product Revenue is the
 * Product Fees stream, so when Product Fees is deselected there is nothing to
 * show and the section reports empty.
 */

import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Client } from "../../../lib/types/client.types";
import type { MonthlyMap } from "../../../lib/types/common.types";

/** Product Fees stream — enum key first, display label as fallback. */
const PRODUCT_FEE_KEYS = ["productFees", "Product Fees"];

const sumM = (m?: MonthlyMap) =>
  Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

/** Product Fees total for one client, tolerant of which key the stream map uses. */
function sumProductFees(byStream: Record<string, MonthlyMap> | undefined): number {
  if (!byStream) return 0;
  for (const key of PRODUCT_FEE_KEYS) {
    if (key in byStream) return sumM(byStream[key]);
  }
  return 0;
}

export interface ProductRevenueRow {
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

export interface ProductRevenueResult {
  rows: ProductRevenueRow[];
  totalPrimary: number;
  totalSecondary: number;
}

export function computeProductRevenue(
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
): ProductRevenueResult {
  // This section is the Product Fees stream; if it is filtered out, show nothing.
  const productFeesOn = selectedStreams === null || selectedStreams.has("productFees");
  if (!productFeesOn) {
    return { rows: [], totalPrimary: 0, totalSecondary: 0 };
  }

  const clientById = new Map(clients.map((c) => [c.cl_id, c]));

  const primaryByClient = new Map(
    data.revenueByMode[primaryMode].byClient.map((r) => [r.clientId, sumProductFees(r.byStream)])
  );
  const secondaryByClient = new Map(
    hasComparison
      ? comparisonData.revenueByMode[secondaryMode].byClient.map((r) => [
          r.clientId,
          sumProductFees(r.byStream),
        ])
      : []
  );

  let totalPrimary = 0;
  let totalSecondary = 0;

  const rows: ProductRevenueRow[] = scopedClientIds
    .map((id) => {
      const client = clientById.get(id);
      const primary = primaryByClient.get(id) ?? 0;
      const secondary = secondaryByClient.get(id) ?? 0;
      const variance = primary - secondary;
      totalPrimary += primary;
      totalSecondary += secondary;

      return {
        clientId: id,
        name: client?.CL_Name ?? id,
        businessLead: client?.CL_Business_Lead
          ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead
          : "",
        feeStructure: client?.Client_Fee_Structure ?? "",
        status: client?.Client_Status_By_Year?.[year] ?? client?.Client_Status_2026 ?? "",
        notes: client?.Client_Notes ?? "",
        primary,
        secondary,
        variance,
        relative: secondary > 0 ? (variance / secondary) * 100 : null,
      };
    })
    .filter((row) => row.primary !== 0 || row.secondary !== 0);

  rows.sort((a, b) => b.variance - a.variance);

  return { rows, totalPrimary, totalSecondary };
}