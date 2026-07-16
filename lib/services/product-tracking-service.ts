// lib/services/product-tracking-service.ts

import { doc, onSnapshot, setDoc, Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type {
  ProductTrackingDoc,
  ProductTrackingMap,
} from "../types/product.types";

const COLLECTION = "product_tracking";

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
