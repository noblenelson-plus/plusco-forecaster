// lib/dashboard/data/kpi-months.ts

/**
 * Month filter for the Mediaocean KPI rows (`mo_kpi_by_client`). Each row's
 * `monthly_kpis` (BigQuery KPI_BY_CLIENT_2025_vs_2026, see the SQL's header) is
 * a JSON array of per year × month figures computed with exactly the annual
 * columns' rules; summing the chosen months rebuilds the row's spend columns
 * (2026, and 2025 over the same months for the YoY comparisons), the Labs
 * target / booked (RFQ3, from labs_pacing_wide) and the Labs-by-partner split.
 *
 * Not monthly — kept from the annual row: the Meta target and the Social /
 * MIQ-Social forecasts (annual goals), Billups eligibility and the client
 * attributes. Billups OOH / Print are zeroed for ineligible clients exactly
 * like the annual columns, and the Meta Share Trend is recomputed with the
 * SQL's rule over the chosen months.
 *
 * A row without `monthly_kpis` (synced before the column existed) is returned
 * unchanged — the caller says the figures are full-year. Pure, Firebase-free.
 */

import type { KpiByClientRow } from "./use-mo-kpi-by-client";

/** Labs partner keys of the per-partner target / booked columns. */
export const LABS_PARTNER_KEYS = [
  "billups",
  "miq",
  "amazon",
  "yahoo",
  "quantcast",
  "reddit",
  "aim",
  "stackadapt",
] as const;
type PartnerKey = (typeof LABS_PARTNER_KEYS)[number];

/** One month of a client's figures, as stored in `monthly_kpis`. */
interface MonthlyEntry {
  y: number;
  m: number;
  total?: number;
  labs?: number;
  digital?: number;
  dd?: number;
  dd_deal?: number;
  dd_nondeal?: number;
  prog?: number;
  prog_labs?: number;
  prog_deal?: number;
  prog_nondeal?: number;
  social?: number;
  meta?: number;
  miq_social?: number;
  ooh?: number;
  billups_ooh?: number;
  print?: number;
  billups_print?: number;
  /** Labs spend by configured partner family (upper case). */
  lp?: { p: string; v: number }[] | null;
  /** 2026 only: Labs target (RFQ3 forecast) / booked per partner. */
  lt?: Partial<Record<PartnerKey, number>> | null;
  lb?: Partial<Record<PartnerKey, number>> | null;
}

/** Spend fields summed per year, and the row column each feeds. */
const SPEND_FIELDS = {
  total: "total_spend",
  labs: "labs_spend",
  digital: "digital_spend",
  dd: "digital_direct_spend",
  dd_deal: "dd_deal_spend",
  dd_nondeal: "dd_nondeal_spend",
  prog: "prog_spend",
  prog_labs: "prog_labs_spend",
  prog_deal: "prog_deal_spend",
  prog_nondeal: "prog_nondeal_spend",
  social: "social_spend",
  meta: "meta_spend",
  miq_social: "miq_social_spend",
  ooh: "ooh_spend",
  billups_ooh: "billups_ooh_spend",
  print: "print_spend",
  billups_print: "billups_print_spend",
} as const;
type SpendField = keyof typeof SPEND_FIELDS;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Billups eligibility as the SQL reads it: anything but "Yes" (default Yes) gates. */
const eligible = (v: unknown) => (v ?? "Yes").toString().trim() === "Yes";

/** True when `months` means "the whole year" (empty or all 12). */
export function isFullYear(months: readonly number[]): boolean {
  return months.length === 0 || new Set(months.filter((m) => m >= 1 && m <= 12)).size === 12;
}

/** The parsed `monthly_kpis` entries of a row, or null when absent / malformed. */
function monthlyEntries(row: KpiByClientRow): MonthlyEntry[] | null {
  const raw = row.monthly_kpis;
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MonthlyEntry[]) : null;
  } catch {
    return null;
  }
}

/** Whether a row carries the monthly breakdown (synced after it was added). */
export function hasMonthlyKpis(row: KpiByClientRow): boolean {
  return monthlyEntries(row) !== null;
}

