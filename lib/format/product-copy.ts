// lib/format/product-copy.ts

/**
 * Year-to-year carry-over of the Product pipeline — pure, Firebase-free.
 *
 * Shared by the Business Lead's "Copy from {previous year}" button (one
 * client, product-grid.tsx) and the admin bulk roll-over (every client,
 * admin/products). Both bring every entry over — status, timing, note — and a
 * carried note remembers the year it was first written (`noteFrom`).
 */

import type {
  ProductEntry,
  ProductTrackingDoc,
  ProductTrackingMap,
} from "../types/product.types";

/** An entry without empty fields; null when nothing is left. */
export function cleanProductEntry(entry: ProductEntry): ProductEntry | null {
  const clean: ProductEntry = {
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.timing ? { timing: entry.timing } : {}),
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.note && entry.noteFrom ? { noteFrom: entry.noteFrom } : {}),
  };
  return Object.keys(clean).length === 0 ? null : clean;
}

/**
 * Every entry of `fromYear`, ready to become another year's entries. A note
 * keeps its original year (`noteFrom`) or gets `fromYear`.
 */
export function carryProductEntries(
  source: ProductTrackingMap,
  fromYear: number
): ProductTrackingMap {
  const out: ProductTrackingMap = {};
  for (const [productId, entry] of Object.entries(source)) {
    const clean = cleanProductEntry({
      ...entry,
      noteFrom: entry.note ? entry.noteFrom ?? fromYear : undefined,
    });
    if (clean) out[productId] = clean;
  }
  return out;
}

export interface ProductYearCopyPlan {
  fromYear: number;
  toYear: number;
  /** Clients whose target year is empty: these docs will be written. */
  copies: { clientId: string; products: ProductTrackingMap }[];
  /** Clients that already have entries in the target year — never overwritten. */
  skipped: string[];
  /** Entries written across every copy. */
  entryCount: number;
}

/**
 * Plan the admin roll-over of every client's pipeline from `fromYear` into
 * `toYear`. A client is copied only when its target year has no entry yet, so
 * a Business Lead's own work in the target year is never touched.
 */
export function planProductYearCopy(
  sourceDocs: ProductTrackingDoc[],
  targetDocs: ProductTrackingDoc[],
  fromYear: number,
  toYear: number
): ProductYearCopyPlan {
  const filled = new Set(
    targetDocs
      .filter((d) => Object.keys(d.products ?? {}).length > 0)
      .map((d) => d.clientId)
  );
  const copies: ProductYearCopyPlan["copies"] = [];
  const skipped: string[] = [];
  let entryCount = 0;
  for (const doc of sourceDocs) {
    const products = carryProductEntries(doc.products ?? {}, fromYear);
    const count = Object.keys(products).length;
    if (count === 0) continue;
    if (filled.has(doc.clientId)) {
      skipped.push(doc.clientId);
      continue;
    }
    copies.push({ clientId: doc.clientId, products });
    entryCount += count;
  }
  return { fromYear, toYear, copies, skipped, entryCount };
}
