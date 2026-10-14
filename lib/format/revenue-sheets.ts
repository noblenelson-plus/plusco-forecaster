// lib/format/revenue-sheets.ts

/**
 * Builds the Google Sheets export of the Revenue axis — one tab laid out like
 * the Revenue grid, colors included:
 *
 *   BL Input (per project, + subtotal) → Actuals (GAIA, + detail lines and
 *   subtotal) → BL Submission (+ per-stream breakdown) → previous RFQ's
 *   Official Revenue → Variance → Official Revenue → legend.
 *
 * Cells counted in BL Submission are mauve and bold; the overridden (not
 * counted) ones are struck through in grey, exactly as on screen. The level
 * decision comes from `blSubmissionLevelByMonth`, the same rule the grid uses.
 *
 * Strikethrough is only a look in Sheets — a SUM over a column still adds the
 * struck values — so every subtotal/total is written as a value computed here,
 * never as a formula. Pure and Firebase-free.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import {
  REVENUE_AXIS_CONFIG,
  REVENUE_COMMISSION_TYPE,
  REVENUE_COMMISSION_OVERWRITE_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  REVENUE_STREAM_LABELS,
  REVENUE_PRODUCT_FEES_TYPE,
  hasExplicitZero,
  type AxisData,
  type RowDetail,
} from "../types/forecaster.types";
import {
  blSubmissionByMonth,
  blSubmissionByStream,
  blSubmissionLevelByMonth,
  officialRevenueByMonth,
  type BlSubmissionLevel,
} from "./revenue-commission";
import type { SheetCellStyle, SheetStyleRange, SheetTab } from "./forecast-sheets";

type Cell = string | number;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Column layout: label, notes, 12 months, total. */
const COL_LABEL = 0;
const COL_NOTES = 1;
const COL_FIRST_MONTH = 2;
const COL_TOTAL = COL_FIRST_MONTH + 12;
const WIDTH = COL_TOTAL + 1;

/** Hexes of the app's (Plus-anchored) Tailwind tokens used by the grid. */
const C = {
  white: "#ffffff",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray900: "#111827",
  purple200: "#d0cce2", // counted in BL Submission
  purple600: "#594a99", // BL Submission row (Plus Purple)
  purple700: "#4a3d82",
  green500: "#4db04f", // previous RFQ's Official Revenue (Plus Green)
  green600: "#409a42", // Official Revenue
  green700: "#357b37",
  red600: "#d63a2f",
};

const MONEY = "#,##0";
const SIGNED = "+#,##0;-#,##0;0";

const round2 = (v: number) => Math.round(v * 100) / 100;
const sum = (m: MonthlyMap) => MONTHS.reduce((acc, mo) => acc + (m[mo] ?? 0), 0);

/** A month value: blank for an empty 0, "0" for a deliberately entered one. */
const amount = (v: number, explicitZero = false): Cell =>
  v === 0 ? (explicitZero ? 0 : "") : round2(v);

export interface RevenueSheetOptions {
  /** The comparison reference's Official Revenue (previous RFQ), or null. */
  prevOfficial: MonthlyMap | null;
  /** e.g. "RFQ1 · 2026" — names the reference row. */
  prevLabel: string | null;
  /** RFQ0 — the grid hides the GAIA section, so the sheet does too. */
  hideGaia?: boolean;
  /** Product name for a Product Fees line's `productId`. */
  productName?: (productId: string) => string | undefined;
}

