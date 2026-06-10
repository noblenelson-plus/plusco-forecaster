// lib/stores/comparison-selection.store.ts

/**
 * Comparison scope store — holds a second Year + RFQ selection used to compare
 * against the primary forecast scope (useForecastSelection). Mirrors that
 * store's shape for the Year/RFQ slice so consumers can read both with the
 * same mental model.
 *
 * Currently only the dashboard context bar writes to this store; tabs will
 * read from it later to render variance below scorecards. No client selector
 * here — the dashboard's client scope is shared between primary and
 * comparison (driven by the multi-select filter bar).
 */

import { create } from "zustand";
import type { RFQ } from "../types/rfq.types";

interface ComparisonSelectionState {
  comparisonYear: number | null;
  comparisonRFQ: RFQ | null;
  setComparisonYear: (year: number | null) => void;
  setComparisonRFQ: (rfq: RFQ | null) => void;
  resetComparison: () => void;
}

export const useComparisonSelection = create<ComparisonSelectionState>((set) => ({
  comparisonYear: null,
  comparisonRFQ: null,

  // Clearing the year also clears the RFQ — an RFQ without its year is meaningless,
  // and switching years should never leave a stale RFQ pinned.
  setComparisonYear: (year) =>
    set((prev) => ({
      comparisonYear: year,
      comparisonRFQ: year === prev.comparisonYear ? prev.comparisonRFQ : null,
    })),

  setComparisonRFQ: (rfq) => set({ comparisonRFQ: rfq }),

  resetComparison: () => set({ comparisonYear: null, comparisonRFQ: null }),
}));