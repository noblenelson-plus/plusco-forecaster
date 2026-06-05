// components/dashboard/charts/format.ts

/**
 * Compact formatters for dashboard headline figures — the grid uses full
 * `formatMoney`, but KPI cards and chart centers need short labels ($1.2M).
 */

/** 1_240_000 → "$1.2M", 12_400 → "$12K", 0 → "$0". */
export function formatCompactMoney(value: number): string {
  const n = Math.round(value);
  if (n === 0) return "$0";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  }
  return `${sign}$${abs.toLocaleString("en-CA")}`;
}

/** 0.253 → "25%". null / non-finite → "—". */
export function formatPct(value: number | null, digits = 0): string {
  if (value === null || !isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
