// lib/types/labs.types.ts

import type { MediaType, MonthlyMap } from "./common.types";

export type LabsInputMode = "PERCENTAGE" | "DIRECT";

// Global LABS partner — created by Admins, shared across clients
export interface LabsPartner {
  partnerId: string;
  name: string;
  description?: string;
  mediaType: MediaType;
  year: number;
}

// A single LABS allocation row inside a client's DataEntry
export interface LabsAllocation {
  allocationId: string;
  partnerId: string;            // Reference to LabsPartner
  partnerName: string;          // Denormalized for display
  mediaType: MediaType;
  inputMode: LabsInputMode;
  inputValues: MonthlyMap;      // Raw user input ($ or %)
  resolvedMonths: MonthlyMap;   // Computed: actual $ spend after % resolution
}

// All LABS data for a given DataEntry document
export interface LabsData {
  allocations: LabsAllocation[];
  actuals: MonthlyMap;          // True partner spends injected by admins
}

// Validation result for LABS cap enforcement
// Sum of LABS spend per media type must not exceed total media budget for that type
export interface LabsValidationResult {
  isValid: boolean;
  violations: LabsCapViolation[];
}

export interface LabsCapViolation {
  mediaType: MediaType;
  month: number;
  labsTotal: number;
  mediaBudget: number;
  overage: number;
}

// Real-time penetration score per media type — displayed in UI
export type LabsPenetrationScores = {
  [key in MediaType]?: number;  // Percentage of media budget allocated to LABS
};