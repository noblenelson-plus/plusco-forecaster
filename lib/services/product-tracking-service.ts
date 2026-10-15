// lib/services/product-tracking-service.ts

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  Unsubscribe,
} from "firebase/firestore";
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

/**
 * Every client's product tracking for a year (admin only — the rules let a
 * non-admin read only the clients they can see, so a collection query would
 * be refused). Used by the admin roll-over to the next year.
 */
export async function fetchAllProductTrackingForYear(
  year: number
): Promise<ProductTrackingDoc[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("year", "==", year))
  );
  return snap.docs.map((d) => d.data() as ProductTrackingDoc);
}

/**
 * Admin roll-over: write each client's carried-over map as its `year` doc, in
 * batches of 500. Callers pass only clients whose target year is empty (see
 * planProductYearCopy) — this writes the docs wholesale like saveProductTracking.
 */
export async function writeProductTrackingCopies(
  year: number,
  copies: { clientId: string; products: ProductTrackingMap }[]
): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < copies.length; i += 500) {
    const batch = writeBatch(db);
    for (const { clientId, products } of copies.slice(i, i + 500)) {
      const payload: ProductTrackingDoc = { clientId, year, products, updatedAt };
      batch.set(doc(db, COLLECTION, productTrackingDocId(clientId, year)), payload);
    }
    await batch.commit();
  }
}
