// lib/hooks/use-submission-ready-months.ts

/**
 * Hook for the per-submission "ready months" — the set of months (1–12) flagged
 * as complete/ready for one {client, year, rfq}. Shared across the Media,
 * Revenue and Labs tabs (stored top-level on the data_entries doc), purely
 * indicative (no locking effect).
 *
 * Toggling a month writes immediately (these are discrete flags, no debounce);
 * an incoming snapshot reflects edits by other users live. Always writable for a
 * user with access — including on a LOCKED RFQ.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context";
import { useForecastSelection } from "../stores/forecast-selection.store";
import {
  subscribeToReadyMonths,
  saveReadyMonths,
} from "../services/data-entry-service";
import type { RFQType } from "../types/rfq.types";

export type ReadySaveStatus = "idle" | "saving" | "saved" | "error";

interface ReadyCtx {
  clientId: string;
  year: number;
  rfq: RFQType;
}

export interface UseReadyMonthsResult {
  ready: boolean;
  loading: boolean;
  /** Months (1–12) flagged ready. */
  months: Set<number>;
  /** Toggle one month — persists immediately. */
  toggle: (month: number) => void;
  /** Mark all 12 months ready. */
  selectAll: () => void;
  /** Clear every flag. */
  clear: () => void;
  status: ReadySaveStatus;
}

export function useSubmissionReadyMonths(): UseReadyMonthsResult {
  const { user } = useAuth();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;

  const [months, setMonths] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ReadySaveStatus>("idle");

  const ctxRef = useRef<ReadyCtx | null>(null);
  const uidRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    uidRef.current = user?.uid;
  }, [user?.uid]);

  // ─── Live subscription to the selected submission's ready months ─────────
  useEffect(() => {
    if (!ready) {
      setMonths(new Set());
      ctxRef.current = null;
      setStatus("idle");
      return;
    }

    const ctx: ReadyCtx = {
      clientId: selectedClient!.cl_id,
      year: selectedYear!,
      rfq: selectedRFQ!.type,
    };
    ctxRef.current = ctx;
    setLoading(true);

    const unsubscribe = subscribeToReadyMonths(
      ctx.clientId,
      ctx.year,
      ctx.rfq,
      (next) => {
        setLoading(false);
        setMonths(new Set(next));
      }
    );
    return () => unsubscribe();
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type]);

  // Persist a new month set immediately (optimistic — the subscription will
  // confirm). Writes target the context the set belongs to.
  const persist = useCallback((ctx: ReadyCtx, next: Set<number>) => {
    setStatus("saving");
    saveReadyMonths(ctx.clientId, ctx.year, ctx.rfq, [...next], uidRef.current)
      .then(() => {
        if (ctxRef.current === ctx) setStatus("saved");
      })
      .catch(() => {
        if (ctxRef.current === ctx) setStatus("error");
      });
  }, []);

  const toggle = useCallback(
    (month: number) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setMonths((prev) => {
        const next = new Set(prev);
        if (next.has(month)) next.delete(month);
        else next.add(month);
        persist(ctx, next);
        return next;
      });
    },
    [persist]
  );

  const selectAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    setMonths(next);
    persist(ctx, next);
  }, [persist]);

  const clear = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = new Set<number>();
    setMonths(next);
    persist(ctx, next);
  }, [persist]);

  return { ready, loading, months, toggle, selectAll, clear, status };
}
