// lib/stores/forecast-selection.store.ts

/**
 * Store Zustand — sélection globale du contexte de prévision.
 *
 * Partagé entre toutes les pages (Media, Revenue, Labs, Dashboard…) :
 * la sélection persiste entre les écrans tant que l'app est ouverte,
 * mais PAS d'une session à l'autre (pas de middleware persist — voulu).
 *
 * Installation requise : npm install zustand
 */

import { create } from "zustand";
import type { RFQ } from "../types/rfq.types";
import type { ClientSummary } from "../types/client.types";

interface ForecastSelectionState {
  // ─── Sélection courante ───────────────────────────────────────────────
  selectedClient: ClientSummary | null;
  selectedYear: number | null;
  selectedRFQ: RFQ | null;

  // ─── Actions ──────────────────────────────────────────────────────────
  setClient: (client: ClientSummary | null) => void;
  setYear: (year: number | null) => void;
  setRFQ: (rfq: RFQ | null) => void;
  reset: () => void;
}

export const useForecastSelection = create<ForecastSelectionState>((set) => ({
  selectedClient: null,
  selectedYear: null,
  selectedRFQ: null,

  setClient: (client) => set({ selectedClient: client }),

  // Changer d'année invalide le RFQ sélectionné (il appartient à une année)
  setYear: (year) =>
    set((state) => ({
      selectedYear: year,
      selectedRFQ: state.selectedRFQ?.year === year ? state.selectedRFQ : null,
    })),

  setRFQ: (rfq) =>
    set({
      selectedRFQ: rfq,
      // Sélectionner un RFQ aligne automatiquement l'année
      ...(rfq ? { selectedYear: rfq.year } : {}),
    }),

  reset: () =>
    set({ selectedClient: null, selectedYear: null, selectedRFQ: null }),
}));

// ─── Sélecteurs dérivés (pratiques pour les pages de saisie) ─────────────────

/** ID du document data_entries courant : {cl_id}_{year}_{type}, ou null si incomplet. */
export function useCurrentDataEntryId(): string | null {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  if (!selectedClient || !selectedYear || !selectedRFQ) return null;
  return `${selectedClient.cl_id}_${selectedYear}_${selectedRFQ.type}`;
}

/** Le RFQ sélectionné est-il verrouillé ? (false si aucun RFQ sélectionné) */
export function useIsSelectedRFQLocked(): boolean {
  const rfq = useForecastSelection((s) => s.selectedRFQ);
  return rfq?.status === "LOCKED";
}