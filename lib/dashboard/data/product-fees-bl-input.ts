// lib/dashboard/data/product-fees-bl-input.ts

/**
 * Revenues page: Product Fees read the BL INPUT (Noble, 2026-10-22).
 *
 * The BL Submission view resolves each client × month to the GAIA detail lines
 * when any is entered, else the BL input (revenue-commission.ts). For Product
 * Fees the Revenues page instead reads the BL input rows, like the Product
 * Revenue section (BL rows carrying a product) — so Client Revenue, Revenue
 * Types and Product Revenue show the same Product Fees total. Every other
 * stream keeps the BL Submission rule, and nothing else in the app changes
 * (forecast grid, Forecast Summary).
 *
 * Pure: takes a ScopeForecastData, returns one whose `revenueByMode.blSubmission`
 * has each client's Product Fees replaced by its BL input Product Fees (already
 * currency-converted and month-filtered upstream, like every other figure).
 */

import { emptyMonthly, REVENUE_PRODUCT_FEES_TYPE } from "../../types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../types/common.types";
import { revenueBreakdownFromStreams, type ClientRevenueBreakdown } from "./aggregate";
import type { ScopeForecastData } from "./use-scope-forecast-data";

export function withBlInputProductFees(data: ScopeForecastData): ScopeForecastData {
  const blInput = new Map(data.revenueByClient.map((c) => [c.clientId, c.byStream]));
  const view = data.revenueByMode.blSubmission;

  const byClient: ClientRevenueBreakdown[] = view.byClient.map((c) => {
    const { [REVENUE_PRODUCT_FEES_TYPE]: _submitted, ...rest } = c.byStream;
    void _submitted;
    const input = blInput.get(c.clientId)?.[REVENUE_PRODUCT_FEES_TYPE];
    return { ...c, byStream: input ? { ...rest, [REVENUE_PRODUCT_FEES_TYPE]: input } : rest };
  });

  // Re-sum the scope from the per-client streams.
  const scope: Record<string, MonthlyMap> = {};
  for (const c of byClient) {
    for (const [stream, months] of Object.entries(c.byStream)) {
      const target = (scope[stream] ??= emptyMonthly());
      for (const m of MONTHS) target[m] += months[m] ?? 0;
    }
  }

  return {
    ...data,
    revenueByMode: {
      ...data.revenueByMode,
      blSubmission: { breakdown: revenueBreakdownFromStreams(scope), byClient },
    },
  };
}
