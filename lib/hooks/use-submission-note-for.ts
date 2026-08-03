// lib/hooks/use-submission-note-for.ts

/**
 * Hook for the per-submission free-text note ({client, year, rfq}), addressed
 * by explicit arguments instead of the global forecast selection.
 *
 * This is the Forecaster dashboard's counterpart to `useSubmissionNote`: the
 * dashboard focuses an arbitrary client (the row you clicked), which is NOT the
 * globally selected client, so the note context must be passed in. It reads and
 * writes through the very same service functions as the Forecast page, so a
 * note edited here and one edited by a BL on the Forecast page are the same
 * note and sync both ways in real time.
 *
 * Behaviour mirrors `useSubmissionNote`:
 *  — Live subscription so concurrent edits propagate.
 *  — Local working copy with a debounced autosave (plus `flush()` for blur).
 *    An incoming snapshot never clobbers text being actively edited (`dirty`
 *    guard); last write wins on save.
 *  — Editing is allowed even on a LOCKED RFQ.
 *
 * State that must reset when the focused submission changes (text, loading,
 * status, meta) is reset during render via the standard "previous value"
 * pattern rather than inside the effect, which keeps the effect free of the
 * synchronous-setState / cascading-render lint.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context";
import {
  subscribeToSubmissionNote,
  saveSubmissionNote,
} from "../services/data-entry-service";
import type { RFQType } from "../types/rfq.types";

export type NoteSaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY = 800;

interface NoteCtx {
  clientId: string;
  year: number;
  rfq: RFQType;
}

export interface UseSubmissionNoteResult {
  /** Is a full {client, year, rfq} provided? Otherwise there is nothing to note. */
  ready: boolean;
  loading: boolean;
  text: string;
  /** Edit the note — schedules a debounced autosave. */
  setText: (value: string) => void;
  /** Persist any pending edit immediately (e.g. on blur). */
  flush: () => void;
  status: NoteSaveStatus;
  updatedAt?: string;
  updatedBy?: string;
}

/** Stable key identifying a submission context (null when not ready). */
function ctxKeyOf(clientId: string | null, year: number | null, rfq: RFQType | null): string | null {
  return clientId && year !== null && rfq !== null ? `${clientId}\u0000${year}\u0000${rfq}` : null;
}

/**
 * @param clientId The focused client's id (null when nothing is focused).
 * @param year     The submission year (the primary Year up top).
 * @param rfq      The submission round (the primary RFQ up top).
 */
export function useSubmissionNoteFor(
  clientId: string | null,
  year: number | null,
  rfq: RFQType | null
): UseSubmissionNoteResult {
  const { user } = useAuth();
  const ready = !!clientId && year !== null && rfq !== null;

  const [text, setTextState] = useState("");
  const [meta, setMeta] = useState<{ updatedAt?: string; updatedBy?: string }>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<NoteSaveStatus>("idle");

  // Refs let the debounce timer and the context-switch cleanup read the latest
  // value/context without re-creating callbacks on every keystroke.
  const textRef = useRef("");
  const dirtyRef = useRef(false);
  const ctxRef = useRef<NoteCtx | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidRef = useRef<string | undefined>(undefined);

  // Reset per-submission state during render when the focused submission
  // changes. Adjusting state during render (conditionally, so it converges) is
  // the sanctioned React pattern and avoids resetting inside the effect.
  const nextKey = ctxKeyOf(clientId, year, rfq);
  const [ctxKey, setCtxKey] = useState<string | null>(nextKey);
  if (nextKey !== ctxKey) {
    setCtxKey(nextKey);
    setTextState("");
    setMeta({});
    setStatus("idle");
    setLoading(ready);
  }

  useEffect(() => {
    uidRef.current = user?.uid;
  }, [user?.uid]);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Pure write to a specific context — shared by the debounce, blur flush and
  // the context-switch cleanup (which fires for the doc being left).
  const persist = useCallback(async (ctx: NoteCtx, value: string) => {
    setStatus("saving");
    try {
      await saveSubmissionNote(ctx.clientId, ctx.year, ctx.rfq, value, uidRef.current);
      // Only clear dirty/show "saved" if the context hasn't moved on since.
      if (ctxRef.current && ctxRef.current.clientId === ctx.clientId &&
          ctxRef.current.year === ctx.year && ctxRef.current.rfq === ctx.rfq) {
        dirtyRef.current = false;
        setStatus("saved");
      }
    } catch {
      if (ctxRef.current && ctxRef.current.clientId === ctx.clientId &&
          ctxRef.current.year === ctx.year && ctxRef.current.rfq === ctx.rfq) {
        setStatus("error");
      }
    }
  }, []);

  // ─── Live subscription to the provided submission's note ─────────────────
  useEffect(() => {
    if (!ready) {
      dirtyRef.current = false;
      ctxRef.current = null;
      return;
    }

    const ctx: NoteCtx = { clientId: clientId!, year: year!, rfq: rfq! };
    ctxRef.current = ctx;
    dirtyRef.current = false;

    const unsubscribe = subscribeToSubmissionNote(
      ctx.clientId,
      ctx.year,
      ctx.rfq,
      (note) => {
        setLoading(false);
        setMeta({ updatedAt: note?.updatedAt, updatedBy: note?.updatedBy });
        // Don't overwrite what the user is currently typing.
        if (!dirtyRef.current) {
          setTextState(note?.text ?? "");
          setStatus("idle");
        }
      }
    );

    return () => {
      unsubscribe();
      // Persist a pending edit to the doc being left before the new one loads.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) void persist(ctx, textRef.current);
    };
  }, [ready, clientId, year, rfq, persist]);

  const setText = useCallback(
    (value: string) => {
      setTextState(value);
      dirtyRef.current = true;
      setStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const ctx = ctxRef.current;
        if (ctx) void persist(ctx, value);
      }, AUTOSAVE_DELAY);
    },
    [persist]
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ctx = ctxRef.current;
    if (ctx && dirtyRef.current) void persist(ctx, textRef.current);
  }, [persist]);

  return {
    ready,
    loading,
    text,
    setText,
    flush,
    status,
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
  };
}