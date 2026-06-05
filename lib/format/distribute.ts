// lib/format/distribute.ts

/**
 * Splits `total` across `weights`, rounded to cents, with the rounding
 * remainder absorbed by the last entry so the parts sum back exactly to
 * `total`. When every weight is 0 it falls back to equal parts.
 *
 * `total` may be negative (e.g. distributing a shortfall the other way) —
 * the proportions and remainder handling work identically.
 *
 * Shared by the spread tool (one row across months) and the comparison
 * panel's "distribute difference" tool (one media type across projects/months).
 */
export function distribute(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (sumW > 0 ? (total * w) / sumW : total / n));
  const rounded = raw.map((v) => Math.round(v * 100) / 100);
  const diff =
    Math.round((total - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  rounded[n - 1] = Math.round((rounded[n - 1] + diff) * 100) / 100;
  return rounded;
}
