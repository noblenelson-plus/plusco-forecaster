// components/forecaster/sections/meta-format.ts

/**
 * Shared formatting + math helpers for the Meta (Executive KPIs) sections.
 *
 * These were previously copy-pasted into every meta-*.tsx file with subtle
 * variations. This module is the single source of truth so the Meta page reads
 * and totals identically everywhere. Output strings are byte-for-byte the same
 * as the previous per-file helpers — nothing about the displayed numbers changes.
 *
 * Note the two distinct signed-money styles, kept separate on purpose:
 *   • moneySigned → sign BEFORE the symbol:  "-$1,234"  (used by the by-client,
 *     GM-Pod, pacing-YoY and partner tables)
 *   • moneyVar    → Looker style, sign AFTER the symbol: "$-1,234"  (used by the
 *     Meta Pacing vs Divestment Target tables)
 */

import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

/** Coerce anything to a finite number, defaulting to 0. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce anything to a display string; blank/nullish becomes an em dash. */
export function str(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/** Whole dollars, CA grouping, no sign styling: "$1,234" / "$0". */
export function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** Signed dollars, sign before the symbol: "-$1,234" / "$1,234" / "$0". */
export function moneySigned(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
}

/** Signed dollars, Looker style with the sign inside: "$-1,234" / "$1,234" / "$0". */
export function moneyVar(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "$0";
  return `$${r < 0 ? "-" : ""}${Math.abs(r).toLocaleString("en-CA")}`;
}

/** A ratio (0–1) as a percent, or an em dash for null: "42%" / "—". */
export function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** A ratio as a signed percent, or an em dash for null: "+5%" / "-3%" / "—". */
export function pctSigned(v: number | null, digits = 0): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

/** A ratio delta as signed percentage points, or an em dash: "+1.2pt" / "—". */
export function ppt(v: number | null, digits = 1): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}

/** Divide, returning null (not NaN/Infinity) when the denominator is 0. */
export function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}

/** Read a column that may not be in the typed row (flags, status, scenario). */
export function opt(r: KpiByClientRow, key: string): string {
  return str((r as Record<string, unknown>)[key]);
}

/** metaShare(2026) − metaShare(2025), null-safe. */
export function shareVar(
  m26: number,
  s26: number,
  m25: number,
  s25: number
): number | null {
  const a = safeDiv(m26, s26);
  const b = safeDiv(m25, s25);
  return a !== null && b !== null ? a - b : null;
}
