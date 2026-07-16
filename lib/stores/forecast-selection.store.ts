// lib/stores/forecast-selection.store.ts

/**
 * Zustand store — global forecast context selection.
 *
 * Shared across all pages (Forecast tabs, Dashboard…) and persisted to
 * localStorage, so the selected Client / Year / RFQ survives tab switches,
 * page reloads and new sessions on the same browser.
 *
 * Staleness guards live next to the consumers:
 *  — forecast-selectors re-syncs the selected RFQ against the live `rfqs`
 *    subscription (status / closed-months refresh, deletion → null) and
 *    validates the selected client against the accessible list.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RFQ } from "../types/rfq.types";
import type { ClientSummary } from "../types/client.types";

interface ForecastSelectionState {
  // ─── Current selection ────────────────────────────────────────────────
  selectedClient: ClientSummary | null;
  selectedYear: number | null;
  selectedRFQ: RFQ | null;

  // ─── Actions ──────────────────────────────────────────────────────────
  setClient: (client: ClientSummary | null) => void;
  setYear: (year: number | null) => void;
  setRFQ: (rfq: RFQ | null) => void;
  reset: () => void;
}

export const useForecastSelection = create<ForecastSelectionState>()(
  persist(
    (set) => ({
      selectedClient: null,
      selectedYear: null,
      selectedRFQ: null,

      setClient: (client) => set({ selectedClient: client }),

      // Changing the year invalidates the selected RFQ (it belongs to a year)
      setYear: (year) =>
        set((state) => ({
          selectedYear: year,
          selectedRFQ:
            state.selectedRFQ?.year === year ? state.selectedRFQ : null,
        })),

      setRFQ: (rfq) =>
        set({
          selectedRFQ: rfq,
          // Selecting an RFQ automatically aligns the year
          ...(rfq ? { selectedYear: rfq.year } : {}),
        }),

      reset: () =>
        set({ selectedClient: null, selectedYear: null, selectedRFQ: null }),
    }),
    {
      name: "forecast-selection",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ─── Derived selectors (convenient for the data-entry pages) ─────────────────

/** Current data_entries document ID: {cl_id}_{year}_{type}, or null when incomplete. */
export function useCurrentDataEntryId(): string | null {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  if (!selectedClient || !selectedYear || !selectedRFQ) return null;
  return `${selectedClient.cl_id}_${selectedYear}_${selectedRFQ.type}`;
}

/** Is the selected RFQ locked? (false when no RFQ is selected) */
export function useIsSelectedRFQLocked(): boolean {
  const rfq = useForecastSelection((s) => s.selectedRFQ);
  return rfq?.status === "LOCKED";
}
