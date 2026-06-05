// lib/format/money.ts

/**
 * Money formatting / parsing — shared by the grid cells, the selection hook
 * (clipboard paste) and the spread tool. Values are stored as numbers; the
 * grid rounds to whole dollars on display but keeps full precision in state.
 */

/** 12500.5 → "12 501" (rounded to the unit). 0 renders as an em dash. */
export function formatMoney(value: number): string {
  if (value === 0) return "—";
  return Math.round(value).toLocaleString("en-CA");
}

/** Signed display for variance badges: 2500 → "+2 500", -2500 → "−2 500". */
export function formatSigned(value: number): string {
  const formatted = Math.round(Math.abs(value)).toLocaleString("en-CA");
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

/**
 * "12,500.50" / "12 500,5" / "$12500" → 12500.5 ; invalid → 0.
 * Tolerates both "," and "." as separators (keeps the last one as decimal),
 * so values pasted from Excel in either locale parse correctly.
 */
export function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,\-]/g, "").replace(/,/g, ".");
  // Keep only the last "." as the decimal separator.
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastDot === -1
      ? cleaned
      : cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? 0 : num;
}
