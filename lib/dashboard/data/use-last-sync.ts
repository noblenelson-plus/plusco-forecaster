// filepath: lib/dashboard/data/use-last-sync.ts
"use client";

/**
 * Reads the dashboard_meta/last_sync doc written by scripts/sync-all.mjs at the
 * end of every monthly sync, and exposes the MIR "as of" date to the app so
 * the hand-edited MIR_AS_OF_LABEL constant can be retired.
 *
 * The stamp stores the date in structured pieces (month, day, year) plus two
 * prebuilt strings, so this hook can serve whichever format a label needs:
 *   - label        -> "August 26, 2026"          (full month)
 *   - labelShort    -> "Aug 26, 2026"             (abbreviated; matches the old constant)
 *   - updatedLabel  -> "Last Updated August 26, 2026"
 * If the doc is missing or its SOURCE never parsed, the string fields fall back to
 * whatever the stamp stored (e.g. the raw "MIR AUG 26"), and the consuming
 * component keeps the old constant as a last-resort default.
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

const META_COLLECTION = "dashboard_meta";
const META_DOC = "last_sync";

// Shape of the dashboard_meta/last_sync document (see scripts/sync-all.mjs).
export interface LastSyncDoc {
  source_raw: string | null;
  label: string | null;
  updated_label: string | null;
  month: string | null;
  day: number | null;
  year: number | null;
  parse_ok: boolean;
  synced_at: string | null;
  synced_at_ms: number | null;
  [key: string]: unknown;
}

export interface LastSyncResult {
  loading: boolean;
  error: string | null;
  raw: LastSyncDoc | null;
  /** Full-month date, e.g. "August 26, 2026". Null when unavailable. */
  label: string | null;
  /** Abbreviated-month date, e.g. "Aug 26, 2026" (matches the legacy label). */
  labelShort: string | null;
  /** e.g. "Last Updated August 26, 2026". */
  updatedLabel: string | null;
}

/** Build "Aug 26, 2026" from the structured pieces, else fall back to the stored label. */
function shortLabel(d: LastSyncDoc | null): string | null {
  if (!d) return null;
  if (
    d.parse_ok &&
    typeof d.month === "string" &&
    typeof d.day === "number" &&
    typeof d.year === "number"
  ) {
    return `${d.month.slice(0, 3)} ${d.day}, ${d.year}`;
  }
  return d.label ?? d.source_raw ?? null;
}

/**
 * One-shot read of dashboard_meta/last_sync. It is a single tiny doc, so there is
 * no snapshot listener — same one-shot pattern as the other dashboard data modules.
 */
export function useLastSync(): LastSyncResult {
  const [raw, setRaw] = useState<LastSyncDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, META_COLLECTION, META_DOC));
        if (cancelled) return;
        setRaw(snap.exists() ? (snap.data() as LastSyncDoc) : null);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load last-sync info."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    error,
    raw,
    label: raw?.label ?? null,
    labelShort: shortLabel(raw),
    updatedLabel: raw?.updated_label ?? null,
  };
}
