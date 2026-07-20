// lib/services/product-service.ts

/**
 * Firestore service — "products" collection (the admin-managed DISH Products
 * catalog). One doc per product, ID = productId. Each product declares one or
 * both uses (pipeline / revenueDropdown). Modeled on labs-partner-service.
 *
 * Product IDs are stable: stored data (product_tracking statuses, Revenue
 * Product Fees lines) references them, so deleting or unflagging a product never
 * rewrites that data — the reference is simply shown as "unavailable" downstream.
 */

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  deleteField,
  updateDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { ProductDefinition, ProductDoc } from "../types/product.types";

const COLLECTION = "products";

/** Case-insensitive, trimmed identity used for duplicate-name detection. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Maps a Firestore doc into a ProductDefinition, tolerating legacy/missing flags. */
function toProduct(id: string, data: Partial<ProductDoc>): ProductDefinition {
  return {
    productId: id,
    name: String(data.name ?? ""),
    ...(data.description ? { description: data.description } : {}),
    pipeline: !!data.pipeline,
    revenueDropdown: !!data.revenueDropdown,
  };
}

/**
 * Subscribe to all products in real time, sorted by name. The collection is
 * small, so we sort in memory rather than force a server-side index.
 */
export function subscribeToProducts(
  onData: (products: ProductDefinition[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const products = snap.docs.map((d) =>
        toProduct(d.id, d.data() as Partial<ProductDoc>)
      );
      products.sort((a, b) => a.name.localeCompare(b.name));
      onData(products);
    },
    (err) => onError?.(err)
  );
}

/** One-shot read of the whole catalog (used by the bulk-edit reference). */
export async function fetchProducts(): Promise<ProductDefinition[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const products = snap.docs.map((d) =>
    toProduct(d.id, d.data() as Partial<ProductDoc>)
  );
  products.sort((a, b) => a.name.localeCompare(b.name));
  return products;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface ProductInput {
  name: string;
  description?: string;
  pipeline: boolean;
  revenueDropdown: boolean;
}

/** Shared validation for create/update: name required, at least one use on. */
function validateInput(input: ProductInput): string {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");
  if (!input.pipeline && !input.revenueDropdown)
    throw new Error(
      "A product must be used for at least one of Pipeline or Revenue Dropdown."
    );
  return name;
}

/**
 * Create a product with an auto-generated ID. Rejects a case-insensitive
 * duplicate name (Firestore equality is case-sensitive, so we compare the whole
 * — small — collection in memory).
 */
export async function createProduct(
  input: ProductInput
): Promise<ProductDefinition> {
  const name = validateInput(input);
  const description = input.description?.trim() ?? "";

  const existing = await getDocs(collection(db, COLLECTION));
  const key = nameKey(name);
  if (existing.docs.some((d) => nameKey(String(d.data().name ?? "")) === key)) {
    throw new Error(`A product named "${name}" already exists.`);
  }

  const payload: ProductDoc = {
    name,
    pipeline: input.pipeline,
    revenueDropdown: input.revenueDropdown,
    createdAt: new Date().toISOString(),
    ...(description ? { description } : {}),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);

  return {
    productId: ref.id,
    name,
    pipeline: input.pipeline,
    revenueDropdown: input.revenueDropdown,
    ...(description ? { description } : {}),
  };
}

/**
 * Edit a product. Enforces the same name-uniqueness as creation (excluding the
 * product itself). An empty description clears the field.
 */
export async function updateProduct(
  productId: string,
  input: ProductInput
): Promise<void> {
  const name = validateInput(input);
  const description = input.description?.trim() ?? "";

  const existing = await getDocs(collection(db, COLLECTION));
  const key = nameKey(name);
  if (
    existing.docs.some(
      (d) => d.id !== productId && nameKey(String(d.data().name ?? "")) === key
    )
  ) {
    throw new Error(`A product named "${name}" already exists.`);
  }

  await updateDoc(doc(db, COLLECTION, productId), {
    name,
    pipeline: input.pipeline,
    revenueDropdown: input.revenueDropdown,
    description: description ? description : deleteField(),
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, productId));
}

// ─── In-memory helpers ────────────────────────────────────────────────────────

/** Products listed in the Product (pipeline) axis. */
export function pipelineProducts(
  products: ProductDefinition[]
): ProductDefinition[] {
  return products.filter((p) => p.pipeline);
}

/** Products selectable on a Revenue "Product Fees" line. */
export function revenueDropdownProducts(
  products: ProductDefinition[]
): ProductDefinition[] {
  return products.filter((p) => p.revenueDropdown);
}
