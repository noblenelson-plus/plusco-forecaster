// components/forecaster/tabs/product-tab.tsx
"use client";

/**
 * Product tab for the Forecaster dashboard. Stacks the three product sections:
 * Overview (all statuses), Adoption (approved only), and Opportunity (pipeline).
 * All are counts from the current product-tracking snapshot — no Year/RFQ or
 * currency dimension — but they respect the in-scope client set (filters + USD).
 * Product Revenue ($) is intentionally deferred (needs a product-forecast source).
 */

import ProductOverviewSection from "../sections/product-overview-section";
import ProductAdoptionSection from "../sections/product-adoption-section";
import ProductOpportunitySection from "../sections/product-opportunity-section";
import { Loader2 } from "lucide-react";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition } from "../../../lib/types/product.types";

export default function ProductTab({
  productData,
  products,
  productsLoading,
  scopedClientIds,
}: {
  productData: ScopeProductData;
  products: ProductDefinition[];
  productsLoading: boolean;
  scopedClientIds: string[];
}) {
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
      <ProductOverviewSection productData={productData} products={products} scopedClientIds={scopedClientIds} />
      <ProductAdoptionSection productData={productData} products={products} scopedClientIds={scopedClientIds} />
      <ProductOpportunitySection productData={productData} products={products} scopedClientIds={scopedClientIds} />
    </div>
  );
}