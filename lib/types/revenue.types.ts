// lib/types/revenue.types.ts

import type { MonthlyMap } from "./common.types";

// The 4 revenue streams tracked per client per RFQ
export interface RevenueStreams {
  retainer: MonthlyMap;
  commission: MonthlyMap;       // Auto-calculated — read-only for BLs
  projectFees: MonthlyMap;
  productFees: MonthlyMap;
}

// GAIA adjustment layer — Admin/Finance only
export interface GaiaAdjustment {
  months: MonthlyMap;
  notes?: string;
}

// All revenue data for a given DataEntry document
export interface RevenueData {
  retainer: MonthlyMap;
  commission: MonthlyMap;       // Derived: media spend × commission %
  projectFees: MonthlyMap;
  productFees: MonthlyMap;
  gaiaAdjustment: GaiaAdjustment;
  actuals: MonthlyMap;          // True revenue injected by Finance — read-only
}

// Variance between two RFQ snapshots — computed client-side
export interface RevenueVariance {
  absolute: MonthlyMap;         // current - previous
  relative: MonthlyMap;         // (current - previous) / previous * 100
}

// Zustand slice shape for reactive commission tracking
export interface CommissionState {
  rates: { [mediaType: string]: number };
  computed: MonthlyMap;
  setRates: (rates: CommissionState["rates"]) => void;
  recompute: (mediaMonthlyTotals: MonthlyMap) => void;
}