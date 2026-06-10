// lib/types/currency.types.ts

// Yearly USD → CAD conversion rate, managed by Admins.
// One document per year in the `currency_rates` collection
// (document id is the year as a string, e.g. "2026").
// `usdToCad` is how many CAD one USD is worth (e.g. 1.37).
export interface CurrencyRate {
  year: number;
  usdToCad: number;
  updatedAt: string; // ISO timestamp of the last write
}
