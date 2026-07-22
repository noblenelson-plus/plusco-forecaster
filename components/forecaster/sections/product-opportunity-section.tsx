// components/forecaster/sections/product-opportunity-section.tsx
"use client";

/**
 * Product Opportunity — the pipeline, redesigned as a compact funnel strip
 * (Identified → Pitched → Approved, with Rejected shown apart) plus a stacked
 * bar of products at each stage. Reads the `pipeline` cut. Current snapshot,
 * not submission-specific.
 */

import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import StackedBarChart from "../charts/stacked-bar-chart";
import { computeProductAdoption, PRODUCT_PALETTE } from "./product-adoption-data";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_ORDER } from "../../../lib/types/product.types";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition, ProductStatus } from "../../../lib/types/product.types";

// Funnel stages (revenue path) vs Rejected, shown separately.
const FUNNEL: ProductStatus[] = ["IDENTIFIED_PROSPECT", "PITCHED_TO_CLIENT", "APPROVED"];
const STAGE_COLOR: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "#94a3b8",
  PITCHED_TO_CLIENT: "#5C6BC0",
  APPROVED: "#22c55e",
  REJECTED: "#ef4444",
};

export default function ProductOpportunitySection({
  productData,
  products,
  scopedClientIds,
}: {
  productData: ScopeProductData;
  products: ProductDefinition[];
  scopedClientIds: string[];
}) {
  const { clients } = useAccessibleClients();

  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const scopedClients = useMemo(() => clients.filter((c) => scopeSet.has(c.cl_id)), [clients, scopeSet]);
  const entries = useMemo(
    () => productData.entries.filter((e) => scopeSet.has(e.clientId)),
    [productData.entries, scopeSet]
  );

  const result = useMemo(
    () => computeProductAdoption(entries, products, scopedClients),
    [entries, products, scopedClients]
  );
  const countByStatus = useMemo(
    () => Object.fromEntries(result.pipeline.map((p) => [p.status, p])) as Record<ProductStatus, (typeof result.pipeline)[number]>,
    [result.pipeline]
  );

  // Products at each stage → stacked bar (one bar per stage, products as segments).
  const nameById = useMemo(() => new Map(products.map((p) => [p.productId, p.name])), [products]);
  const colorByProduct = useMemo(() => {
    const names = [...new Set(entries.filter((e) => e.status).map((e) => nameById.get(e.productId) ?? e.productId))];
    const m = new Map<string, string>();
    names.forEach((n, i) => m.set(n, PRODUCT_PALETTE[i % PRODUCT_PALETTE.length]));
    return m;
  }, [entries, nameById]);
  const colorFor = (label: string) => colorByProduct.get(label) ?? "#94a3b8";

  const byStage = useMemo(
    () =>
      PRODUCT_STATUS_ORDER.map((status) => {
        const rows = entries.filter((e) => e.status === status);
        const products = new Map<string, number>();
        for (const e of rows) {
          const label = nameById.get(e.productId) ?? e.productId;
          products.set(label, (products.get(label) ?? 0) + 1);
        }
        const segments = [...products.entries()].map(([label, value]) => ({ label, value }));
        return { name: PRODUCT_STATUS_LABELS[status], segments, total: rows.length };
      }).filter((r) => r.total > 0),
    [entries, nameById]
  );

  const totalStatus = entries.filter((e) => e.status).length;
  if (totalStatus === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Product Opportunity</h2>
      <p className="-mt-2 text-xs text-muted-foreground">Current pipeline status per client — not submission-specific.</p>

      {/* Funnel strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FUNNEL.map((status, i) => {
          const c = countByStatus[status];
          return (
            <div key={status} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLOR[status] }} />
                <span className="text-xs font-medium text-muted-foreground">
                  {i + 1}. {c.label}
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{c.entries}</p>
              <p className="text-xs text-muted-foreground">{c.clients} client{c.clients === 1 ? "" : "s"}</p>
            </div>
          );
        })}
        {/* Rejected — shown apart from the funnel */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLOR.REJECTED }} />
            <span className="text-xs font-medium text-muted-foreground">{PRODUCT_STATUS_LABELS.REJECTED}</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{countByStatus.REJECTED.entries}</p>
          <p className="text-xs text-muted-foreground">{countByStatus.REJECTED.clients} client{countByStatus.REJECTED.clients === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* Products at each stage */}
      <ChartCard title="Products by Stage" icon={GitBranch}>
        <div className="h-[360px]">
          <StackedBarChart rows={byStage} colorFor={colorFor} layout="vertical" />
        </div>
      </ChartCard>
    </section>
  );
}