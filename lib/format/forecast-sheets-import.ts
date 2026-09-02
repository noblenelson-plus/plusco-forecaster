// lib/format/forecast-sheets-import.ts

/**
 * Parses an edited "BL Submission" tab back into a diff against the current
 * grid — the read side of the Google Sheets round-trip. Only this tab is ever
 * read; the MediaOcean / MediaBox reference tabs are ignored entirely, so a BL
 * editing those by mistake can never change reference data.
 *
 * Everything here is pure and I/O-free: the caller hands in the raw matrix (from
 * readSheet), the axis config, and the live grid data. Rows are matched by their
 * stable key — (Project, Media type) — never by position, so reordering,
 * inserting, and deleting rows in Sheets all survive. Columns are matched by
 * HEADER, so extra/reordered columns are fine too.
 *
 * The result is a diff (updates / additions / removals) plus a list of precise,
 * row-numbered errors. Any error blocks the whole import — a malformed sheet is
 * never partially applied. The caller shows the diff for confirmation and, on
 * apply, writes it in a single undoable step.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { AxisData, AxisConfig } from "../types/forecaster.types";
import { resolveRowType } from "./mediabox-paste";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const norm = (s: string): string => s.trim().toLowerCase();

export interface ImportError {
  /** 1-based sheet row (header is row 1). null for header/structural errors. */
  rowNumber: number | null;
  message: string;
}

export interface CellChange {
  month: number;
  from: number;
  to: number;
}

/** An existing (project, type) row whose months changed. */
export interface ImportUpdate {
  bucketId: string;
  bucketName: string;
  rowId: string;
  rowType: string;
  label: string;
  months: MonthlyMap;
  changes: CellChange[];
}

/** A (project, type) row present in the sheet but not the grid. */
export interface ImportAddition {
  bucketName: string;
  /** The project doesn't exist in the grid yet — a new bucket is created. */
  newBucket: boolean;
  rowType: string;
  label: string;
  months: MonthlyMap;
}

/** A grid row not present in the sheet (kept unless the user opts into removals). */
export interface ImportRemoval {
  bucketId: string;
  bucketName: string;
  rowId: string;
  rowType: string;
  label: string;
}

export interface ImportDiff {
  updates: ImportUpdate[];
  additions: ImportAddition[];
  removals: ImportRemoval[];
  /** Rows that matched a grid row with no change. */
  unchanged: number;
  errors: ImportError[];
  /** True when there are errors — applying is blocked until they're fixed. */
  blocked: boolean;
}

/** Coerce a sheet cell to a number. Blank → 0. Returns null when non-numeric. */
function toNumber(v: unknown): number | null {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/[, ]/g, "");
    if (cleaned === "") return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Header index by exact (normalized) header text; -1 when absent. */
function headerIndex(header: string[], name: string): number {
  const target = norm(name);
  return header.findIndex((h) => norm(h) === target);
}

interface ParsedRow {
  rowNumber: number;
  project: string;
  typeLabel: string;
  rowType: string;
  months: MonthlyMap;
}

