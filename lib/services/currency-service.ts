// lib/services/currency-service.ts

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CurrencyRate } from "../types/currency.types";

const COLLECTION = "currency_rates";

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all yearly USD → CAD conversion rates in real time,
 * sorted by year (most recent first). The collection is tiny, so we sort
 * the snapshot in memory rather than forcing a server-side index.
 */
export function subscribeToCurrencyRates(
  onData: (rates: CurrencyRate[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const rates = snap.docs.map((d) => d.data() as CurrencyRate);
      rates.sort((a, b) => b.year - a.year);
      onData(rates);
    },
    (err) => onError?.(err)
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create or update the conversion rate for a year. The document id is the
 * year, so a year always has exactly one rate (upsert via setDoc).
 */
export async function setCurrencyRate(
  year: number,
  usdToCad: number
): Promise<void> {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error("Year must be an integer between 2020 and 2100.");
  }
  if (!Number.isFinite(usdToCad) || usdToCad <= 0) {
    throw new Error("Conversion rate must be a positive number.");
  }

  const payload: CurrencyRate = {
    year,
    usdToCad,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTION, String(year)), payload);
}

export async function deleteCurrencyRate(year: number): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, String(year)));
}

// ─── In-memory helpers ────────────────────────────────────────────────────────

/** Look up the USD → CAD rate for a year, or undefined if none is set. */
export function getCurrencyRateForYear(
  rates: CurrencyRate[],
  year: number
): number | undefined {
  return rates.find((r) => r.year === year)?.usdToCad;
}
