// lib/types/data-entry.types.ts

import type { RFQWindow, FiscalYear, EntryStatus } from "./common.types";
import type { MediaData } from "./media.types";
import type { RevenueData } from "./revenue.types";
import type { LabsData } from "./labs.types";

// Primary Firestore document — ID format: {cl_id}_{year}_{rfq} e.g. CL_001_2026_RFQ0
export interface DataEntry {
  documentId: string;           // e.g. "CL_001_2026_RFQ0"
  clientId: string;             // Reference to clients collection
  year: FiscalYear;
  rfq: RFQWindow;
  status: EntryStatus;
  media: MediaData;
  revenue: RevenueData;
  labs: LabsData;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;           // User UID
  lastModifiedBy?: string;      // User UID
}

// Builds the Firestore document ID from its parts
export function buildDataEntryId(
  clientId: string,
  year: FiscalYear,
  rfq: RFQWindow
): string {
  return `${clientId}_${year}_${rfq}`;
}

// Lightweight snapshot used for comparison views (previous RFQ overlay)
export interface DataEntrySnapshot {
  documentId: string;
  rfq: RFQWindow;
  year: FiscalYear;
  status: EntryStatus;
}

// Used when initializing a new RFQ entry (e.g. rolling RFQ0 → RFQ1)
export interface DataEntryInit {
  clientId: string;
  year: FiscalYear;
  rfq: RFQWindow;
}

// Cell coordinate used by useForecasterGrid and dirty-state tracking
export interface CellCoord {
  axis: "media" | "revenue" | "labs";
  rowId: string;                // projectId, stream name, or allocationId
  month: number;
}

// Dirty state map — tracks unsaved changes before Firestore commit
export type DirtyState = Map<string, number>; // key: "axis:rowId:month"

export function buildDirtyKey(coord: CellCoord): string {
  return `${coord.axis}:${coord.rowId}:${coord.month}`;
}