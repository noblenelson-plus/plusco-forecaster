// lib/hooks/use-reference-selection.ts
"use client";

/**
 * Row-checkbox selection over a reference strip (MediaBox or MediaOcean) of the
 * forecast grid — the input of the structured "Copy to my submission" flow.
 *
 * The selection is a set of LEAF keys, where a leaf is one (channel × campaign)
 * atom: the smallest unit both orientations of a strip are built from. A parent
 * row (a campaign, or a channel/partner) is never stored — its state is derived
 * from the leaves under it, so it reads correctly in either orientation:
 *   - checked       → every leaf under it is selected;
 *   - indeterminate → some, but not all, are;
 *   - toggling it   → selects all its leaves, or clears them when all were set.
 *
 * Keys are stable across an orientation flip (same atoms, regrouped), but the
 * grid still clears the selection on a flip to keep the behavior predictable.
 */

import { useCallback, useMemo, useState } from "react";

/**
 * Orientation of both reference strips, driven by one shared toggle:
 * Campaign › Channel ("campaign") or Channel › Campaign ("channel"). On the Labs
 * axis "channel" means the LABS partner.
 */
export type ReferenceOrientation = "campaign" | "channel";

/** Stable key of one (channel × campaign) atom of a reference strip. */
export function leafKey(channel: string, campaign: string): string {
  return JSON.stringify([channel, campaign]);
}

export interface ReferenceSelection {
  /** Number of selected leaves. */
  count: number;
  /** True when every key is selected (a leaf: `[key]`; a parent: its leaves). */
  isChecked: (keys: string[]) => boolean;
  /** True when some, but not all, of the keys are selected. */
  isIndeterminate: (keys: string[]) => boolean;
  /** Flip a single leaf. */
  toggle: (key: string) => void;
  /** Parent click: select all its leaves, or clear them if all were selected. */
  toggleParent: (keys: string[]) => void;
  clear: () => void;
  /** Selected leaf keys, in no particular order. */
  selectedLeaves: () => string[];
}

export function useReferenceSelection(): ReferenceSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const isChecked = useCallback(
    (keys: string[]) => keys.length > 0 && keys.every((k) => selected.has(k)),
    [selected]
  );

  const isIndeterminate = useCallback(
    (keys: string[]) => {
      const hits = keys.filter((k) => selected.has(k)).length;
      return hits > 0 && hits < keys.length;
    },
    [selected]
  );

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleParent = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const all = keys.every((k) => prev.has(k));
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectedLeaves = useCallback(() => [...selected], [selected]);

  return useMemo(
    () => ({
      count: selected.size,
      isChecked,
      isIndeterminate,
      toggle,
      toggleParent,
      clear,
      selectedLeaves,
    }),
    [selected, isChecked, isIndeterminate, toggle, toggleParent, clear, selectedLeaves]
  );
}
