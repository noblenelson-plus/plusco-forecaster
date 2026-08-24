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
 * Defaults are 100% / 90%, but every function takes an optional `bands` override
 * so the thresholds can be retuned in one place (or per metric) without touching
 * any component. Metrics where a LOWER number is better (e.g. Meta share vs a
 * divestment target) pass `lowerIsBetter` and the ratio is inverted so the same
 * bands still read "green = doing well".
 */

export type RagStatus = "green" | "amber" | "red" | "neutral";

export interface RagBands {
  /** Ratio (actual/target) at or above which the metric is green. */
  green: number;
  /** Ratio at or above which the metric is amber; below it is red. */
  amber: number;
}

/** Plusco default bands: 100% green, 90-99% amber, <90% red. */
export const DEFAULT_BANDS: RagBands = { green: 1, amber: 0.9 };

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
  if (ratio >= bands.green) return "green";
  if (ratio >= bands.amber) return "amber";
  return "red";
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
  const bands = opts.bands ?? DEFAULT_BANDS;
  if (pctOfTarget >= bands.green) return "green";
  if (pctOfTarget >= bands.amber) return "amber";
  return "red";
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
