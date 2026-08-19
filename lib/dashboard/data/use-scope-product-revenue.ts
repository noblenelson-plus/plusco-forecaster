// lib/dashboard/data/use-scope-product-revenue.ts
"use client";

/**
 * Per-product revenue for the whole dashboard scope, read directly (one pass
 * per in-scope client) rather than through the shared scope hook — the flatten
 * step there sums all Product Fees per client, losing the product split.
 *
 * For each client it fetches the primary and comparison revenue submissions and
 * extracts Product Fees totals per productId. The product split lives in two
 * different places depending on the side (see the Forecast grid):
 *   - BL_INPUT (blSubmission): individual bucket rows carrying a `productId`.
 *   - ADMIN_INPUT/GAIA (official): the `details[]` breakdown lines (each with a
 *     `productId`) under the Product Fees actuals row.
 *
 * Currency + month handling mirrors the scope hook so the figures match the
 * rest of the Revenue page: native per-client values are converted with the
 * caller's USD→CAD rate (USD clients only), and only the selected months are
 * summed (all months when the filter is empty).
 *
 * Cost note: this re-reads each in-scope client's doc (primary + comparison),
 * so it is heaviest unfiltered. In the GM-review workflow the scope is filtered,
 * which keeps it light.
 */

import { useEffect, useState } from "react";
import { fetchAxisData } from "../../services/data-entry-service";
import type { AxisData } from "../../types/forecaster.types";
import type { RFQType } from "../../types/rfq.types";
import type { MonthlyMap } from "../../types/common.types";
import type { Currency } from "../../types/client.types";
import type { RevenueMode } from "./use-scope-forecast-data";

/** One client × product revenue pairing (already currency-converted). */
export interface ProductRevenueEntry {
  clientId: string;
  productId: string;
  primary: number;
  comparison: number;
}

export interface Submission {
  year: number | null;
  rfq: RFQType | null;
}

export interface UseScopeProductRevenueParams {
  scopedClientIds: string[];
  primary: Submission;
  primaryMode: RevenueMode;
  comparison: Submission;
  secondaryMode: RevenueMode;
  /** clientId → currency, to know which clients to convert. */
  currencyByClient: Record<string, Currency>;
  /** USD→CAD rate for the primary year (undefined/1 in USD view). */
  usdToCad?: number;
  /** USD→CAD rate for the comparison year. */
  comparisonUsdToCad?: number;
  /** Selected months (1–12); empty = whole year. */
  selMonths: number[];
}

/** Sum a monthly map over the selected months (all months when none selected). */
function sumMonths(months: MonthlyMap, selMonths: number[]): number {
  if (!selMonths || selMonths.length === 0) {
    let total = 0;
    for (const v of Object.values(months)) total += Number(v) || 0;
    return total;
  }
  let total = 0;
  for (const m of selMonths) total += Number(months[m]) || 0;
  return total;
}

/** Native per-product totals for one submission side. */
function perProductTotals(
  axis: AxisData,
  mode: RevenueMode,
  selMonths: number[]
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (productId: string | undefined, months: MonthlyMap) => {
    if (!productId) return;
    out.set(productId, (out.get(productId) ?? 0) + sumMonths(months, selMonths));
  };

  if (mode === "official") {
    // OF: per-product lives in the actuals rows' detail lines.
    for (const row of axis.actuals) {
      for (const detail of row.details ?? []) add(detail.productId, detail.months);
    }
  } else {
    // BL: per-product lives directly on the BL bucket rows.
    for (const bucket of axis.buckets) {
      for (const row of bucket.rows) add(row.productId, row.months);
    }
  }
  return out;
}

export function useScopeProductRevenue({
  scopedClientIds,
  primary,
  primaryMode,
  comparison,
  secondaryMode,
  currencyByClient,
  usdToCad,
  comparisonUsdToCad,
  selMonths,
}: UseScopeProductRevenueParams): {
  entries: ProductRevenueEntry[];
  loading: boolean;
} {
  const [entries, setEntries] = useState<ProductRevenueEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable primitive keys so array identity churn doesn't re-trigger fetches.
const idsKey = (scopedClientIds ?? []).join(",");
  const monthsKey = (selMonths ?? []).join(",");
  const ready = primary.year !== null && primary.rfq !== null && idsKey !== "";

  useEffect(() => {
    if (!ready) return;

    const ids = idsKey.split(",");
    const months = monthsKey ? monthsKey.split(",").map(Number) : [];

    let cancelled = false;

    const rateFor = (clientId: string, rate?: number) =>
      currencyByClient[clientId] === "USD" ? rate ?? 1 : 1;

    void (async () => {
      setLoading(true);
      const acc: ProductRevenueEntry[] = [];

      await Promise.all(
        ids.map(async (clientId) => {
          const primaryAxis = await fetchAxisData(
            clientId,
            primary.year!,
            primary.rfq!,
            "revenue"
          );
          const primaryTotals = perProductTotals(primaryAxis, primaryMode, months);

          let comparisonTotals = new Map<string, number>();
          if (comparison.year !== null && comparison.rfq !== null) {
            const comparisonAxis = await fetchAxisData(
              clientId,
              comparison.year,
              comparison.rfq,
              "revenue"
            );
            comparisonTotals = perProductTotals(comparisonAxis, secondaryMode, months);
          }

          const productIds = new Set([
            ...primaryTotals.keys(),
            ...comparisonTotals.keys(),
          ]);
          for (const productId of productIds) {
            const p =
              (primaryTotals.get(productId) ?? 0) * rateFor(clientId, usdToCad);
            const c =
              (comparisonTotals.get(productId) ?? 0) *
              rateFor(clientId, comparisonUsdToCad);
            if (p === 0 && c === 0) continue;
            acc.push({ clientId, productId, primary: p, comparison: c });
          }
        })
      );

      if (!cancelled) {
        setEntries(acc);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    idsKey,
    monthsKey,
    primary.year,
    primary.rfq,
    primaryMode,
    comparison.year,
    comparison.rfq,
    secondaryMode,
    usdToCad,
    comparisonUsdToCad,
    currencyByClient,
  ]);

  // Derived so the not-ready case needs no synchronous state reset in the effect.
  return { entries: ready ? entries : [], loading: ready && loading };
}