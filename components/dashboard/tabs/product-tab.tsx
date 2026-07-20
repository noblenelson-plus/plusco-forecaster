// components/dashboard/tabs/product-tab.tsx
"use client";

/**
 * Product tab — the always-on product pipeline across the filtered clients:
 * • KPI strip (count per pipeline status + clients tracking)
 * • Pipeline by product (stacked bars: one bar per catalog product)
 * • Expected timings (entries with a revenue-start month, soonest first)
 * • Detail table (client × product × status/timing/note, CSV export)
 *
 * Product tracking has no Year/RFQ/month dimension, so this tab ignores the
 * global submission context and the month filter — only the client scope
 * (filter bar) applies.
 */

import { useMemo } from "react";
import {
  CheckCircle2,
  Presentation,
  Lightbulb,
  XCircle,
  Package,
  CalendarClock,
  Users,
} from "lucide-react";
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_ORDER,
  statusAllowsTiming,
  type ProductStatus,
} from "../../../lib/types/product.types";
import { useProducts } from "../../../lib/hooks/use-products";
import { pipelineProducts } from "../../../lib/services/product-service";
import type { ScopeProductData } from "../../../lib/dashboard/data/use-scope-product-tracking";
import { PRODUCT_STATUS_COLORS } from "../charts/colors";
import StatCard from "../charts/stat-card";
import ChartCard from "../charts/chart-card";
import HorizontalStackedBar, {
  type StackRow,
  type StackSeries,
} from "../charts/horizontal-stacked-bar";
import ProductDataTable, { formatTiming } from "../product-data-table";
import { LoadingTab, EmptyDataNotice } from "./tab-states";

const STATUS_ICONS: Record<ProductStatus, typeof CheckCircle2> = {
  IDENTIFIED_PROSPECT: Lightbulb,
  PITCHED_TO_CLIENT: Presentation,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
};

const STATUS_ACCENTS: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "text-blue-500",
  PITCHED_TO_CLIENT: "text-yellow-500",
  APPROVED: "text-green-500",
  REJECTED: "text-red-500",
};

/** Flat chips for the timing list — same palette as the detail table. */
const STATUS_CHIP: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "bg-blue-200 text-gray-900",
  PITCHED_TO_CLIENT: "bg-yellow-400 text-gray-900",
  APPROVED: "bg-green-500 text-white",
  REJECTED: "bg-red-500 text-white",
};

const TIMING_LIST_LIMIT = 20;

export default function ProductTab({
  data,
  clientNameById,
}: {
  data: ScopeProductData;
  clientNameById: Record<string, string>;
}) {
  const { entries } = data;

  // Product catalog (admin-managed). Names resolve across all products (so a
  // revenue-only product referenced by an entry still shows), while the pipeline
  // chart is driven by the Pipeline-flagged products.
  const { products, loading: productsLoading } = useProducts();
  const pipeline = useMemo(() => pipelineProducts(products), [products]);
  const productNameById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.productId, p.name])),
    [products]
  );

  // One bar per Pipeline product, plus any tracked product no longer in the
  // pipeline catalog (kept so its saved data still appears — an empty/labelled
  // bar is itself information).
  const chartProducts = useMemo(() => {
    const ids = new Set(pipeline.map((p) => p.productId));
    const extras = [...new Set(entries.map((e) => e.productId))]
      .filter((id) => !ids.has(id))
      .map((id) => ({ productId: id, name: productNameById[id] ?? id }));
    return [
      ...pipeline.map((p) => ({ productId: p.productId, name: p.name })),
      ...extras,
    ];
  }, [pipeline, entries, productNameById]);

  // Count per status, plus the distinct clients carrying each status.
  const byStatus = useMemo(() => {
    const counts = {} as Record<ProductStatus, number>;
    const clients = {} as Record<ProductStatus, Set<string>>;
    for (const s of PRODUCT_STATUS_ORDER) {
      counts[s] = 0;
      clients[s] = new Set();
    }
    for (const e of entries) {
      if (!e.status) continue;
      counts[e.status] += 1;
      clients[e.status].add(e.clientId);
    }
    return { counts, clients };
  }, [entries]);

  // One stacked bar per catalog product (catalog order), statuses as segments.
  // Products nobody tracks yet are kept — an empty bar is itself information.
  const pipelineRows = useMemo<StackRow[]>(
    () =>
      chartProducts.map((p) => {
        const values: Record<string, number> = {};
        for (const e of entries) {
          if (e.productId !== p.productId || !e.status) continue;
          values[e.status] = (values[e.status] ?? 0) + 1;
        }
        return { label: p.name, values };
      }),
    [entries, chartProducts]
  );

  const pipelineSeries = useMemo<StackSeries[]>(
    () =>
      PRODUCT_STATUS_ORDER.map((s) => ({
        key: s,
        label: PRODUCT_STATUS_LABELS[s],
        color: PRODUCT_STATUS_COLORS[s],
      })),
    []
  );

  // Entries expecting revenue: a timing on a revenue-path status, soonest first.
  const timed = useMemo(
    () =>
      entries
        .filter((e) => e.timing && statusAllowsTiming(e.status ?? null))
        .sort((a, b) => (a.timing! < b.timing! ? -1 : 1)),
    [entries]
  );

  if (data.loading || productsLoading) return <LoadingTab />;
  if (data.error) {
    return (
      <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        {data.error}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyDataNotice message="No product tracking has been entered for the selected clients yet." />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {PRODUCT_STATUS_ORDER.map((s) => (
          <StatCard
            key={s}
            icon={STATUS_ICONS[s]}
            label={PRODUCT_STATUS_LABELS[s]}
            value={String(byStatus.counts[s])}
            sub={`${byStatus.clients[s].size} client${
              byStatus.clients[s].size === 1 ? "" : "s"
            }`}
            accent={STATUS_ACCENTS[s]}
          />
        ))}
        <StatCard
          icon={Users}
          label="Clients tracking"
          value={String(data.clientsTracking)}
          sub={`of ${data.clientCount} in scope`}
        />
      </div>

      <ChartCard
        title="Pipeline by product"
        subtitle="Clients per pipeline status, for each catalog product"
        icon={Package}
      >
        <HorizontalStackedBar
          series={pipelineSeries}
          rows={pipelineRows}
          valueFormat={(v) => String(Math.round(v))}
        />
      </ChartCard>

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
                +{timed.length - TIMING_LIST_LIMIT} more — see the detail table
                below.
              </li>
            )}
          </ul>
        )}
      </ChartCard>

      <ProductDataTable
        entries={entries}
        productNameById={productNameById}
        clientNameById={clientNameById}
      />
    </div>
  );
}
