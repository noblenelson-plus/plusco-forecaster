// filepath: components/forecaster/sections/exec-rag.ts
"use client";

/**
 * RAG (red / amber / green) status for target-vs-goal metrics on the Executive
 * Summary. One source of truth so every KPI tile, progress bar and by-GM matrix
 * cell bands a metric identically.
 *
 * Bands are expressed as a fraction of target (actual / target):
 *   >= green  -> on/above goal          (green)
 *   >= amber  -> close, watch           (amber)
 *   <  amber  -> off goal               (red)
 *
 * Defaults are 90% / 75% (DEFAULT_BANDS), but every function takes an optional
 * `bands` override so the thresholds can be retuned in one place (or per page)
 * without touching any component. Exec KPI → Media & Labs KPIs uses
 * `execKpiBands`: Labs Pacing's thresholds for a month period, green-only for
 * the full year. Metrics where a LOWER number is better (e.g. Meta share vs a
 * divestment target) pass `lowerIsBetter` and the ratio is inverted so the same
 * bands still read "green = doing well".
 */

export type RagStatus = "green" | "amber" | "red" | "neutral";

export interface RagBands {
  /** Ratio (actual/target) at or above which the metric is green. */
  green: number;
  /** Ratio at or above which the metric is amber; below it is red. */
  amber: number;
  /**
   * Green-only: below `green` is "neutral" (no colour) instead of amber / red.
   * Used for the full-year view, where an unfinished year isn't a miss.
   */
  greenOnly?: boolean;
}

// Lenient by design: near-target reads green, not red. green >=90% of goal,
// amber >=75%, red below. (Loosened per Adriana 2026-09.) Still used by the
// Media Investments KPI pages; Media & Labs KPIs uses execKpiBands below.
export const DEFAULT_BANDS: RagBands = { green: 0.9, amber: 0.75 };

/**
 * Labs Pacing's thresholds (`pacingHeat` in labs-pacing-data.ts): green at or
 * above 100% of goal, yellow 80–99%, red below 80%.
 */
export const PACING_BANDS: RagBands = { green: 1, amber: 0.8 };

/** Full-year view: green once the goal is hit, no colour otherwise. */
export const FULL_YEAR_BANDS: RagBands = { green: 1, amber: 1, greenOnly: true };

/**
 * Exec KPI → Media & Labs KPIs (Adriana, 2026-11): a month period (YTD) is
 * coloured like Labs Pacing; the full year only shows green once the goal is hit.
 */
export function execKpiBands(fullYear: boolean): RagBands {
  return fullYear ? FULL_YEAR_BANDS : PACING_BANDS;
}

/** Status of a ratio (1 == 100% of goal) against `bands`. */
function bandFor(ratio: number, bands: RagBands): RagStatus {
  if (ratio >= bands.green) return "green";
  if (bands.greenOnly) return "neutral";
  if (ratio >= bands.amber) return "amber";
  return "red";
}

export interface RagOptions {
  /** Invert for "lower is better" metrics (compares target/actual instead). */
  lowerIsBetter?: boolean;
  /** Threshold override; falls back to DEFAULT_BANDS. */
  bands?: RagBands;
}

/**
 * Status from a raw actual + target pair. Returns "neutral" when either side is
 * missing or the target is zero (nothing meaningful to compare against).
 */
export function ragStatus(
  actual: number | null | undefined,
  target: number | null | undefined,
  opts: RagOptions = {}
): RagStatus {
  if (actual == null || target == null || target === 0) return "neutral";
  const bands = opts.bands ?? DEFAULT_BANDS;
  const ratio = opts.lowerIsBetter ? target / actual : actual / target;
  if (!Number.isFinite(ratio)) return ratio > 0 ? "green" : "neutral";
  return bandFor(ratio, bands);
}

/**
 * Status directly from an already-computed "% of target" (actual/target, where
 * 1 == 100%). Use this when the ratio is already on hand (e.g. inv.meta.pctOfTarget).
 */
export function ragFromPctOfTarget(
  pctOfTarget: number | null | undefined,
  opts: Omit<RagOptions, "lowerIsBetter"> = {}
): RagStatus {
  if (pctOfTarget == null || !Number.isFinite(pctOfTarget)) return "neutral";
  return bandFor(pctOfTarget, opts.bands ?? DEFAULT_BANDS);
}

/** Progress-bar width (0%..100%, clamped) from a % of target. */
export function targetBarWidth(pctOfTarget: number | null | undefined): string {
  if (pctOfTarget == null || !Number.isFinite(pctOfTarget)) return "0%";
  const clamped = Math.max(0, Math.min(1, pctOfTarget));
  return `${(clamped * 100).toFixed(0)}%`;
}

// --- Tailwind class maps ------------------------------------------------------
// Raw palette colors (emerald/amber/red) are used deliberately: RAG needs a
// fixed traffic-light meaning independent of the theme's semantic tokens, and
// the rest of the app already uses raw color classes for status accents/pills.

const TEXT: Record<RagStatus, string> = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  neutral: "text-muted-foreground",
};

const DOT: Record<RagStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

const BAR: Record<RagStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

// Subtle tinted background + readable text for table cells / chips.
const CELL: Record<RagStatus, string> = {
  green: "bg-emerald-500/10 text-emerald-700",
  amber: "bg-amber-500/10 text-amber-700",
  red: "bg-red-500/10 text-red-700",
  neutral: "text-foreground",
};

/** Foreground color for a status (value text, icons). */
export const ragText = (s: RagStatus): string => TEXT[s];
/** Small status dot / legend swatch background. */
export const ragDot = (s: RagStatus): string => DOT[s];
/** Progress-bar fill color. */
export const ragBar = (s: RagStatus): string => BAR[s];
/** Tinted cell background + text, for matrix cells and chips. */
export const ragCell = (s: RagStatus): string => CELL[s];

/** Human label, e.g. for tooltips / legends. */
export function ragLabel(s: RagStatus): string {
  if (s === "green") return "On or above goal";
  if (s === "amber") return "Approaching goal";
  if (s === "red") return "Below goal";
  return "No target";
}
