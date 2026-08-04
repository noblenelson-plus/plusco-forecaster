// components/forecaster/tabs/product-tab.tsx
"use client";

/**
 * Product tab for the Forecaster dashboard. Stacks the three product sections:
 * Overview (all statuses), Adoption (approved only), and Opportunity (pipeline).
 * All are counts from the current product-tracking snapshot — no Year/RFQ or
 * currency dimension — but they respect the in-scope client set (filters + USD).
 * Product Revenue ($) is intentionally deferred (needs a product-forecast source).
 *
 * The "Expected revenue timings" list (imported from the former standalone
 * Dashboard) surfaces every tracked entry that carries a revenue-start month.
 */

import { useMemo } from "react";
import { Loader2, CalendarClock } from "lucide-react";
import ProductOverviewSection from "../sections/product-overview-section";
import ProductAdoptionSection from "../sections/product-adoption-section";
import ProductOpportunitySection from "../sections/product-opportunity-section";
import ChartCard from "../../dashboard/charts/chart-card";
import { formatTiming } from "../../dashboard/product-data-table";
import {
  PRODUCT_STATUS_LABELS,
  statusAllowsTiming,
  type ProductStatus,
} from "../../../lib/types/product.types";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition } from "../../../lib/types/product.types";

/** Flat chips for the timing list — same palette as the detail table. */
const STATUS_CHIP: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "bg-blue-200 text-gray-900",
  PITCHED_TO_CLIENT: "bg-yellow-400 text-gray-900",
  APPROVED: "bg-green-500 text-white",
  REJECTED: "bg-red-500 text-white",
};

const TIMING_LIST_LIMIT = 20;

export default function ProductTab({
  productData,
  products,
  productsLoading,
  scopedClientIds,
  clientNameById,
}: {
  productData: ScopeProductData;
  products: ProductDefinition[];
  productsLoading: boolean;
  scopedClientIds: string[];
  clientNameById: Record<string, string>;
}) {
  const productNameById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.productId, p.name])),
    [products]
  );

  // Entries expecting revenue: a timing on a revenue-path status, soonest first.
  const timed = useMemo(
    () =>
      productData.entries
        .filter((e) => e.timing && statusAllowsTiming(e.status ?? null))
        .sort((a, b) => (a.timing! < b.timing! ? -1 : 1)),
    [productData.entries]
  );

  if (productData.loading || productsLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (productData.error) {
    return (
      <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        {productData.error}
      </div>
    );
  }

  if (productData.entries.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No product tracking for the clients in scope.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div data-scroll-section data-scroll-label="Overview">
        <ProductOverviewSection productData={productData} products={products} scopedClientIds={scopedClientIds} />
      </div>
      <div data-scroll-section data-scroll-label="Adoption">
        <ProductAdoptionSection productData={productData} products={products} scopedClientIds={scopedClientIds} />
      </div>
      <div data-scroll-section data-scroll-label="Opportunity">
        <ProductOpportunitySection productData={productData} products={products} scopedClientIds={scopedClientIds} />
      </div>

      <div data-scroll-section data-scroll-label="Timings">
        <ChartCard
          title="Expected revenue timings"
          subtitle="Products with an expected revenue-start month, soonest first"
          icon={CalendarClock}
        >
        {timed.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No expected timing has been entered in this scope.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {timed.slice(0, TIMING_LIST_LIMIT).map((e) => (
              <li
                key={`${e.clientId}::${e.productId}`}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="w-20 flex-shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {formatTiming(e.timing)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">
                    {clientNameById[e.clientId] ?? e.clientId}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {productNameById[e.productId] ?? e.productId}
                  </span>
                </span>
                {e.status && (
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CHIP[e.status]}`}
                  >
                    {PRODUCT_STATUS_LABELS[e.status]}
                  </span>
                )}
              </li>
            ))}
            {timed.length > TIMING_LIST_LIMIT && (
              <li className="py-2 text-center text-xs text-muted-foreground">
                +{timed.length - TIMING_LIST_LIMIT} more — see the tables above.
              </li>
            )}
          </ul>
        )}
        </ChartCard>
      </div>
    </div>
  );
}
