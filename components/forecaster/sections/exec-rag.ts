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
 * One rule everywhere (Noble, 2026-11-05): green at 90% of goal or more (the
 * Looker Labs Pacing "Target Achieved" line), yellow 70–89%, red below 70%
 * (DEFAULT_BANDS). The Labs Pacing flag colours and GM Pod heatmap use the same
 * lines. One exception (Adriana): the Exec KPI → Media & Labs KPIs tables in
 * the full-year view only colour green (FULL_YEAR_BANDS, via execKpiBands) —
 * an unfinished year isn't a miss. Metrics where a
 * LOWER number is better (e.g. Meta share vs a divestment target) pass
 * `lowerIsBetter` and the ratio is inverted so the same bands still read
 * "green = doing well".
 */

export type RagStatus = "green" | "amber" | "red" | "neutral";

export interface RagBands {
  /** Ratio (actual/target) at or above which the metric is green. */
  green: number;
  /** Ratio at or above which the metric is amber; below it is red. */
  amber: number;
  /** Green-only: below `green` is "neutral" (no colour) instead of amber / red. */
  greenOnly?: boolean;
}

/**
 * "Target achieved": 90% of goal (Looker Labs Pacing flag) — green from here.
 * The single green line for every pacing / goal colour in the dashboard.
 */
export const ACHIEVED_RATIO = 0.9;
/** "Watch": 70% of goal — yellow from here up to ACHIEVED_RATIO, red below. */
export const WATCH_RATIO = 0.7;
/** The same lines as percentages (for % values on a 0–100 scale). */
export const ACHIEVED_PCT = ACHIEVED_RATIO * 100;
export const WATCH_PCT = WATCH_RATIO * 100;

/** Green at 90% of goal or more, yellow 70–89%, red below 70%. */
export const DEFAULT_BANDS: RagBands = { green: ACHIEVED_RATIO, amber: WATCH_RATIO };

/** Full-year view of the Media & Labs KPIs tables: green at 90%+, no colour otherwise. */
export const FULL_YEAR_BANDS: RagBands = { ...DEFAULT_BANDS, greenOnly: true };

/**
 * Exec KPI → Media & Labs KPIs tables (Adriana): the full year only shows green;
 * fewer months use the default green / yellow / red.
 */
export function execKpiBands(fullYear: boolean): RagBands {
  return fullYear ? FULL_YEAR_BANDS : DEFAULT_BANDS;
}

/**
 * A % shown next to a colour: rounded, except never rounded UP across a colour
 * line (70%, 90%) or 100% (99.95% booked reads "99%", not "100%" while behind).
 */
export function pctNoRoundUp(pct: number): number {
  const r = Math.round(pct);
  const crosses = [WATCH_PCT, ACHIEVED_PCT, 100].some((line) => pct < line && r >= line);
  return crosses ? Math.floor(pct) : r;
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

// Table cells: coloured text only, no cell fill (Noble, 2026-11-05). The -600
// shades read as green / gold-yellow / red; -700 yellow looked brown.
const CELL: Record<RagStatus, string> = {
  green: "font-semibold text-emerald-600",
  amber: "font-semibold text-amber-600",
  red: "font-semibold text-red-600",
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
