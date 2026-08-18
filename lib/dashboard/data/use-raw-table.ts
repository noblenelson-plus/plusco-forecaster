// filepath: lib/dashboard/data/use-raw-table.ts
"use client";

/**
 * Scoped reader for the RAW mirror collections (mir_raw, billing_summary_raw).
 *
 * These collections are large (126k / 31.7k wide docs), so this NEVER loads the
 * whole collection. Two modes:
 *   - NO scope selected: loads a small UNSCOPED SAMPLE (first `previewLimit` docs
 *     by document id) so the page shows real rows + all columns the moment it
 *     opens -- a "here's what the data looks like" preview for non-technical leads.
 *     Not exportable (it is just the head of the table, not a filtered slice).
 *   - A scope selected: runs a single-field `where(scopeField == scopeValue)`
 *     query and returns that whole slice (a lead's few-thousand rows), which IS
 *     exportable.
 *
 * Single-field equality + a plain id-ordered limit both need no composite index.
 */

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export interface RawTableRow {
  id: string;
  [key: string]: unknown;
}

export interface RawTableResult {
  rows: RawTableRow[];
  loading: boolean;
  error: string | null;
  /** True when a scope value is active (rows are a real filtered slice). */
  scoped: boolean;
  /** True when rows are the unscoped head-of-table sample (not exportable). */
  isSample: boolean;
}

/**
 * @param collectionName  e.g. "mir_raw" | "billing_summary_raw"
 * @param scopeField      field to filter on, e.g. "PLUSCO_CLIENT_NAME" (or null)
 * @param scopeValue      chosen value; when null/empty a sample is loaded instead
 * @param previewLimit    rows to load for the unscoped sample (default 25)
 */
export function useRawTable(
  collectionName: string,
  scopeField: string | null,
  scopeValue: string | null,
  previewLimit = 25
): RawTableResult {
  const [rows, setRows] = useState<RawTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasScope =
    !!scopeField &&
    !!scopeValue &&
    scopeField.trim() !== "" &&
    scopeValue.trim() !== "";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = hasScope
          ? query(
              collection(db, collectionName),
              where(scopeField as string, "==", scopeValue as string)
            )
          : query(collection(db, collectionName), limit(previewLimit));

        const snap = await getDocs(q);
        if (cancelled) return;
        const out = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, unknown>),
        })) as RawTableRow[];
        // Stable order by the sync's sequential row index when present.
        out.sort((a, b) => {
          const ai = typeof a._rowIndex === "number" ? a._rowIndex : 0;
          const bi = typeof b._rowIndex === "number" ? b._rowIndex : 0;
          return ai - bi;
        });
        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [collectionName, scopeField, scopeValue, hasScope, previewLimit]);

  return { rows, loading, error, scoped: hasScope, isSample: !hasScope };
}

// ─── In-memory helpers (unchanged) ─────────────────────────────────────────────

/** Distinct, sorted, non-empty values for one field across the loaded rows. */
export function rawFieldOptions(
  rows: RawTableRow[],
  field: string
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const s = (r[field] ?? "").toString().trim();
    if (s !== "") set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Apply a map of field -> selected values to the loaded rows. */
export function applyRawFilters(
  rows: RawTableRow[],
  filters: Record<string, string[]>
): RawTableRow[] {
  const active = Object.entries(filters).filter(([, vals]) => vals.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(([field, vals]) =>
      vals.includes((r[field] ?? "").toString().trim())
    )
  );
}
