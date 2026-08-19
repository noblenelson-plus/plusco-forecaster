// lib/format/mediabox-paste.ts

/**
 * Pure matching + update-building for the "paste a source month into the BL
 * Input" feature. A source is one month's per-channel breakdown taken from
 * MediaBox (media types / LABS partners) or MediaOcean (the actuals rows). Each
 * source line is matched to a BL row type, and the matched amount is *set*
 * (replace) on that BL row for the chosen month, in one target project (bucket).
 *
 * Firebase-free — plain data in, plain updates out (reused by the grid section
 * UI and easy to unit test in isolation).
 */

import type { MonthlyMap } from "../types/common.types";
import type { RowTypeOption } from "../types/forecaster.types";

/** One source line: a display label + its 12-month values (already CAD). */
export interface PasteSourceRow {
  label: string;
  byMonth: MonthlyMap;
}

/**
 * A single "set this BL cell" instruction, targeting a row by (bucket, rowType)
 * rather than by rowId — the target row is created when the project lacks it
 * (handled by the grid's setCellsByType).
 */
export interface SetByTypeUpdate {
  bucketId: string;
  rowType: string;
  month: number;
  value: number | null;
}

export interface MonthPasteResult {
  updates: SetByTypeUpdate[];
  /** Source labels that matched a BL row type. */
  matched: string[];
  /** Source labels carrying spend this month that matched no BL row type. */
  unmatched: string[];
}

/** Normalize a label/value for tolerant comparison (trim + lowercase). */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Resolve a source label to a BL row type. A source line carries a display
 * label ("Social", a LABS partner name); a BL row is keyed by rowType value
 * (the MediaType enum, or a partnerId). We match the label against each
 * option's `value` first (the stored key — the MediaBox media breakdown often
 * emits the enum directly), then its `label` (the display name — LABS partners
 * are labelled by name). Case- and whitespace-tolerant. Returns null when
 * nothing matches, so the caller can surface the dropped line.
 */
export function resolveRowType(
  options: RowTypeOption[],
  sourceLabel: string
): string | null {
  const target = norm(sourceLabel);
  if (!target) return null;
  const byValue = options.find((o) => norm(o.value) === target);
  if (byValue) return byValue.value;
  const byLabel = options.find((o) => norm(o.label) === target);
  return byLabel ? byLabel.value : null;
}

/**
 * Build the BL updates for one month from a set of source rows. Every source
 * line whose label resolves to a BL row type yields a `set` update for that
 * month (value = that line's amount, rounded to cents). Lines that carry spend
 * this month but match no row type are reported in `unmatched` so the UI can
 * warn rather than silently dropping them; a zero, unmatched line is ignored.
 */
export function buildMonthPaste(
  sourceRows: PasteSourceRow[],
  month: number,
  options: RowTypeOption[],
  bucketId: string
): MonthPasteResult {
  const updates: SetByTypeUpdate[] = [];
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const row of sourceRows) {
    const raw = row.byMonth[month] ?? 0;
    const value = Math.round(raw * 100) / 100;
    const rowType = resolveRowType(options, row.label);
    if (rowType === null) {
      // Only warn about lines that actually carry spend for this month.
      if (value !== 0) unmatched.push(row.label);
      continue;
    }
    matched.push(row.label);
    updates.push({ bucketId, rowType, month, value });
  }

  return { updates, matched, unmatched };
}

/** Total across a source's rows for one month (drives the button's enablement). */
export function monthSourceTotal(rows: PasteSourceRow[], month: number): number {
  return rows.reduce((acc, r) => acc + (r.byMonth[month] ?? 0), 0);
}
