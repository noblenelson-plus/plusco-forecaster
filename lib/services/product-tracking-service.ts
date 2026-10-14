// lib/services/product-tracking-service.ts

import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import {
  productTrackingDocId,
  type ProductTrackingDoc,
  type ProductTrackingMap,
} from "../types/product.types";

const COLLECTION = "product_tracking";

/**
 * One-shot read of a client's product tracking for a year. Returns null when
 * the doc doesn't exist (nothing tracked that year). Used by the dashboard,
 * which reads many clients in parallel and doesn't need real-time updates, and
 * by "Copy from {year}" in the Product grid.
 */
export async function fetchProductTracking(
  clientId: string,
  year: number
): Promise<ProductTrackingDoc | null> {
  const snap = await getDoc(
    doc(db, COLLECTION, productTrackingDocId(clientId, year))
  );
  return snap.exists() ? (snap.data() as ProductTrackingDoc) : null;
}

/**
 * Subscribe to a client's product tracking for a year in real time. The doc
 * may not exist yet (nothing tracked) — the callback then receives null.
 */
export function subscribeToProductTracking(
  clientId: string,
  year: number,
  onData: (data: ProductTrackingDoc | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, productTrackingDocId(clientId, year)),
    (snap) => {
      onData(snap.exists() ? (snap.data() as ProductTrackingDoc) : null);
    },
    (err) => onError?.(err)
  );
}

/**
 * Save a client's full product map for a year. The doc is replaced wholesale
 * (no merge): a cleared status must actually disappear, and
 * setDoc(merge:true) would let removed product keys linger.
 */
export async function saveProductTracking(
  clientId: string,
  year: number,
  products: ProductTrackingMap
): Promise<void> {
  const payload: ProductTrackingDoc = {
    clientId,
    year,
    products,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTION, productTrackingDocId(clientId, year)), payload);
}
