// components/forecaster/sections/product-adoption-section.tsx
"use client";

/**
 * Product Adoption — APPROVED products only. KPI strip + detail table + pie +
 * stacked bars by Agency (vertical) and top-15 Clients (horizontal), using the
 * Forecaster StackedBarChart. Current snapshot.
 *
 * The detail table is the shared sortable/exportable TextTable.
 */

import { useMemo } from "react";
import { Table, PieChart, Building2, Users, CheckCircle2, Trophy } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import StatCard from "../../dashboard/charts/stat-card";
import ForecasterPieChart from "../charts/pie-chart";
import StackedBarChart from "../charts/stacked-bar-chart";
import TextTable, { type TextColumnSpec } from "../table/text-table";
import { computeProductAdoption, PRODUCT_PALETTE } from "./product-adoption-data";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition } from "../../../lib/types/product.types";

interface AdoptionDetailRow {
  key: string;
  businessLead: string;
  clientName: string;
  productName: string;
}

export default function ProductAdoptionSection({
  productData,
  products,
  scopedClientIds,
}: {
  productData: ScopeProductData;
  products: ProductDefinition[];
  scopedClientIds: string[];
}) {
  const { clients } = useAccessibleClients();
  const usersMap = useUsersMap();

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
  const cut = result.adoption;

  const colorByProduct = useMemo(() => {
    const m = new Map<string, string>();
    cut.byProduct.forEach((p, i) => m.set(p.label, PRODUCT_PALETTE[i % PRODUCT_PALETTE.length]));
    return m;
  }, [cut.byProduct]);
  const colorFor = (label: string) => colorByProduct.get(label) ?? "#94a3b8";

  const nameById = useMemo(() => new Map(products.map((p) => [p.productId, p.name])), [products]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const detailRows = useMemo<AdoptionDetailRow[]>(
    () =>
      entries
        .filter((e) => e.status === "APPROVED")
        .map((e) => {
          const client = clientById.get(e.clientId);
          return {
            key: `${e.clientId}:${e.productId}`,
            businessLead: client?.CL_Business_Lead ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead : "",
            clientName: client?.CL_Name ?? e.clientId,
            productName: nameById.get(e.productId) ?? e.productId,
          };
        })
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [entries, clientById, nameById, usersMap]
  );

  const detailColumns = useMemo<TextColumnSpec<AdoptionDetailRow>[]>(
    () => [
      { id: "business-lead", label: "Business Lead", get: (r) => r.businessLead, muted: true, maxWidth: 180 },
      { id: "client", label: "Client", get: (r) => r.clientName, maxWidth: 160 },
      { id: "product", label: "Product", get: (r) => r.productName },
    ],
    []
  );

  const topClients = useMemo(() => cut.byClient.slice(0, 10), [cut.byClient]);

  if (cut.byProduct.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Product Adoption</h2>
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No approved products for this selection.
        </div>
      </section>
    );
  }

  const pieSegments = cut.byProduct.map((p) => ({ label: p.label, value: p.entries, color: colorFor(p.label) }));
  const top = cut.byProduct[0];

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Product Adoption</h2>
      <p className="-mt-2 text-xs text-muted-foreground">Approved products only.</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Adopted products" value={String(cut.totalEntries)} accent="text-green-600" />
        <StatCard icon={Users} label="Clients adopting" value={String(cut.totalClients)} />
        <StatCard icon={Trophy} label="Most adopted" value={top?.label ?? "—"} sub={top ? `${top.clients} clients` : undefined} />
        <StatCard icon={PieChart} label="Distinct products" value={String(cut.byProduct.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TextTable
          title="Adopted Products"
          icon={Table}
          rows={detailRows}
          columns={detailColumns}
          exportTitle="Product Adoption — Adopted Products"
        />

        <ChartCard title="PlusCo Product Adoption" icon={PieChart} subtitle={`${cut.totalEntries} adopted · ${cut.totalClients} clients`}>
          <ForecasterPieChart segments={pieSegments} valueFormat={(v) => String(Math.round(v))} />
        </ChartCard>

        <ChartCard title="Product Adoption by Agency" icon={Building2}>
          <div className="h-[360px]">
            <StackedBarChart rows={cut.byAgency} colorFor={colorFor} layout="vertical" />
          </div>
        </ChartCard>

        <ChartCard title="Top 10 Clients by Adoption" icon={Users}>
          <StackedBarChart rows={topClients} colorFor={colorFor} layout="horizontal" />
        </ChartCard>
      </div>
    </section>
  );
}