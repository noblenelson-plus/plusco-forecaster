// lib/types/product.types.ts

/**
 * Product axis — always-on product tracking per client.
 *
 * Unlike the Media/Revenue/Labs axes there is no year, RFQ or monthly grid:
 * for each product of the catalog, the Business Lead tracks a pipeline status
 * and, optionally, a timing (the month revenue is expected to start).
 */

// ─── Statuses ─────────────────────────────────────────────────────────────────

export type ProductStatus =
  | "IDENTIFIED_PROSPECT"
  | "PITCHED_TO_CLIENT"
  | "APPROVED"
  | "REJECTED";

/** Display order of the status columns in the grid. */
export const PRODUCT_STATUS_ORDER: ProductStatus[] = [
  "IDENTIFIED_PROSPECT",
  "PITCHED_TO_CLIENT",
  "APPROVED",
  "REJECTED",
];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "Identified Prospect",
  PITCHED_TO_CLIENT: "Pitched To Client",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Timing only applies to statuses on the revenue path — not to Rejected. */
export function statusAllowsTiming(status: ProductStatus | null): boolean {
  return status !== null && status !== "REJECTED";
}

// ─── Product catalog ──────────────────────────────────────────────────────────

export interface ProductDefinition {
  /** Stable slug used as the key in Firestore (never rename). */
  productId: string;
  name: string;
}

export const PRODUCTS: ProductDefinition[] = [
  { productId: "analytics-hub", name: "Analytics Hub" },
  { productId: "smart-persona", name: "Smart Persona" },
  { productId: "aios", name: "AIOS" },
  { productId: "social-sonar", name: "Social Sonar" },
  { productId: "insights-hub", name: "Insights Hub" },
  { productId: "dco", name: "DCO" },
  { productId: "radius", name: "Radius" },
  { productId: "aeo", name: "AEO" },
  { productId: "mediabox-2", name: "Mediabox 2.0" },
  { productId: "affiliates-aim", name: "Affiliates (AIM)" },
];

// ─── Stored data ──────────────────────────────────────────────────────────────

export interface ProductEntry {
  /** Absent = no status picked (a product may carry only a note). */
  status?: ProductStatus;
  /** Expected month revenue starts, "YYYY-MM". Optional, BL-entered. */
  timing?: string;
  /** Free-text note. Optional, BL-entered. */
  note?: string;
}

/** Per-product entries; a product with nothing tracked simply has no key. */
export type ProductTrackingMap = Record<string, ProductEntry>;

/** Firestore doc — collection `product_tracking`, one doc per client (ID = cl_id). */
export interface ProductTrackingDoc {
  clientId: string;
  products: ProductTrackingMap;
  updatedAt?: string;
}