export function buildBlImportDiff(
  matrix: unknown[][],
  config: AxisConfig,
  data: AxisData
): ImportDiff {
  const errors: ImportError[] = [];
  const empty = (): ImportDiff => ({
    updates: [],
    additions: [],
    removals: [],
    unchanged: 0,
    errors,
    blocked: true,
  });

  if (!matrix || matrix.length === 0) {
    errors.push({ rowNumber: null, message: "The BL Submission tab is empty." });
    return empty();
  }

  // ── Header → column mapping (by header text, so column order is free) ──────
  const header = (matrix[0] ?? []).map((c) => String(c ?? ""));
  const projectCol = headerIndex(header, config.bucketLabel);
  const typeCol = headerIndex(header, config.rowTypeLabel);
  const monthCols = MONTH_LABELS.map((label) => headerIndex(header, label));

  if (projectCol === -1) {
    errors.push({
      rowNumber: 1,
      message: `Missing column: expected a "${config.bucketLabel}" header in the first row.`,
    });
  }
  if (typeCol === -1) {
    errors.push({
      rowNumber: 1,
      message: `Missing column: expected a "${config.rowTypeLabel}" header in the first row.`,
    });
  }
  const missingMonths = MONTH_LABELS.filter((_, i) => monthCols[i] === -1);
  if (missingMonths.length > 0) {
    errors.push({
      rowNumber: 1,
      message: `Missing month column(s): ${missingMonths.join(", ")}. Keep the Jan–Dec headers intact.`,
    });
  }
  if (errors.length > 0) return empty();

  const typeLabels = config.rowTypeOptions.map((o) => o.label).join(", ");
  const labelByType = new Map(config.rowTypeOptions.map((o) => [o.value, o.label]));

  // ── Parse + validate each data row ────────────────────────────────────────
  const parsed: ParsedRow[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1; // 1-based, header is row 1
    const cells = matrix[r] ?? [];
    const project = String(cells[projectCol] ?? "").trim();
    const typeLabel = String(cells[typeCol] ?? "").trim();

    // Skip a fully blank row silently.
    const anyValue =
      project !== "" ||
      typeLabel !== "" ||
      monthCols.some((ci) => String(cells[ci] ?? "").trim() !== "");
    if (!anyValue) continue;

    if (project === "") {
      errors.push({ rowNumber, message: `Blank ${config.bucketLabel} — every row needs a project name.` });
    }
    if (typeLabel === "") {
      errors.push({ rowNumber, message: `Blank ${config.rowTypeLabel}.` });
    }

    const rowType = typeLabel === "" ? null : resolveRowType(config.rowTypeOptions, typeLabel);
    if (typeLabel !== "" && rowType === null) {
      errors.push({
        rowNumber,
        message: `"${typeLabel}" isn't a recognized ${config.rowTypeLabel} — use one of: ${typeLabels}.`,
      });
    }

    const months: MonthlyMap = {};
    for (let i = 0; i < MONTHS.length; i++) {
      const raw = cells[monthCols[i]];
      const value = toNumber(raw);
      if (value === null) {
        errors.push({
          rowNumber,
          message: `${MONTH_LABELS[i]}: "${String(raw)}" isn't a number.`,
        });
        continue;
      }
      months[MONTHS[i]] = value;
    }

    if (project !== "" && rowType) {
      const key = `${norm(project)}||${rowType}`;
      if (seen.has(key)) {
        errors.push({
          rowNumber,
          message: `Duplicate row: "${project}" / "${typeLabel}" appears more than once.`,
        });
      } else {
        seen.add(key);
        parsed.push({ rowNumber, project, typeLabel, rowType, months });
      }
    }
  }

  if (errors.length > 0) {
    return { updates: [], additions: [], removals: [], unchanged: 0, errors, blocked: true };
  }

  // ── Diff against the grid ─────────────────────────────────────────────────
  // Grid index by (project, rowType); track which grid rows the sheet touched.
  interface GridEntry {
    bucketId: string;
    bucketName: string;
    rowId: string;
    rowType: string;
    label: string;
    months: MonthlyMap;
  }
  const gridByKey = new Map<string, GridEntry>();
  const bucketNames = new Set<string>();
  for (const bucket of data.buckets) {
    bucketNames.add(norm(bucket.name));
    for (const row of bucket.rows) {
      gridByKey.set(`${norm(bucket.name)}||${row.rowType}`, {
        bucketId: bucket.bucketId,
        bucketName: bucket.name,
        rowId: row.rowId,
        rowType: row.rowType,
        label: row.label,
        months: row.months,
      });
    }
  }

  const updates: ImportUpdate[] = [];
  const additions: ImportAddition[] = [];
  const matchedGridKeys = new Set<string>();
  let unchanged = 0;

  for (const p of parsed) {
    const key = `${norm(p.project)}||${p.rowType}`;
    const existing = gridByKey.get(key);
    if (existing) {
      matchedGridKeys.add(key);
      const changes: CellChange[] = [];
      for (const m of MONTHS) {
        const from = Math.round(existing.months[m] ?? 0);
        const to = Math.round(p.months[m] ?? 0);
        if (from !== to) changes.push({ month: m, from, to });
      }
      if (changes.length > 0) {
        updates.push({
          bucketId: existing.bucketId,
          bucketName: existing.bucketName,
          rowId: existing.rowId,
          rowType: existing.rowType,
          label: existing.label,
          months: p.months,
          changes,
        });
      } else {
        unchanged++;
      }
    } else {
      additions.push({
        bucketName: p.project,
        newBucket: !bucketNames.has(norm(p.project)),
        rowType: p.rowType,
        label: labelByType.get(p.rowType) ?? p.typeLabel,
        months: p.months,
      });
    }
  }

  const removals: ImportRemoval[] = [];
  for (const [key, entry] of gridByKey) {
    if (!matchedGridKeys.has(key)) {
      removals.push({
        bucketId: entry.bucketId,
        bucketName: entry.bucketName,
        rowId: entry.rowId,
        rowType: entry.rowType,
        label: entry.label,
      });
    }
  }

  return { updates, additions, removals, unchanged, errors: [], blocked: false };
}