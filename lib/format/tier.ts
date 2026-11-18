// lib/format/tier.ts

/**
 * Tier computation from the digital media spend forecast.
 *
 * A new client starts at the tier picked on creation — the "typical digital
 * media spend per year" answer of the New Client Request Form (default
 * PARTNER). From then on it derives from the total digital spend (Digital
 * Direct + Programmatic + SEM + Social) of one media-axis submission, compared
 * in CAD against the same thresholds as the form:
 *
 *   PARTNER   < $500k
 *   GROW      $500k – $5M
 *   FULL      ≥ $5M
 *
 * Admins pick which submission (year + RFQ) is the reference from the
 * "Recompute tiers" action on the Clients page. A client with no media
 * forecast in that submission (`hasMediaForecast` false) keeps its current
 * tier — so a client created as Grow / Full isn't knocked back to Partner
 * before its team has entered a forecast. The tier is editable only when a
 * client is created; read-only everywhere else.
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
 * True when the media-axis submission has any non-zero BL forecast value (any
 * media type). False for a missing or all-zero submission — no forecast yet.
 */
export function hasMediaForecast(axis: AxisData): boolean {
  for (const bucket of axis.buckets) {
    for (const row of bucket.rows) {
      for (const m of MONTHS) if ((row.months[m] ?? 0) !== 0) return true;
    }
  }
  return false;
}

/** Normalizes a tier typed in an import ("grow", " Full ") — undefined when unknown. */
export function parseTier(raw: unknown): ClientTier | undefined {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "FULL" || v === "GROW" || v === "PARTNER" ? v : undefined;
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
