// lib/format/tier.ts

/**
 * Tier computation from the digital media spend forecast.
 *
 * The client tier is NOT hand-picked: it derives from the total digital spend
 * (Digital Direct + Programmatic + SEM + Social) of one media-axis submission,
 * compared in CAD against fixed thresholds:
 *
 *   PARTNER   < $500k
 *   GROW      $500k – $5M
 *   FULL      ≥ $5M
 *
 * Admins pick which submission (year + RFQ) is the reference — typically the
 * last completed RFQ — from the "Recompute tiers" action on the Clients page.
 * The tier field is read-only everywhere else.
 */

import type { ClientTier } from "../constants/client.constants";
import type { MediaType } from "../types/common.types";
import { MONTHS } from "../types/common.types";
import type { AxisData } from "../types/forecaster.types";

/** Media types counted as "digital" for tier purposes. */
export const DIGITAL_MEDIA_TYPES: MediaType[] = [
  "digitalDirect",
  "programmatic",
  "sem",
  "social",
];

/** Thresholds in CAD. Lower bounds are inclusive ($500k exactly → GROW). */
export const TIER_GROW_MIN = 500_000;
export const TIER_FULL_MIN = 5_000_000;

export function computeTierFromDigitalSpend(totalCad: number): ClientTier {
  if (totalCad >= TIER_FULL_MIN) return "FULL";
  if (totalCad >= TIER_GROW_MIN) return "GROW";
  return "PARTNER";
}

/**
 * Total digital spend of a media-axis submission: BL forecast rows (not
 * actuals) whose media type is digital, summed over the 12 months. An empty
 * or missing submission naturally yields 0 → PARTNER.
 */
export function sumDigitalSpend(axis: AxisData): number {
  const digital = new Set<string>(DIGITAL_MEDIA_TYPES);
  let total = 0;
  for (const bucket of axis.buckets) {
    for (const row of bucket.rows) {
      if (!digital.has(row.rowType)) continue;
      for (const m of MONTHS) total += row.months[m] ?? 0;
    }
  }
  return total;
}
