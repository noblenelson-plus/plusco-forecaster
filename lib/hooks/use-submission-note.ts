// lib/hooks/use-submission-note.ts

/**
 * Hook for the per-submission free-text note (shared across the Media, Revenue
 * and Labs tabs of one {client, year, rfq}).
 *
 * — Subscribes in real time to the note so concurrent edits by another user
 *   propagate live.
 * — Keeps a local working copy with a debounced autosave (plus an explicit
 *   `flush()` for blur). An incoming snapshot never clobbers text the user is
 *   actively editing (`dirty` guard) — last write wins on save.
 * — Always writable for a user with access (selection is restricted to
 *   accessible clients upstream); editing is allowed even on a LOCKED RFQ.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context";
import { useForecastSelection } from "../stores/forecast-selection.store";
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
  /** Is a full {client, year, rfq} selected? Otherwise there is nothing to note. */
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

export function useSubmissionNote(): UseSubmissionNoteResult {
  const { user } = useAuth();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;

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

  // Keep the refs in sync outside render so the debounce timer and the
  // context-switch cleanup read the latest values without re-creating callbacks.
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

  // ─── Live subscription to the selected submission's note ─────────────────
  useEffect(() => {
    if (!ready) {
      setTextState("");
      setMeta({});
      dirtyRef.current = false;
      ctxRef.current = null;
      setStatus("idle");
      return;
    }

    const ctx: NoteCtx = {
      clientId: selectedClient!.cl_id,
      year: selectedYear!,
      rfq: selectedRFQ!.type,
    };
    ctxRef.current = ctx;
    dirtyRef.current = false;
    setLoading(true);
    setStatus("idle");

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
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type, persist]);

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
