// lib/hooks/use-submission-ready-months.ts

/**
 * Hook for the per-submission "BL Forecast Validation" — the set of milestone
 * steps (see lib/constants/confirmation-steps.ts) ticked as complete for one
 * {client, year, rfq}. Shared across the Media, Revenue and Labs tabs (stored
 * top-level on the data_entries doc), purely indicative (no locking effect).
 *
 * Toggling a step writes immediately (these are discrete flags, no debounce);
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
import { CONFIRMATION_STEP_IDS } from "../constants/confirmation-steps";
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
  /** Ids of the confirmation steps ticked complete. */
  confirmed: Set<string>;
  /** Toggle one step — persists immediately. */
  toggle: (stepId: string) => void;
  /** Tick every step. */
  selectAll: () => void;
  /** Clear every flag. */
  clear: () => void;
  status: ReadySaveStatus;
}

export function useSubmissionReadyMonths(): UseReadyMonthsResult {
  const { user } = useAuth();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;

  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
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
      setConfirmed(new Set());
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
        setConfirmed(new Set(next));
      }
    );
    return () => unsubscribe();
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type]);

  // Persist a new step set immediately (optimistic — the subscription will
  // confirm). Writes target the context the set belongs to.
  const persist = useCallback((ctx: ReadyCtx, next: Set<string>) => {
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
    (stepId: string) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setConfirmed((prev) => {
        const next = new Set(prev);
        if (next.has(stepId)) next.delete(stepId);
        else next.add(stepId);
        persist(ctx, next);
        return next;
      });
    },
    [persist]
  );

  const selectAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = new Set(CONFIRMATION_STEP_IDS);
    setConfirmed(next);
    persist(ctx, next);
  }, [persist]);

  const clear = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = new Set<string>();
    setConfirmed(next);
    persist(ctx, next);
  }, [persist]);

  return { ready, loading, confirmed, toggle, selectAll, clear, status };
}
