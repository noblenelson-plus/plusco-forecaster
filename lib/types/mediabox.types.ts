// lib/types/mediabox.types.ts

/**
 * Per-currency monthly map. Months are 1..12; values are raw amounts in each
 * buy currency (CAD / USD), exactly as aggregated by the MediaBox function —
 * no USD→CAD conversion is applied at rest, so the doc never goes stale when a
 * yearly rate changes. Conversion happens at read time (see
 * `mediaboxTotalsToCad`).
 */
export interface MediaboxCurrencySplit {
  CAD: number;
  USD: number;
}

export interface MediaboxLabsTotals extends MediaboxCurrencySplit {
  byMonth: Record<number, MediaboxCurrencySplit>;
}

/** One campaign's spend under a media type (per-currency, monthly). */
export interface MediaboxCampaignRow {
  name: string;
  total: MediaboxCurrencySplit;
  byMonth: Record<number, MediaboxCurrencySplit>;
}

/**
 * One breakdown group's spend, broken down by campaign. The `label` is the
 * media type for the media breakdown, or the LABS partner for the labs one.
 */
export interface MediaboxTypeRow {
  label: string;
  total: MediaboxCurrencySplit;
  byMonth: Record<number, MediaboxCurrencySplit>;
  campaigns: MediaboxCampaignRow[];
}

/**
 * One `mediabox_totals/{clId}_{year}` document — the small summary the
 * MediaBox aggregation pushes into the forecaster project. Read-only on the
 * forecaster side (only the MediaBox Admin SDK writes it).
 */
export interface MediaboxTotals {
  clientId: string;
  year: number;
  /** ISO timestamp of the last successful aggregation. */
  syncedAt?: string;
  /** True while an aggregation is mid-flight (concurrency guard). */
  refreshing?: boolean;
  refreshStartedAt?: string | null;
  /** MediaBox client document IDs that were summed for this client. */
  mediaboxClientIds: string[];
  /** Total media spend per buy currency. */
  mediaSpend: MediaboxCurrencySplit;
  /** Media spend per buy currency, split across months 1..12. */
  byMonth: Record<number, MediaboxCurrencySplit>;
  /** Media spend broken down by media type, each with its campaigns. */
  mediaByType?: MediaboxTypeRow[];
  /** LABS subset (TC_Publisher in the configured set), same shape. */
  labs: MediaboxLabsTotals;
  /** LABS spend broken down by LABS partner, each with its campaigns. */
  labsByPartner?: MediaboxTypeRow[];
  /** Buy currencies that were seen but left out of the totals (e.g. EUR). */
  ignoredCurrencies?: Record<string, number>;
  campaignsScanned?: number;
  tactiquesCounted?: number;
}
