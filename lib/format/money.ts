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
 * Parse a typed / pasted money string to a number ; invalid → 0.
 *
 *   "29,465"      → 29465     (thousands comma — NOT a decimal)
 *   "50,000"      → 50000
 *   "1,234,567"   → 1234567
 *   "12,500.50"   → 12500.5   (US: comma groups, dot decimal)
 *   "12.500,50"   → 12500.5   (EU paste: dot groups, comma decimal)
 *   "12.50"       → 12.5
 *   "-5,000"      → -5000
 *
 * Rules: if both "," and "." appear, the right-most one is the decimal and the
 * other is a thousands separator. If only one kind of separator appears, it is
 * treated as a decimal ONLY when it occurs once with 1–2 trailing digits (e.g.
 * "12,50"); a single separator with exactly 3 trailing digits ("29,465") and
 * any repeated separator ("1,234,567") are thousands grouping. This means a
 * bare comma is read as a thousands separator, not a decimal — the behaviour
 * North-American users expect when entering whole-dollar figures.
 */
export function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,\-]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;

  const negative = cleaned.trimStart().startsWith("-");
  const body = cleaned.replace(/-/g, "");

  const hasComma = body.includes(",");
  const hasDot = body.includes(".");

  // Decide which character (if any) is the decimal separator.
  let decimalSep: "," | "." | null = null;
  if (hasComma && hasDot) {
    // Both present → the right-most separator is the decimal point.
    decimalSep = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
  } else if (hasComma || hasDot) {
    // Only one kind of separator. It is a decimal only when it appears once
    // and does not look like a thousands group (a group has exactly 3 digits
    // after it); everything else is grouping.
    const sep: "," | "." = hasComma ? "," : ".";
    const parts = body.split(sep);
    if (parts.length === 2 && parts[1].length !== 3) decimalSep = sep;
  }

  // Rebuild as a plain number string: strip every separator except the chosen
  // decimal point, which becomes ".".
  let normalized: string;
  if (decimalSep === null) {
    normalized = body.replace(/[.,]/g, "");
  } else {
    const idx = body.lastIndexOf(decimalSep);
    const intPart = body.slice(0, idx).replace(/[.,]/g, "");
    const fracPart = body.slice(idx + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${fracPart}`;
  }

  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return 0;
  return negative ? -num : num;
}
