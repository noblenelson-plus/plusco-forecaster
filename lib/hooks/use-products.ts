// lib/hooks/use-products.ts

import { useEffect, useState } from "react";
import { subscribeToProducts } from "../services/product-service";
import type { ProductDefinition } from "../types/product.types";

export interface UseProductsResult {
  products: ProductDefinition[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribe to the admin-managed DISH Products catalog in real time. Consumers
 * filter by use (pipeline / revenueDropdown) with the service helpers.
 */
export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<ProductDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToProducts(
      (data) => {
        setProducts(data);
        setLoading(false);
      },
      (err) => {
        console.error("Products subscription failed:", err);
        setError("Failed to load products.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { products, loading, error };
}
