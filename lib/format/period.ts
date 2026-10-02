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
