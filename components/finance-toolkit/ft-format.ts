// filepath: components/finance-toolkit/ft-format.ts

/**
 * Finance Toolkit formatters + CSV download. Money is whole dollars in the
 * scope's currency (the toolkit never mixes CAD and USD); compact money for
 * KPI tiles reuses the dashboard's formatter.
 */

import { formatCompactMoney } from "../dashboard/charts/format";

export { formatCompactMoney };

/** 1234567.8 → "$1,234,568"; null → "—". */
export function money(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-CA")}`;
}

/** $ per hour with no decimals: 45.4 → "$45". */
export function rate(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.553 → "55.3%"; null → "—". */
export function pct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

/** 12345.67 → "12,346". */
export function hours(v: number): string {
  return Math.round(v).toLocaleString("en-CA");
}

/** 3.456 → "3.5". */
export function fte(v: number): string {
  return v.toFixed(1);
}

/**
 * Header + rows as a Google Sheets matrix (exports go to shared Sheets, not
 * downloaded CSVs). Numbers rounded to 2 decimals, empty for null.
 */
export function sheetMatrix(header: string[], rows: (string | number | null)[][]): (string | number)[][] {
  const cell = (v: string | number | null) =>
    v === null ? "" : typeof v === "number" ? Math.round(v * 100) / 100 : v;
  return [header, ...rows].map((r) => r.map(cell));
}
