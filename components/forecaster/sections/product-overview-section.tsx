// components/forecaster/sections/product-overview-section.tsx
"use client";

/**
 * Product Overview — KPI headline strip, detail table, Product Mix pie, and
 * stacked bars by Agency (vertical) and top-15 Clients (horizontal), both using
 * the Forecaster StackedBarChart (filled height, data labels, zero-free
 * tooltips). Every tracked product (any status). Current snapshot.
 *
 * The detail table is the shared sortable/exportable TextTable.
 */

import { useMemo } from "react";
import { Table, PieChart, Building2, Users, Package, CheckCircle2, Percent, Trophy } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import StatCard from "../../dashboard/charts/stat-card";
import ForecasterPieChart from "../charts/pie-chart";
import StackedBarChart from "../charts/stacked-bar-chart";
import TextTable, { type TextColumnSpec } from "../table/text-table";
import { computeProductAdoption, PRODUCT_PALETTE } from "./product-adoption-data";
import { PRODUCT_STATUS_LABELS } from "../../../lib/types/product.types";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition } from "../../../lib/types/product.types";

interface ProductDetailRow {
  key: string;
  businessLead: string;
  clientName: string;
  productName: string;
  status: string;
}

export default function ProductOverviewSection({
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
  const cut = result.overview;
  const k = result.kpis;

  const colorByProduct = useMemo(() => {
    const m = new Map<string, string>();
    cut.byProduct.forEach((p, i) => m.set(p.label, PRODUCT_PALETTE[i % PRODUCT_PALETTE.length]));
    return m;
  }, [cut.byProduct]);
  const colorFor = (label: string) => colorByProduct.get(label) ?? "#94a3b8";

  const nameById = useMemo(() => new Map(products.map((p) => [p.productId, p.name])), [products]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const detailRows = useMemo<ProductDetailRow[]>(
    () =>
      entries
        .filter((e) => e.status)
        .map((e) => {
          const client = clientById.get(e.clientId);
          return {
            key: `${e.clientId}:${e.productId}`,
            businessLead: client?.CL_Business_Lead ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead : "",
            clientName: client?.CL_Name ?? e.clientId,
            productName: nameById.get(e.productId) ?? e.productId,
            status: e.status ? PRODUCT_STATUS_LABELS[e.status] : "—",
          };
        })
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [entries, clientById, nameById, usersMap]
  );

  const detailColumns = useMemo<TextColumnSpec<ProductDetailRow>[]>(
    () => [
      { id: "business-lead", label: "Business Lead", get: (r) => r.businessLead, muted: true, maxWidth: 180 },
      { id: "client", label: "Client", get: (r) => r.clientName, maxWidth: 160 },
      { id: "product", label: "Product", get: (r) => r.productName },
      { id: "status", label: "Status", get: (r) => r.status, muted: true },
    ],
    []
  );

  const topClients = useMemo(() => cut.byClient.slice(0, 10), [cut.byClient]);

  if (cut.byProduct.length === 0) return null;

  const pieSegments = cut.byProduct.map((p) => ({ label: p.label, value: p.entries, color: colorFor(p.label) }));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Product Overview</h2>
      <p className="-mt-2 text-xs text-muted-foreground">
        Current product status per client — not submission-specific.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Package} label="Products tracked" value={String(k.totalTracked)} />
        <StatCard icon={Users} label="Clients with products" value={String(k.clientsTracking)} />
        <StatCard icon={CheckCircle2} label="Approved (adopted)" value={String(k.approved)} accent="text-green-600" />
        <StatCard icon={Percent} label="Approval rate" value={k.approvalRate === null ? "—" : `${(k.approvalRate * 100).toFixed(0)}%`} />
        <StatCard icon={Trophy} label="Most adopted" value={k.topProduct ?? "—"} sub={k.topProduct ? `${k.topProductCount} clients` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TextTable
          title="Products"
          icon={Table}
          rows={detailRows}
          columns={detailColumns}
          exportTitle="Product Overview — Products"
        />

        <ChartCard title="Product Mix" icon={PieChart} subtitle={`${cut.totalEntries} product entries · ${cut.totalClients} clients`}>
          <ForecasterPieChart segments={pieSegments} valueFormat={(v) => String(Math.round(v))} />
        </ChartCard>

        <ChartCard title="Products by Agency" icon={Building2}>
          <div className="h-[360px]">
            <StackedBarChart rows={cut.byAgency} colorFor={colorFor} layout="vertical" />
          </div>
        </ChartCard>

        <ChartCard title="Top 10 Clients by Products" icon={Users}>
          <StackedBarChart rows={topClients} colorFor={colorFor} layout="horizontal" />
        </ChartCard>
      </div>
    </section>
  );
}