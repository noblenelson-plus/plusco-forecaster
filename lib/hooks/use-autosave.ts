// lib/hooks/use-autosave.ts

/**
 * Debounced autosave + leave-guards for the forecast grid.
 *
 * The grid persists a whole axis in a single Firestore write, so saving "as you
 * go" costs one document write per editing burst — not one per cell. This hook:
 *   — debounces: a save fires once the user pauses for `delay` ms (re-armed on
 *     every change), collapsing a burst of edits into one write;
 *   — flushes pending changes when the tab is hidden / the page is unloaded /
 *     the component unmounts (route change), where a debounce timer wouldn't run;
 *   — keeps a `beforeunload` prompt as a last resort if a write is still pending;
 *   — derives a `status` for the UI ("clean" / "pending" / "saving" / "saved").
 *
 * It never holds a stale closure: the latest `save` and dirty flag are mirrored
 * into refs read by the timers and listeners.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "clean" | "pending" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  /** There are unsaved changes. */
  hasChanges: boolean;
  /** A save is currently running. */
  saving: boolean;
  /** The last save failed — keeps the indicator from flashing "Saved". */
  error?: boolean;
  /** Persist the current changes. Must be a no-op when nothing is dirty. */
  save: () => void | Promise<void>;
  /** Idle delay before autosaving, in ms. */
  delay?: number;
  /** Disable autosave entirely (e.g. a locked RFQ — nothing can be dirty). */
  disabled?: boolean;
}

export function useAutosave({
  hasChanges,
  saving,
  error = false,
  save,
  delay = 2000,
  disabled = false,
}: UseAutosaveOptions): { status: SaveStatus } {
  // Mirror the live save + dirty flag so timers/listeners never fire stale.
  const saveRef = useRef(save);
  saveRef.current = save;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel any pending timer and save immediately if still dirty. */
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (hasChangesRef.current) saveRef.current();
  }, []);

  // Autosave timer — armed whenever the grid is dirty. Each save clears the
  // dirty flag, so during a long editing session it fires roughly every `delay`
  // ms (cheap: one whole-axis write each), and the final state is always saved
  // within `delay` ms of the last edit. One write per burst, never per cell.
  useEffect(() => {
    if (disabled || !hasChanges) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (hasChangesRef.current) saveRef.current();
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hasChanges, delay, disabled]);

  // Leave-guards: flush on tab hide / page unload (these fire on mobile
  // backgrounding and tab close where `beforeunload` is unreliable), and prompt
  // via `beforeunload` only if a write is still pending.
  useEffect(() => {
    if (disabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasChangesRef.current) return;
      flush();
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush, disabled]);

  // Flush on unmount (e.g. navigating to another route).
  useEffect(() => () => flush(), [flush]);

  // Transient "Saved" badge: shown briefly when the grid settles dirty → clean
  // without an error. State is set from async timers (not synchronously in the
  // effect) so it never triggers a cascading render.
  const wasDirty = useRef(false);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (hasChanges) {
      wasDirty.current = true;
      return;
    }
    if (!wasDirty.current || saving || error) return;
    wasDirty.current = false;
    const show = setTimeout(() => setJustSaved(true), 0);
    const hide = setTimeout(() => setJustSaved(false), 2500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [hasChanges, saving, error]);

  const status: SaveStatus = error
    ? "error"
    : saving
    ? "saving"
    : hasChanges
    ? "pending"
    : justSaved
    ? "saved"
    : "clean";

  return { status };
}
