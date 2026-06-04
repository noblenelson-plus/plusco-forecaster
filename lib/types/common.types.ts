// lib/types/common.types.ts

// 12-month key-value map — keys are month numbers (1–12)
export type MonthlyMap = {
  [month: number]: number;
};

export type RFQWindow = "RFQ0" | "RFQ1" | "RFQ2" | "RFQ3";
export type EntryStatus = "OPEN" | "LOCKED";
export type FiscalYear = number; // e.g. 2026

export type MediaType =
  | "social"
  | "programmatic"
  | "ooh"
  | "print"
  | "tv"
  | "radio"
  | "sem"
  | "digitalDirect";

export const MEDIA_TYPES: MediaType[] = [
  "social",
  "programmatic",
  "ooh",
  "print",
  "tv",
  "radio",
  "sem",
  "digitalDirect",
];

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type Month = (typeof MONTHS)[number];

export const RFQ_WINDOWS: RFQWindow[] = ["RFQ0", "RFQ1", "RFQ2", "RFQ3"];

// Builds an empty 12-month map initialized to 0
export function emptyMonthlyMap(): MonthlyMap {
  return Object.fromEntries(MONTHS.map((m) => [m, 0]));
}

// Sums all values in a MonthlyMap
export function sumMonthlyMap(map: MonthlyMap): number {
  return Object.values(map).reduce((acc, val) => acc + val, 0);
}

// Returns the next RFQ window, or null if RFQ3 (triggers year rollover)
export function nextRFQ(current: RFQWindow): RFQWindow | null {
  const index = RFQ_WINDOWS.indexOf(current);
  return index < RFQ_WINDOWS.length - 1 ? RFQ_WINDOWS[index + 1] : null;
}