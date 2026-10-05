// lib/format/period.ts

/**
 * Plain-language notes for the period a table covers and its MIR vintage, e.g.
 * "Period: Jan–Aug 2026 · Target: Forecast RFQ3 · MIR as of Sep 28, 2026".
 * Shown under the Labs Pacing / Deal Pacing tables and written as the first
 * rows of their Google Sheets exports. Pure helpers (no Firebase).
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A month selection as a period: "Full year 2026" (nothing or all 12 picked),
 * "Jan–Aug 2026" (one run), or "Jan–Mar, May, Jul–Aug 2026" (several runs).
 */
export function describeMonthPeriod(months: readonly number[], year: number | null): string {
  const y = year != null ? ` ${year}` : "";
  const picked = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (picked.length === 0 || picked.length === 12) return `Full year${y}`;

  const runs: string[] = [];
  let start = picked[0];
  let prev = picked[0];
  for (const m of [...picked.slice(1), Infinity]) {
    if (m === prev + 1) {
      prev = m;
      continue;
    }
    runs.push(start === prev ? MONTHS[start - 1] : `${MONTHS[start - 1]}–${MONTHS[prev - 1]}`);
    start = prev = m;
  }
  return `${runs.join(", ")}${y}`;
}

/** "MIR as of Sep 28, 2026" (falls back to "latest sync" when the date is unknown). */
export function mirAsOf(label: string | null | undefined): string {
  return `MIR as of ${label ?? "latest sync"}`;
}

/** "All" when nothing is filtered, else the picked values joined. */
export function filterSummary(selected: readonly string[]): string {
  return selected.length === 0 ? "All" : selected.join(", ");
}

/** Joins the non-empty parts of a note with " · ". */
export function joinNote(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

// ─── Month ranges (MIR period picker) ────────────────────────────────────────

/** A calendar month as yyyymm, e.g. 202604 = Apr 2026 (orders numerically). */
export type MonthKey = number;

export const monthKey = (year: number, month: number): MonthKey => year * 100 + month;
export const yearOfKey = (k: MonthKey): number => Math.floor(k / 100);
export const monthOfKey = (k: MonthKey): number => k % 100;

/** An inclusive From → To month range; `from` ≤ `to`. */
export interface MonthPeriod {
  from: MonthKey;
  to: MonthKey;
}

/** A period with its ends in order (a From after To is swapped). */
export function normalizePeriod(p: MonthPeriod): MonthPeriod {
  return p.from <= p.to ? p : { from: p.to, to: p.from };
}

/** Whether a row's year + month (1–12) falls in the period. */
export function inPeriod(p: MonthPeriod, year: number, month: number | null): boolean {
  if (month == null || !Number.isFinite(year)) return false;
  const k = monthKey(year, month);
  return k >= p.from && k <= p.to;
}

/** Every month of a calendar year. */
export const calendarYearPeriod = (year: number): MonthPeriod => ({
  from: monthKey(year, 1),
  to: monthKey(year, 12),
});

/** The 12 months ending with `now`'s month, e.g. Oct 2025 – Sep 2026 in Sep 2026. */
export function last12MonthsPeriod(now: Date = new Date()): MonthPeriod {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const to = monthKey(y, m);
  const from = m === 12 ? monthKey(y, 1) : monthKey(y - 1, m + 1);
  return { from, to };
}

/** Jan through `now`'s month of `now`'s year. */
export function yearToDatePeriod(now: Date = new Date()): MonthPeriod {
  return { from: monthKey(now.getFullYear(), 1), to: monthKey(now.getFullYear(), now.getMonth() + 1) };
}

/** "Apr 2025 – Mar 2026", "Jan–Dec 2026", or "Mar 2026" for a single month. */
export function describePeriod(p: MonthPeriod): string {
  const { from, to } = normalizePeriod(p);
  const name = (k: MonthKey) => MONTHS[monthOfKey(k) - 1];
  if (from === to) return `${name(from)} ${yearOfKey(from)}`;
  if (yearOfKey(from) === yearOfKey(to)) return `${name(from)}–${name(to)} ${yearOfKey(to)}`;
  return `${name(from)} ${yearOfKey(from)} – ${name(to)} ${yearOfKey(to)}`;
}

/**
 * The period's months (1–12) when it sits inside one calendar year, else []
 * (= every month). For views that compare fixed years (e.g. 2025 vs 2026).
 */
export function monthsWithinOneYear(p: MonthPeriod): number[] {
  const { from, to } = normalizePeriod(p);
  if (yearOfKey(from) !== yearOfKey(to)) return [];
  const out: number[] = [];
  for (let m = monthOfKey(from); m <= monthOfKey(to); m++) out.push(m);
  return out.length === 12 ? [] : out;
}

/** Every month from Jan of `firstYear` to Dec of `lastYear`, oldest first. */
export function monthKeysBetween(firstYear: number, lastYear: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let y = firstYear; y <= lastYear; y++) for (let m = 1; m <= 12; m++) out.push(monthKey(y, m));
  return out;
}

/** "Apr 2025" for a month key (picker option label). */
export const monthKeyLabel = (k: MonthKey): string => `${MONTHS[monthOfKey(k) - 1]} ${yearOfKey(k)}`;
