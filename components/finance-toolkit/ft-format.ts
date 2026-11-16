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

/** Builds a CSV (RFC 4180) and triggers a browser download. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  // BOM so Excel opens accented client names correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