export function buildRevenueSheetTab(
  data: AxisData,
  opts: RevenueSheetOptions
): SheetTab {
  const matrix: Cell[][] = [];
  const styles: SheetStyleRange[] = [];

  const styleRow = (style: SheetCellStyle) =>
    styles.push({ row: matrix.length - 1, col: 0, cols: WIDTH, style });
  const styleCell = (col: number, style: SheetCellStyle) =>
    styles.push({ row: matrix.length - 1, col, style });

  const withProduct = (label: string, productId?: string) => {
    const name = productId ? opts.productName?.(productId) ?? productId : "";
    return name ? `${label} — ${name}` : label;
  };

  const level = blSubmissionLevelByMonth(data);

  /**
   * Pushes one data row and styles each month the way the grid does: mauve +
   * bold when counted in BL Submission, struck grey when overridden. `own` is
   * the row's level; null for rows outside the priority (detail lines).
   */
  const pushDataRow = (
    label: string,
    note: string,
    months: MonthlyMap,
    own: BlSubmissionLevel | null,
    explicitZeroAt: (m: number) => boolean,
    /** Whole-row look, applied before the per-cell states so they win. */
    rowStyle?: SheetCellStyle
  ) => {
    matrix.push([
      label,
      note,
      ...MONTHS.map((m) => amount(months[m] ?? 0, explicitZeroAt(m))),
      amount(sum(months)),
    ]);
    if (rowStyle) styleRow(rowStyle);
    if (!own) return;
    MONTHS.forEach((m, i) => {
      const v = months[m] ?? 0;
      if (v === 0 && !explicitZeroAt(m)) return;
      if (level[m] === own) {
        styleCell(COL_FIRST_MONTH + i, {
          background: C.purple200,
          bold: true,
          color: C.gray900,
        });
      } else {
        styleCell(COL_FIRST_MONTH + i, { strikethrough: true, color: C.gray400 });
      }
    });
  };

  const pushTotalsRow = (label: string, totals: MonthlyMap, style: SheetCellStyle) => {
    matrix.push([
      label,
      "",
      ...MONTHS.map((m) => amount(totals[m] ?? 0)),
      amount(sum(totals)),
    ]);
    styleRow(style);
  };

  const pushBand = (label: string) => {
    matrix.push([label]);
    styleRow({ bold: true, background: C.gray100, color: C.gray600 });
  };

  const pushDetails = (details: RowDetail[], productLines: boolean) => {
    for (const d of details) {
      const name = d.levels.filter((l) => l.trim() !== "").join(" · ") || "Detail";
      pushDataRow(
        `        ${productLines ? withProduct(name, d.productId) : name}`,
        "",
        d.months,
        null,
        (m) => hasExplicitZero(d, m),
        { color: C.gray600, italic: true }
      );
    }
  };

  // ── Header ────────────────────────────────────────────────────────────────
  matrix.push(["", "Notes", ...MONTH_LABELS, "Total"]);
  styleRow({ bold: true, background: C.gray100, color: C.gray500 });

  // ── BL Input — one block per project ──────────────────────────────────────
  pushBand("BL INPUT");
  const blTotals: MonthlyMap = {};
  for (const m of MONTHS) blTotals[m] = 0;
  for (const bucket of data.buckets) {
    const projectTotals: MonthlyMap = {};
    for (const m of MONTHS) {
      projectTotals[m] = bucket.rows.reduce((a, r) => a + (r.months[m] ?? 0), 0);
      blTotals[m] += projectTotals[m];
    }
    pushTotalsRow(bucket.name, projectTotals, { bold: true, background: C.gray50 });

    for (const row of bucket.rows) {
      const isCommission = row.rowType === REVENUE_COMMISSION_TYPE;
      const isOverwrite = row.rowType === REVENUE_COMMISSION_OVERWRITE_TYPE;
      pushDataRow(
        `    ${withProduct(isCommission ? "Commission (calculated)" : row.label, row.productId)}`,
        row.note ?? "",
        row.months,
        "BL",
        // Only a Commission Overwrite line keeps a deliberate 0 on the BL side.
        (m) => isOverwrite && hasExplicitZero(row, m)
      );
    }
  }
  pushTotalsRow("BL Input total", blTotals, {
    bold: true,
    background: C.gray100,
    color: C.gray500,
  });

  // ── Actuals (GAIA) ────────────────────────────────────────────────────────
  const otherActuals = data.actuals.filter(
    (r) => r.rowType !== REVENUE_GAIA_FORECAST_TYPE
  );
  if (!opts.hideGaia) {
    pushBand(`ACTUALS (${REVENUE_AXIS_CONFIG.actualsLabel})`);
    const actualsTotals: MonthlyMap = {};
    for (const m of MONTHS)
      actualsTotals[m] = otherActuals.reduce((a, r) => a + (r.months[m] ?? 0), 0);
    for (const row of otherActuals) {
      const details = row.details ?? [];
      const productLine = row.rowType === REVENUE_PRODUCT_FEES_TYPE;
      pushDataRow(
        `    ${productLine && details.length === 0 ? withProduct(row.label, row.productId) : row.label}`,
        row.note ?? "",
        row.months,
        "DETAIL",
        (m) => hasExplicitZero(row, m),
        { background: C.gray50 }
      );
      pushDetails(details, productLine);
    }
    pushTotalsRow(`Actuals (${REVENUE_AXIS_CONFIG.actualsLabel}) total`, actualsTotals, {
      bold: true,
      background: C.gray100,
      color: C.gray500,
    });
  }

  // ── BL Submission (+ per-stream breakdown of the counted cells) ───────────
  const submission = blSubmissionByMonth(data);
  pushTotalsRow("BL SUBMISSION · current submission", submission, {
    bold: true,
    background: C.purple600,
    color: C.white,
  });
  styleCell(COL_TOTAL, { background: C.purple700 });

  const byStream = blSubmissionByStream(data);
  const order = Object.keys(REVENUE_STREAM_LABELS);
  const streams = Object.keys(byStream).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
  for (const stream of streams) {
    const label =
      REVENUE_STREAM_LABELS[stream as keyof typeof REVENUE_STREAM_LABELS] ?? stream;
    pushTotalsRow(`    ${label}`, byStream[stream], {
      background: C.purple200,
      color: C.gray900,
    });
  }

  // ── Previous RFQ's Official Revenue + variance ────────────────────────────
  const prevLabel = opts.prevLabel
    ? `OFFICIAL REVENUE · ${opts.prevLabel}`
    : "OFFICIAL REVENUE · previous RFQ";
  if (opts.prevOfficial) {
    pushTotalsRow(prevLabel, opts.prevOfficial, {
      bold: true,
      background: C.green500,
      color: C.white,
    });
  } else {
    matrix.push([prevLabel, "", ...MONTHS.map(() => ""), ""]);
    styleRow({ bold: true, background: C.green500, color: C.white });
  }
  styleCell(COL_TOTAL, { background: C.green600 });

  const variance: MonthlyMap = {};
  for (const m of MONTHS) variance[m] = submission[m] - (opts.prevOfficial?.[m] ?? 0);
  const varianceCells = [...MONTHS.map((m) => variance[m]), sum(variance)];
  matrix.push(["VARIANCE", "", ...varianceCells.map((v) => amount(v))]);
  styleRow({ bold: true, color: C.gray500 });
  varianceCells.forEach((v, i) => {
    if (v === 0) return;
    styleCell(COL_FIRST_MONTH + i, {
      color: v > 0 ? C.green700 : C.red600,
      numberFormat: SIGNED,
    });
  });

  // ── Official Revenue (the hand-entered gaiaForecast line) ─────────────────
  const officialRow = data.actuals.find(
    (r) => r.rowType === REVENUE_GAIA_FORECAST_TYPE
  );
  const official = officialRevenueByMonth(data);
  matrix.push([
    "OFFICIAL REVENUE · current submission",
    officialRow?.note ?? "",
    ...MONTHS.map((m) =>
      amount(official[m] ?? 0, officialRow ? hasExplicitZero(officialRow, m) : false)
    ),
    amount(sum(official)),
  ]);
  styleRow({ bold: true, background: C.green600, color: C.white });
  styleCell(COL_TOTAL, { background: C.green700 });
  if (officialRow) pushDetails(officialRow.details ?? [], false);

  // Every amount reads like the grid: whole dollars, thousands separated.
  // Inserted first so the per-cell formats above (variance sign) win.
  styles.unshift({
    row: 1,
    col: COL_FIRST_MONTH,
    rows: matrix.length,
    cols: 13,
    style: { numberFormat: MONEY },
  });

  // ── Legend ────────────────────────────────────────────────────────────────
  matrix.push([]);
  matrix.push(["Source of truth"]);
  styleRow({ bold: true });
  matrix.push(["Official Revenue", "Hand-entered, the source of truth"]);
  styleCell(COL_LABEL, { background: C.green600, color: C.white, bold: true });
  matrix.push(["Counted", "Counted in BL Submission"]);
  styleCell(COL_LABEL, { background: C.purple200, color: C.gray900, bold: true });
  matrix.push([12500, "Overridden (not counted)"]);
  styleCell(COL_LABEL, { strikethrough: true, color: C.gray400, numberFormat: MONEY });
  matrix.push([
    "",
    "Struck-through amounts are not counted. Totals are values from the app, " +
      "not formulas — a SUM over a column would include the struck amounts.",
  ]);
  styleCell(COL_NOTES, { italic: true, color: C.gray500 });

  return {
    sheetTitle: "Revenue",
    matrix,
    layout: {
      styles,
      frozenRows: 1,
      frozenColumns: 1,
      columnWidths: { [COL_LABEL]: 300, [COL_NOTES]: 220 },
    },
  };
}