/** The SQL's meta_share_trend, over the chosen months. */
function metaShareTrend(
  name: string,
  meta25: number,
  meta26: number,
  social25: number,
  social26: number
): string | null {
  if (name.trim().toUpperCase() === "BRP") return null;
  if (meta26 === 0) return "Divested Meta Share";
  if (meta25 === 0) return "Increasing Meta Share";
  if (social26 === 0 || social25 === 0) return "Flat Meta Share";
  const delta = meta26 / social26 - meta25 / social25;
  if (delta <= -0.01) return "Divested Meta Share";
  if (delta >= 0.01) return "Increasing Meta Share";
  return "Flat Meta Share";
}

/** One row rebuilt over `months` (1–12) of 2026, and the same months of 2025. */
function rowForMonths(row: KpiByClientRow, entries: MonthlyEntry[], months: Set<number>): KpiByClientRow {
  const sums: Record<"2025" | "2026", Record<SpendField, number>> = {
    "2025": Object.fromEntries(Object.keys(SPEND_FIELDS).map((k) => [k, 0])) as Record<SpendField, number>,
    "2026": Object.fromEntries(Object.keys(SPEND_FIELDS).map((k) => [k, 0])) as Record<SpendField, number>,
  };
  const target = Object.fromEntries(LABS_PARTNER_KEYS.map((k) => [k, 0])) as Record<PartnerKey, number>;
  const booked = Object.fromEntries(LABS_PARTNER_KEYS.map((k) => [k, 0])) as Record<PartnerKey, number>;
  const labsByPartner = new Map<string, number>();

  for (const e of entries) {
    if (!months.has(num(e.m))) continue;
    const y = num(e.y) === 2026 ? "2026" : num(e.y) === 2025 ? "2025" : null;
    if (!y) continue;
    for (const f of Object.keys(SPEND_FIELDS) as SpendField[]) sums[y][f] += num(e[f]);
    if (y === "2026") {
      for (const k of LABS_PARTNER_KEYS) {
        target[k] += num(e.lt?.[k]);
        booked[k] += num(e.lb?.[k]);
      }
      for (const { p, v } of e.lp ?? []) {
        labsByPartner.set(p, (labsByPartner.get(p) ?? 0) + num(v));
      }
    }
  }

  const s26 = sums["2026"];
  const s25 = sums["2025"];
  // Billups OOH / Print are zeroed for ineligible clients, like the annual columns.
  if (!eligible(row.eligible_billups_ooh)) s26.ooh = s26.billups_ooh = 0;
  if (!eligible(row.eligible_billups_print)) s26.print = s26.billups_print = 0;

  const out: KpiByClientRow = { ...row };
  for (const f of Object.keys(SPEND_FIELDS) as SpendField[]) {
    out[`${SPEND_FIELDS[f]}_2026`] = round2(s26[f]);
    out[`${SPEND_FIELDS[f]}_2025`] = round2(s25[f]);
  }
  out.other_platforms_spend_2026 = round2(s26.social - s26.meta);
  out.other_platforms_spend_2025 = round2(s25.social - s25.meta);

  for (const k of LABS_PARTNER_KEYS) {
    out[`labs_target_${k}_2026`] = round2(target[k]);
    out[`labs_booked_${k}_2026`] = round2(booked[k]);
  }
  out.labs_target_rfq2_2026 = round2(LABS_PARTNER_KEYS.reduce((a, k) => a + target[k], 0));
  out.labs_booked_mir_2026 = round2(LABS_PARTNER_KEYS.reduce((a, k) => a + booked[k], 0));

  const parts = [...labsByPartner]
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([p, v]) => ({ p, v: round2(v) }));
  out.labs_by_partner_2026 = parts.length ? JSON.stringify(parts) : null;

  out.meta_share_trend = metaShareTrend(
    String(row.CLIENT_NAME ?? ""),
    s25.meta,
    s26.meta,
    s25.social,
    s26.social
  );
  return out;
}

/**
 * The KPI rows over the chosen months (1–12). The whole year (or no months)
 * returns the rows untouched; rows without `monthly_kpis` stay full-year.
 */
export function kpiRowsForMonths(rows: KpiByClientRow[], months: readonly number[]): KpiByClientRow[] {
  if (isFullYear(months)) return rows;
  const picked = new Set(months);
  return rows.map((row) => {
    const entries = monthlyEntries(row);
    return entries ? rowForMonths(row, entries, picked) : row;
  });
}
