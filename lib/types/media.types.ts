// lib/types/media.types.ts

import type { MediaType, MonthlyMap } from "./common.types";

export type DistributionMode = "DIRECT" | "TOP_DOWN" | "EQUAL";

// A single media project row inside the Media axis
export interface MediaProject {
  projectId: string;
  projectName: string;
  mediaType: MediaType;
  distributionMode: DistributionMode;
  months: MonthlyMap;           // User-entered forecasted spend per month
}

// Top-down smoothing config: lump-sum + monthly weight percentages
export interface TopDownConfig {
  totalAmount: number;
  weights: MonthlyMap;          // Must sum to 100
}

// Equal distribution config: fixed channel weights spread evenly
export interface EqualDistributionConfig {
  totalAmount: number;
  activeMonths: number[];       // Subset of months to distribute across
}

// All media data for a given DataEntry document
export interface MediaData {
  projects: MediaProject[];
  actuals: MonthlyMap;          // Injected by admins — read-only for BLs
}

// Aggregated media spend per type across all projects — computed client-side
export type MediaTotalsByType = {
  [key in MediaType]?: MonthlyMap;
};

// Used in context action menu operations
export type CellAction =
  | { type: "CLONE_FROM_PREVIOUS_RFQ" }
  | { type: "SMOOTH_DISTRIBUTION"; remainingMonths: number[] }
  | { type: "TARGET_DUMP"; targetMonth: number };