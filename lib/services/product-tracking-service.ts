// lib/services/product-tracking-service.ts

import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type {
  ProductTrackingDoc,
  ProductTrackingMap,
} from "../types/product.types";

const COLLECTION = "product_tracking";

/**
 * One-shot read of a client's product tracking doc. Returns null when the doc
 * doesn't exist (no product tracked yet). Used by the dashboard, which reads
 * many clients in parallel and doesn't need real-time updates.
 */
export async function fetchProductTracking(
  clientId: string
): Promise<ProductTrackingDoc | null> {
  const snap = await getDoc(doc(db, COLLECTION, clientId));
  return snap.exists() ? (snap.data() as ProductTrackingDoc) : null;
}

/**
 * Subscribe to a client's product tracking doc in real time. The doc may not
 * exist yet (no product tracked) — the callback then receives null.
 */
export function subscribeToProductTracking(
  clientId: string,
  onData: (data: ProductTrackingDoc | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, clientId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as ProductTrackingDoc) : null);
    },
    (err) => onError?.(err)
  );
}

/**
 * Save a client's full product map. The doc is replaced wholesale (no merge):
 * a cleared status must actually disappear, and setDoc(merge:true) would let
 * removed product keys linger.
 */
export async function saveProductTracking(
  clientId: string,
  products: ProductTrackingMap
): Promise<void> {
  const payload: ProductTrackingDoc = {
    clientId,
    products,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTION, clientId), payload);
}
