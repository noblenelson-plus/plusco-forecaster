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

/**
 * The product catalog is admin-managed in the "DISH Products" module
 * (app/(protected)/admin/products), stored in the Firestore `products`
 * collection — one doc per product, ID = productId. Each product declares one or
 * both uses:
 *   - `pipeline`        → appears in the Product (pipeline) axis on /forecast
 *   - `revenueDropdown` → selectable on a Revenue "Product Fees" BL line
 *
 * The catalog is loaded dynamically (product-service / use-products); there is no
 * static list. Existing per-client data references products by `productId`, so a
 * product doc's ID is stable for its lifetime — deleting or unflagging a product
 * never rewrites the data that references it (such references are shown as
 * "unavailable" rather than dropped).
 */
export interface ProductDefinition {
  /** Stable Firestore doc ID — the key referenced by stored data. Never reused. */
  productId: string;
  name: string;
  /** Optional free-text description shown in the admin module. */
  description?: string;
  /** Listed in the Product (pipeline) axis. */
  pipeline: boolean;
  /** Selectable on a Revenue "Product Fees" BL line. */
  revenueDropdown: boolean;
}

/** Stored shape of a `products` doc (the ID lives on the doc, not in the body). */
export type ProductDoc = Omit<ProductDefinition, "productId"> & {
  createdAt?: string;
};

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
