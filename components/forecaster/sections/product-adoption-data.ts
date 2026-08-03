// components/forecaster/sections/product-adoption-data.ts

/**
 * Turns raw product-tracking entries + the catalog into the counts the Product
 * tab renders. Product tracking is a CURRENT snapshot per client (no RFQ/Year
 * history), so these counts reflect latest status only.
 *
 * Two adoption cuts are produced from the same shape:
 *   - `overview` — every tracked product (any status), for Product Overview
 *   - `adoption` — APPROVED products only, for Product Adoption
 * Plus the opportunity pipeline (counts per status). Counts are given both by
 * product-entry and by distinct client.
 */

import type { ClientProductEntry } from "../../../lib/dashboard/data/use-scope-product-tracking";
import type { ProductDefinition, ProductStatus } from "../../../lib/types/product.types";
import { PRODUCT_STATUS_ORDER, PRODUCT_STATUS_LABELS } from "../../../lib/types/product.types";
import type { Client } from "../../../lib/types/client.types";

export interface AdoptionCount {
  label: string; // product name
  entries: number; // # of product entries in this cut
  clients: number; // # of distinct clients with it
}

export interface StackRow {
  name: string; // agency or client name
  segments: { label: string; value: number }[]; // product → count
  total: number;
}

export interface PipelineCount {
  status: ProductStatus;
  label: string;
  entries: number;
  clients: number;
}

/** One count cut (all statuses, or Approved-only) reshaped for the charts. */
export interface AdoptionCut {
  byProduct: AdoptionCount[]; // Product Mix pie
  byAgency: StackRow[]; // stacked bar: agency × product
  byClient: StackRow[]; // stacked bar: client × product
  totalEntries: number;
  totalClients: number;
}

export interface ProductKpis {
  totalTracked: number; // entries with a status
  clientsTracking: number; // distinct clients with any tracked product
  approved: number; // approved entries
  approvalRate: number | null; // approved ÷ (pitched + approved + rejected)
  topProduct: string | null; // most-adopted (approved) product name
  topProductCount: number;
}

export interface ProductAdoptionResult {
  kpis: ProductKpis;
  overview: AdoptionCut; // any status
  adoption: AdoptionCut; // APPROVED only
  pipeline: PipelineCount[]; // counts per status
}

// Palette for product slices/segments (products carry no color).
export const PRODUCT_PALETTE = [
  "#5C6BC0", "#FFA726", "#AB47BC", "#66BB6A", "#26A69A", "#FFCA28",
  "#EC407A", "#29B6F6", "#8D6E63", "#9CCC65", "#78909C", "#EF5350",
];

function pushStack(map: Map<string, Map<string, number>>, group: string, product: string) {
  const inner = map.get(group) ?? new Map<string, number>();
  inner.set(product, (inner.get(product) ?? 0) + 1);
  map.set(group, inner);
}

function toStackRows(map: Map<string, Map<string, number>>): StackRow[] {
  return [...map.entries()]
    .map(([name, products]) => {
      const segments = [...products.entries()].map(([label, value]) => ({ label, value }));
      const total = segments.reduce((a, s) => a + s.value, 0);
      return { name, segments, total };
    })
    .sort((a, b) => b.total - a.total);
}

function buildCut(
  rows: ClientProductEntry[],
  productName: (id: string) => string,
  clientById: Map<string, Client>
): AdoptionCut {
  const byProductEntries = new Map<string, number>();
  const byProductClients = new Map<string, Set<string>>();
  const agencyMap = new Map<string, Map<string, number>>();
  const clientMap = new Map<string, Map<string, number>>();

  for (const e of rows) {
    const label = productName(e.productId);
    byProductEntries.set(label, (byProductEntries.get(label) ?? 0) + 1);
    const set = byProductClients.get(label) ?? new Set<string>();
    set.add(e.clientId);
    byProductClients.set(label, set);

    const client = clientById.get(e.clientId);
    pushStack(agencyMap, client?.CL_Agency || "No agency", label);
    pushStack(clientMap, client?.CL_Name || e.clientId, label);
  }

  const byProduct: AdoptionCount[] = [...byProductEntries.entries()]
    .map(([label, count]) => ({ label, entries: count, clients: byProductClients.get(label)?.size ?? 0 }))
    .sort((a, b) => b.entries - a.entries);

  return {
    byProduct,
    byAgency: toStackRows(agencyMap),
    byClient: toStackRows(clientMap),
    totalEntries: rows.length,
    totalClients: new Set(rows.map((e) => e.clientId)).size,
  };
}

export function computeProductAdoption(
  entries: ClientProductEntry[],
  products: ProductDefinition[],
  clients: Client[]
): ProductAdoptionResult {
  const nameById = new Map(products.map((p) => [p.productId, p.name]));
  const clientById = new Map(clients.map((c) => [c.cl_id, c]));
  const productName = (id: string) => nameById.get(id) ?? id;

  // Overview counts every entry that carries a status; Adoption is Approved-only.
  const statusEntries = entries.filter((e) => e.status);
  const approved = entries.filter((e) => e.status === "APPROVED");

  const pipeline: PipelineCount[] = PRODUCT_STATUS_ORDER.map((status) => {
    const rows = entries.filter((e) => e.status === status);
    return {
      status,
      label: PRODUCT_STATUS_LABELS[status],
      entries: rows.length,
      clients: new Set(rows.map((r) => r.clientId)).size,
    };
  });

  const overview = buildCut(statusEntries, productName, clientById);
  const adoption = buildCut(approved, productName, clientById);

  // Approval rate = approved ÷ decisions made (pitched, approved or rejected).
  const decided = entries.filter(
    (e) => e.status === "PITCHED_TO_CLIENT" || e.status === "APPROVED" || e.status === "REJECTED"
  ).length;
  const top = adoption.byProduct[0];

  const kpis: ProductKpis = {
    totalTracked: statusEntries.length,
    clientsTracking: new Set(statusEntries.map((e) => e.clientId)).size,
    approved: approved.length,
    approvalRate: decided > 0 ? approved.length / decided : null,
    topProduct: top?.label ?? null,
    topProductCount: top?.entries ?? 0,
  };

  return { kpis, overview, adoption, pipeline };
}