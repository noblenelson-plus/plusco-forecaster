// components/forecaster/revenue-grid.tsx
"use client";

/**
 * Revenue grid — a flat, fixed-row variant of the forecast grid.
 *
 * Unlike Media/Labs there is no project notion: a single implicit bucket holds
 * the BL revenue streams (Retainer, Commission, Commission Overwrite, Project
 * Fees, Product Fees, Accrual), and the GAIA (admin) section adds Unallocated.
 * The base BL streams are always seeded by `ensureRevenueShape`; the user may
 * add extra lines of Retainer, Commission Overwrite, Project Fees or Product
 * Fees (rename/remove them), but not Commission (the single computed row) nor
 * Accrual (a fixed line for reporting revenue missed by GAIA in locked
 * months). The GAIA section has no add/remove UI.
 *
 * The BL Commission row is calculated (media spend × commission rate, same
 * submission) — read-only, with a per-month hover breakdown. Any month where a
 * BL Commission Overwrite line carries a value — a non-zero amount or an
 * explicitly entered 0 — suppresses the calculation for that month (the
 * Commission cell shows 0 and the hover explains why). Commission Overwrite is
 * BL-only (no GAIA counterpart). The GAIA Commission row is a normal manual
 * entry.
 *
 * Two independent figures sit at the bottom of the grid:
 *   - Official Revenue = a single hand-entered line (stored as `gaiaForecast`,
 *     editable by admins like the other GAIA rows) rendered as the emerald
 *     bottom row — it is both the entry and the official total, with no
 *     prioritization.
 *   - BL Submission = a two-level priority among the remaining lines: the GAIA
 *     detail lines win each month when any carries a value (summed), otherwise
 *     the BL Input is used (summed). The cells counted toward it are highlighted
 *     mauve; the losing level's cells are struck through and excluded.
 * The variance row compares the current BL Submission against the previous RFQ's
 * Official Revenue. A legend above the table spells this out.
 *
 * Reuses the shared cell primitives (SpreadsheetCell, TotalCell, the
 * useGridSelection clipboard/keyboard layer) and the useForecasterGrid result
 * for load/save/lock/comparison.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Lock,
  Loader2,
  RotateCcw,
  Download,
  SplitSquareHorizontal,
  Sparkles,
  Flag,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  StickyNote,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Info,
  AlertTriangle,
} from "lucide-react";
import type {
  ForecastBucket,
  ForecastRow,
  InputCategory,
} from "../../lib/types/forecaster.types";
import {
  REVENUE_AXIS_CONFIG,
  REVENUE_COMMISSION_TYPE,
  REVENUE_COMMISSION_OVERWRITE_TYPE,
  REVENUE_ACCRUAL_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  REVENUE_PRODUCT_FEES_TYPE,
  REVENUE_BL_ADDABLE_STREAMS,
  REVENUE_STREAM_LABELS,
  GENERAL_PROJECT_NAME,
  buildCellKey,
  actualsMonthEntered,
  hasExplicitZero,
} from "../../lib/types/forecaster.types";
import {
  type UseForecasterGridResult,
  sumMonths,
  monthTotals,
  grandMonthTotals,
} from "../../lib/hooks/use-forecaster-grid";
import {
  useGridSelection,
  type GridRowDescriptor,
} from "../../lib/hooks/use-grid-selection";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { useProducts } from "../../lib/hooks/use-products";
import { revenueDropdownProducts } from "../../lib/services/product-service";
import type { ProductDefinition } from "../../lib/types/product.types";
import { downloadAxisCSV } from "../../lib/format/forecast-csv";
import type { CommissionBreakdown } from "../../lib/format/revenue-commission";
import {
  officialRevenueByMonth,
  blSubmissionByMonth,
} from "../../lib/format/revenue-commission";
import { SpreadsheetCell, TotalCell, formatMoney } from "./editable-cell";
import SpreadDialog from "./spread-dialog";
import SelectionTotal from "./selection-total";
import NoteDialog from "./note-dialog";
import SaveStatusIndicator from "./save-status";
import GridLastUpdated from "./grid-last-updated";
import { NoteCell, DetailRow } from "./forecast-grid";
import RowActionsMenu, { type RowAction } from "./row-actions-menu";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Shared empty set for rows with no closed months (avoids re-allocating). */
const EMPTY_MONTHS: Set<number> = new Set();

/**
 * Per-month winning level for BL Submission. The GAIA detail lines win when any
 * carries a value — a non-zero amount OR an explicitly entered 0; otherwise the
 * BL Input is used; 0 = no data. (The GAIA Revenue line is independent — it is
 * the Official Revenue, not part of this.)
 */
type BlLevel = 0 | 2 | 3;
const LEVEL_NONE: BlLevel = 0;
const LEVEL_DETAIL: BlLevel = 2; // the GAIA detail lines, summed — win over BL
const LEVEL_BL: BlLevel = 3; // BL Input, summed — the fallback

/**
 * Visual state for a BL Submission cell at `level`, given its month's winning
 * level: `counted` (mauve, in the BL Submission total) or `overridden` (struck).
 * `entered` marks a deliberate 0 (GAIA cells), which counts like any value.
 */
function blCellState(
  level: BlLevel,
  winning: BlLevel,
  value: number,
  entered = false
): { counted: boolean; overridden: boolean } {
  if (value === 0 && !entered) return { counted: false, overridden: false };
  if (winning === level) return { counted: true, overridden: false };
  return { counted: false, overridden: true };
}

interface RevenueGridProps {
  grid: UseForecasterGridResult;
  /** Commission breakdown — drives the BL Commission row and its hover. */
  commission: CommissionBreakdown;
  /** The client has no commission rates configured for the selected year. */
  noRates?: boolean;
  /**
   * Hide the GAIA (ADMIN_INPUT) section entirely. Used for RFQ0, which opens a
   * new planning year before any GAIA actuals exist.
   */
  hideGaia?: boolean;
}

/**
 * One editable cell row in selection order (BL editable rows, then actuals, each
 * optionally followed by its expanded detail lines). `key` is unique per row
 * (rowId, or detailId for a detail line) and indexes the selection model.
 */
interface OrderedRow {
  key: string;
  rowId: string;
  category: InputCategory;
  bucketId: string | null;
  detailId?: string | null;
  /** Parent actuals row carrying detail lines — its months are derived
   *  (row = Σ details) and read-only. */
  hasDetails?: boolean;
}

export default function RevenueGrid({ grid, commission, noRates, hideGaia }: RevenueGridProps) {
  const config = REVENUE_AXIS_CONFIG;
  const blReadOnly = grid.locked;

  // Catalog products selectable on a "Product Fees" line (Revenue Dropdown).
  const { products } = useProducts();
  const dropdownProducts = useMemo(
    () => revenueDropdownProducts(products),
    [products]
  );
  const productById = useMemo(
    () => new Map(products.map((p) => [p.productId, p])),
    [products]
  );

  // Notes column visibility — shares the key with the other axes so the choice
  // is unified across Media/Revenue/Labs and persists across reloads.
  const [showNotes, setShowNotes] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("forecast-show-notes");
    if (saved !== null) setShowNotes(saved === "true");
  }, []);
  const toggleNotes = () =>
    setShowNotes((prev) => {
      const next = !prev;
      localStorage.setItem("forecast-show-notes", String(next));
      return next;
    });

  const buckets = grid.data.buckets;
  const actuals = grid.data.actuals;

  // A Product Fees line must be linked to a product — count the BL rows that
  // aren't, to flag them and block Save until they're fixed.
  const missingProductRows = useMemo(
    () =>
      buckets.reduce(
        (n, b) =>
          n +
          b.rows.filter(
            (r) => r.rowType === REVENUE_PRODUCT_FEES_TYPE && !r.productId
          ).length,
        0
      ),
    [buckets]
  );

  // Collapsed projects — hidden rows also leave the selection model below so
  // keyboard navigation / paste never reach rows you can't see.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (bucketId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(bucketId)) next.delete(bucketId);
      else next.add(bucketId);
      return next;
    });

  // Expanded GAIA (actuals) rows — their detail lines are shown, and only the
  // visible detail cells join the selection model below.
  const [expandedActuals, setExpandedActuals] = useState<Set<string>>(new Set());
  const toggleActualsExpand = (rowId: string) =>
    setExpandedActuals((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  const colCount = showNotes ? 15 : 14;

  // BL Input total per month (includes the computed Commission row, overlaid
  // into grid.data) — the level-3 candidate for the source of truth.
  const blTotals = useMemo(() => grandMonthTotals(grid.data), [grid.data]);

  // ─── Official Revenue & BL Submission (per month) ────────────────────────
  // Official Revenue is the hand-entered `gaiaForecast` line, rendered as the
  // editable emerald row at the bottom of the grid. BL Submission is a
  // two-level priority among the rest: the GAIA detail lines win each month
  // when any carries a value (non-zero, or an explicitly entered 0), otherwise
  // the BL Input is used; the winning level's cells are mauve, the losing ones
  // struck through.
  const otherActuals = useMemo(
    () => actuals.filter((row) => row.rowType !== REVENUE_GAIA_FORECAST_TYPE),
    [actuals]
  );
  const otherActualsTotals = useMemo(() => monthTotals(otherActuals), [otherActuals]);

  // The Official Revenue row itself (seeded by ensureRevenueShape).
  const officialRow = useMemo(
    () => actuals.find((row) => row.rowType === REVENUE_GAIA_FORECAST_TYPE),
    [actuals]
  );

  // Which level feeds BL Submission each month (0 when neither carries a
  // value). An explicit GAIA 0 counts as data: the month stays on the GAIA
  // level instead of falling back to the BL Input.
  const blLevel = useMemo<Record<number, BlLevel>>(() => {
    const map: Record<number, BlLevel> = {};
    for (const m of MONTHS) {
      if (otherActuals.some((row) => actualsMonthEntered(row, m)))
        map[m] = LEVEL_DETAIL;
      else if (blTotals[m] !== 0) map[m] = LEVEL_BL;
      else map[m] = LEVEL_NONE;
    }
    return map;
  }, [otherActuals, blTotals]);

  // BL Submission per month — GAIA detail lines over BL Input.
  const blSubmissionTotals = useMemo(
    () => blSubmissionByMonth(grid.data),
    [grid.data]
  );

  // BL Submission broken down by stream — for each month, the winning level's
  // rows (the mauve cells) grouped by rowType. The rows sum back to
  // `blSubmissionTotals` by construction. Rendered under the BL Submission row
  // when it is expanded.
  const [submissionExpanded, setSubmissionExpanded] = useState(false);
  const submissionStreamRows = useMemo(() => {
    const byStream = new Map<string, MonthlyMap>();
    const add = (stream: string, m: number, v: number) => {
      if (!v) return;
      let months = byStream.get(stream);
      if (!months) {
        months = {};
        byStream.set(stream, months);
      }
      months[m] = (months[m] ?? 0) + v;
    };
    for (const m of MONTHS) {
      const level = blLevel[m];
      if (level === LEVEL_DETAIL) {
        for (const row of otherActuals) add(row.rowType, m, row.months[m] ?? 0);
      } else if (level === LEVEL_BL) {
        for (const b of buckets)
          for (const row of b.rows) add(row.rowType, m, row.months[m] ?? 0);
      }
    }
    // Fixed stream order (the labels map), unknown types appended last.
    const order = Object.keys(REVENUE_STREAM_LABELS);
    return [...byStream.entries()]
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      })
      .map(([stream, months]) => ({
        stream,
        label:
          REVENUE_STREAM_LABELS[stream as keyof typeof REVENUE_STREAM_LABELS] ??
          stream,
        months,
      }));
  }, [blLevel, otherActuals, buckets]);

  // Previous RFQ's Official Revenue (`gaiaForecast` line) — the comparison
  // reference (defaults to the previous submission). Null until a reference is
  // loaded (e.g. no earlier RFQ exists). The variance compares the current BL
  // Submission against it, month by month.
  const prevOfficialTotals = useMemo<MonthlyMap | null>(
    () => (grid.referenceData ? officialRevenueByMonth(grid.referenceData) : null),
    [grid.referenceData]
  );
  const varianceTotals = useMemo<MonthlyMap>(() => {
    const totals: MonthlyMap = {};
    for (const m of MONTHS) {
      totals[m] = blSubmissionTotals[m] - (prevOfficialTotals?.[m] ?? 0);
    }
    return totals;
  }, [blSubmissionTotals, prevOfficialTotals]);

  const prevRefLabel = grid.compareRef
    ? `${grid.compareRef.rfq} · ${grid.compareRef.year}`
    : null;

  // Selection model — editable rows only. The computed BL Commission row is
  // excluded (read-only, never edited/copied through the selection layer),
  // and collapsed projects' rows leave the model with them.
  const orderedRows = useMemo<OrderedRow[]>(() => {
    const list: OrderedRow[] = [];
    for (const b of buckets) {
      if (collapsed.has(b.bucketId)) continue;
      for (const row of b.rows) {
        if (row.rowType === REVENUE_COMMISSION_TYPE) continue;
        list.push({
          key: row.rowId,
          rowId: row.rowId,
          category: "BL_INPUT",
          bucketId: b.bucketId,
        });
      }
    }
    const pushActuals = (row: ForecastRow) => {
      list.push({
        key: row.rowId,
        rowId: row.rowId,
        category: "ADMIN_INPUT",
        bucketId: null,
        hasDetails: (row.details?.length ?? 0) > 0,
      });
      // Detail-line budget cells join the grid only while the row is expanded.
      if (expandedActuals.has(row.rowId)) {
        for (const detail of row.details ?? []) {
          list.push({
            key: detail.detailId,
            rowId: row.rowId,
            category: "ADMIN_INPUT",
            bucketId: null,
            detailId: detail.detailId,
          });
        }
      }
    };
    for (const row of actuals) {
      if (row.rowType !== REVENUE_GAIA_FORECAST_TYPE) pushActuals(row);
    }
    // The Official Revenue row sits at the very bottom of the table, so it
    // (and its details) comes last in the keyboard-navigation order.
    const official = actuals.find(
      (row) => row.rowType === REVENUE_GAIA_FORECAST_TYPE
    );
    if (official) pushActuals(official);
    return list;
  }, [buckets, actuals, collapsed, expandedActuals]);

  const rowIndex = useMemo(
    () => new Map(orderedRows.map((r, i) => [r.key, i])),
    [orderedRows]
  );

  const descriptors = useMemo<GridRowDescriptor[]>(
    () =>
      orderedRows.map((r) => ({
        key: r.key,
        cellReadOnly: (col: number) => {
          // A parent with detail lines has derived months (row = Σ details).
          if (r.category === "ADMIN_INPUT")
            return !grid.canEditActuals || !!r.hasDetails;
          if (blReadOnly) return true;
          return !grid.canEditClosed && grid.closedMonths.has(MONTHS[col]);
        },
        coordFor: (month: number) => ({
          category: r.category,
          bucketId: r.bucketId,
          rowId: r.rowId,
          detailId: r.detailId ?? null,
          month,
        }),
      })),
    [orderedRows, blReadOnly, grid.canEditActuals, grid.canEditClosed, grid.closedMonths]
  );

  const sel = useGridSelection({
    rows: descriptors,
    getValue: grid.getCellValue,
    setCells: grid.setCells,
    locked: grid.locked,
  });

  const draggingRef = useRef(false);
  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Spread tool target (editable rows only).
  const [spreadRow, setSpreadRow] = useState<{
    category: InputCategory;
    bucketId: string | null;
    rowId: string;
    label: string;
    months: ForecastRow["months"];
  } | null>(null);

  return (
    <div className="space-y-4">
      <RevenueToolbar grid={grid} showNotes={showNotes} onToggleNotes={toggleNotes} />

      {grid.error && (
        <div className="bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg text-sm">
          {grid.error}
        </div>
      )}

      {!grid.locked && missingProductRows > 0 && (
        <div className="flex items-start gap-2.5 bg-yellow-400 border border-yellow-400 text-gray-900 px-4 py-3 rounded-lg text-sm">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            {missingProductRows === 1
              ? "1 Product Fees line has no product linked. It can still be saved, but linking a product is recommended."
              : `${missingProductRows} Product Fees lines have no product linked. They can still be saved, but linking a product is recommended.`}
          </span>
        </div>
      )}

      {!grid.loading && <SourceOfTruthLegend />}

      {grid.loading ? (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400 bg-white border border-gray-200 rounded-xl">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading {config.title}...</span>
        </div>
      ) : (
        <div
          // Bounded height makes this the vertical scroller too, so the header
          // row pins to the top — frozen header + frozen first column.
          className="bg-white border border-gray-200 rounded-xl overflow-auto max-h-[calc(100vh-17rem)]"
          onKeyDown={sel.onKeyDown}
          onCopy={sel.onCopy}
          onPaste={sel.onPaste}
        >
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50">
                {/* First column header intentionally left blank — the section
                    bands (BL Input, GAIA) already name what the rows are. */}
                <th className="sticky left-0 top-0 z-30 bg-gray-50 text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs w-52 border-b border-gray-200" />

                {showNotes && (
                  <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs text-left min-w-[200px] border-b border-gray-200">
                    <span className="inline-flex items-center gap-1.5">
                      Notes
                      <button
                        onClick={toggleNotes}
                        title="Hide notes column"
                        aria-label="Hide notes column"
                        className="text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <EyeOff size={12} />
                      </button>
                    </span>
                  </th>
                )}
                {MONTH_LABELS.map((m, ci) => {
                  const closed = grid.closedMonths.has(ci + 1);
                  return (
                    <th
                      key={m}
                      title={closed ? "Closed period" : undefined}
                      className={`sticky top-0 z-20 px-1.5 py-2.5 font-semibold uppercase tracking-wider text-xs text-right min-w-[72px] border-b border-gray-200 ${
                        closed ? "text-gray-400 bg-gray-100" : "text-gray-500 bg-gray-50"
                      }`}
                    >
                      <span className="inline-flex w-full items-center justify-end gap-1">
                        {closed && <Lock size={10} className="text-gray-400" />}
                        {m}
                      </span>
                    </th>
                  );
                })}
                <th className="sticky top-0 z-20 px-2.5 py-2.5 font-semibold text-gray-700 uppercase tracking-wider text-xs text-right min-w-[88px] bg-gray-100 border-b border-gray-200">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ─── BL Input — one section per project. "General" is fixed
                  (unremovable, unrenamable) and hosts Commission + Accrual. */}
              <BlSectionHeader showNotes={showNotes} />
              {buckets.map((b) => {
                const isGeneral = b.name === GENERAL_PROJECT_NAME;
                const isCollapsed = collapsed.has(b.bucketId);
                return (
                  <Fragment key={b.bucketId}>
                    <RevenueProjectHeader
                      bucket={b}
                      readOnly={blReadOnly}
                      lockName={isGeneral}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => toggleCollapse(b.bucketId)}
                      grid={grid}
                      showNotes={showNotes}
                    />
                    {!isCollapsed &&
                      b.rows.map((row) => {
                        if (row.rowType === REVENUE_COMMISSION_TYPE) {
                          return (
                            <CommissionRow
                              key={row.rowId}
                              row={row}
                              bucketId={b.bucketId}
                              readOnly={blReadOnly}
                              grid={grid}
                              commission={commission}
                              blLevel={blLevel}
                              noRates={noRates}
                              showNotes={showNotes}
                            />
                          );
                        }
                        const isAccrual = row.rowType === REVENUE_ACCRUAL_TYPE;
                        return (
                          <RevenueDataRow
                            key={row.rowId}
                            row={row}
                            category="BL_INPUT"
                            level={LEVEL_BL}
                            blLevel={blLevel}
                            bucketId={b.bucketId}
                            readOnly={blReadOnly}
                            removable={!isAccrual}
                            labelTooltip={
                              isAccrual
                                ? "Use this line to report revenue — such as commission — that was not captured in GAIA for locked (closed) months."
                                : undefined
                            }
                            grid={grid}
                            sel={sel}
                            rowIndex={rowIndex}
                            draggingRef={draggingRef}
                            rowBg="bg-white group-hover:bg-gray-50"
                            showNotes={showNotes}
                            productDropdown={
                              row.rowType === REVENUE_PRODUCT_FEES_TYPE
                                ? {
                                    products: dropdownProducts,
                                    productById,
                                    readOnly: blReadOnly,
                                    onSelect: (pid) =>
                                      grid.setRowProduct(
                                        b.bucketId,
                                        row.rowId,
                                        pid
                                      ),
                                  }
                                : undefined
                            }
                            onSpread={() =>
                              setSpreadRow({
                                category: "BL_INPUT",
                                bucketId: b.bucketId,
                                rowId: row.rowId,
                                label: row.label,
                                months: row.months,
                              })
                            }
                          />
                        );
                      })}
                  </Fragment>
                );
              })}

              {/* BL Input subtotal (informational — see the official total below) */}
              <SubtotalRow
                label="BL Input total"
                totals={blTotals}
                showNotes={showNotes}
              />

              {/* ─── GAIA (ADMIN_INPUT) ─── */}
              {/* Hidden on RFQ0: a new planning year has no GAIA actuals yet. */}
              {!hideGaia && (
              <>
              <tr className="bg-gray-100 border-y border-gray-200">
                <td colSpan={showNotes ? 15 : 14} className="p-0">
                  <div className="sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actuals ({config.actualsLabel})
                    </span>
                    {!grid.canEditActuals && <Lock size={10} className="text-gray-400" />}
                  </div>
                </td>
              </tr>

              {/* The Official Revenue line (`gaiaForecast`) is not listed here —
                  it renders as the editable emerald row at the bottom. */}
              {otherActuals.map((row) => {
                const onSpread = () =>
                  setSpreadRow({
                    category: "ADMIN_INPUT",
                    bucketId: null,
                    rowId: row.rowId,
                    label: row.label,
                    months: row.months,
                  });
                const details = row.details ?? [];
                const expanded = expandedActuals.has(row.rowId);
                // Nothing to expand for a read-only viewer with no details yet.
                const canExpand = grid.canEditActuals || details.length > 0;
                const expand = canExpand
                  ? {
                      expanded,
                      onToggle: () => toggleActualsExpand(row.rowId),
                      count: details.length,
                    }
                  : undefined;
                return (
                  <Fragment key={row.rowId}>
                    <RevenueDataRow
                      row={row}
                      category="ADMIN_INPUT"
                      level={LEVEL_DETAIL}
                      blLevel={blLevel}
                      bucketId={null}
                      readOnly={!grid.canEditActuals}
                      monthsDerived={details.length > 0}
                      grid={grid}
                      sel={sel}
                      rowIndex={rowIndex}
                      draggingRef={draggingRef}
                      rowBg="bg-gray-50 group-hover:bg-gray-100"
                      showNotes={showNotes}
                      onSpread={onSpread}
                      expand={expand}
                    />
                    {expanded &&
                      details.map((detail) => (
                        <DetailRow
                          key={detail.detailId}
                          parentRowId={row.rowId}
                          detail={detail}
                          readOnly={!grid.canEditActuals}
                          grid={grid}
                          sel={sel}
                          rowIndex={rowIndex}
                          draggingRef={draggingRef}
                          showNotes={showNotes}
                        />
                      ))}
                    {expanded && grid.canEditActuals && (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-4 py-1.5 border-b border-gray-100 bg-white"
                        >
                          <button
                            onClick={() => grid.addActualsDetail(row.rowId)}
                            className="flex items-center gap-1 ml-10 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Plus size={12} />
                            Detail
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {/* Actuals (GAIA) subtotal (the level-2 detail lines, informational) */}
              <SubtotalRow
                label={`Actuals (${config.actualsLabel}) total`}
                totals={otherActualsTotals}
                showNotes={showNotes}
              />
              </>
              )}

              {/* ─── BL Submission (GAIA detail lines over BL Input) ─── */}
              <tr className="bg-violet-600 border-t-2 border-violet-700">
                <td className="sticky left-0 z-10 bg-violet-600 px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => setSubmissionExpanded((prev) => !prev)}
                    title="Show the total per stream (the counted cells)"
                    className="flex items-center gap-1.5 uppercase tracking-wider hover:text-violet-100"
                  >
                    {submissionExpanded ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                    BL Submission
                    <span className="font-medium normal-case tracking-normal text-gray-300">
                      · current submission
                    </span>
                  </button>
                </td>
                {showNotes && <td className="bg-violet-600" />}
                {MONTHS.map((m) => (
                  <td key={m} className="px-2.5 py-2.5 text-right align-middle">
                    <p className="text-sm font-bold text-white tabular-nums">
                      {blSubmissionTotals[m]
                        ? Math.round(blSubmissionTotals[m]).toLocaleString("en-CA")
                        : "—"}
                    </p>
                  </td>
                ))}
                <td className="px-2.5 py-2.5 text-right align-middle bg-violet-700">
                  <p className="text-sm font-bold text-white tabular-nums">
                    {Math.round(sumMonths(blSubmissionTotals)).toLocaleString("en-CA")}
                  </p>
                </td>
              </tr>

              {/* Per-stream breakdown of the counted (mauve) cells. */}
              {submissionExpanded &&
                submissionStreamRows.map((row) => (
                  <tr
                    key={row.stream}
                    className="bg-purple-200 border-b border-purple-300"
                  >
                    <td className="sticky left-0 z-10 bg-purple-200 py-2 pl-10 pr-4 text-xs text-gray-900">
                      {row.label}
                    </td>
                    {showNotes && <td className="bg-purple-200" />}
                    {MONTHS.map((m) => (
                      <td
                        key={m}
                        className="px-2.5 py-2 text-right align-middle"
                      >
                        <p className="text-sm tabular-nums text-gray-900">
                          {row.months[m]
                            ? Math.round(row.months[m]).toLocaleString("en-CA")
                            : "—"}
                        </p>
                      </td>
                    ))}
                    <td className="px-2.5 py-2 text-right align-middle bg-purple-200">
                      <p className="text-sm font-medium tabular-nums text-gray-900">
                        {Math.round(sumMonths(row.months)).toLocaleString("en-CA")}
                      </p>
                    </td>
                  </tr>
                ))}

              {/* Official revenue of the comparison reference (previous RFQ by
                  default) + the per-month variance of the current BL Submission
                  against it. */}
              <PrevOfficialRow
                label={
                  prevRefLabel
                    ? `Official Revenue · ${prevRefLabel}`
                    : "Official Revenue · previous RFQ"
                }
                totals={prevOfficialTotals}
                loading={grid.referenceLoading}
                showNotes={showNotes}
              />
              <VarianceRow totals={varianceTotals} showNotes={showNotes} />

              {/* ─── Official Revenue (the hand-entered `gaiaForecast` line) ───
                  The grand total, kept at the very bottom below the variance.
                  Looks like a summary row but its cells are editable by admins,
                  exactly like the other GAIA rows. */}
              {officialRow &&
                (() => {
                  const details = officialRow.details ?? [];
                  const expanded = expandedActuals.has(officialRow.rowId);
                  const canExpand = grid.canEditActuals || details.length > 0;
                  return (
                    <Fragment>
                      <OfficialRevenueRow
                        row={officialRow}
                        grid={grid}
                        sel={sel}
                        rowIndex={rowIndex}
                        draggingRef={draggingRef}
                        showNotes={showNotes}
                        onSpread={() =>
                          setSpreadRow({
                            category: "ADMIN_INPUT",
                            bucketId: null,
                            rowId: officialRow.rowId,
                            label: officialRow.label,
                            months: officialRow.months,
                          })
                        }
                        expand={
                          canExpand
                            ? {
                                expanded,
                                onToggle: () =>
                                  toggleActualsExpand(officialRow.rowId),
                                count: details.length,
                              }
                            : undefined
                        }
                      />
                      {expanded &&
                        details.map((detail) => (
                          <DetailRow
                            key={detail.detailId}
                            parentRowId={officialRow.rowId}
                            detail={detail}
                            readOnly={!grid.canEditActuals}
                            grid={grid}
                            sel={sel}
                            rowIndex={rowIndex}
                            draggingRef={draggingRef}
                            showNotes={showNotes}
                          />
                        ))}
                      {expanded && grid.canEditActuals && (
                        <tr>
                          <td
                            colSpan={colCount}
                            className="px-4 py-1.5 border-b border-gray-100 bg-white"
                          >
                            <button
                              onClick={() =>
                                grid.addActualsDetail(officialRow.rowId)
                              }
                              className="flex items-center gap-1 ml-10 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <Plus size={12} />
                              Detail
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })()}
            </tbody>
          </table>
        </div>
      )}

      {spreadRow && (
        <SpreadDialog
          rowLabel={spreadRow.label}
          months={spreadRow.months}
          lockedMonths={
            spreadRow.category === "BL_INPUT" && !grid.canEditClosed
              ? grid.closedMonths
              : undefined
          }
          onClose={() => setSpreadRow(null)}
          onApply={(updates) =>
            grid.setCells(
              updates.map((u) => ({
                coord: {
                  category: spreadRow.category,
                  bucketId: spreadRow.bucketId,
                  rowId: spreadRow.rowId,
                  month: u.month,
                },
                value: u.value,
              }))
            )
          }
        />
      )}

      <SelectionTotal
        count={sel.selectionStats.count}
        sum={sel.selectionStats.sum}
      />
    </div>
  );
}

// ─── Toolbar (lock badge + CSV + discard/save) ───────────────────────────────

function RevenueToolbar({
  grid,
  showNotes,
  onToggleNotes,
}: {
  grid: UseForecasterGridResult;
  showNotes: boolean;
  onToggleNotes: () => void;
}) {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const [addingBucket, setAddingBucket] = useState(false);
  const [bucketName, setBucketName] = useState("");

  function submitBucket() {
    const name = bucketName.trim();
    // "General" is the fixed project — a duplicate would confuse the required
    // Commission/Accrual placement, so it can't be created by hand.
    if (name && name !== GENERAL_PROJECT_NAME) grid.addBucket(name);
    setBucketName("");
    setAddingBucket(false);
  }

  function downloadCSV() {
    downloadAxisCSV(grid.data, REVENUE_AXIS_CONFIG, {
      clientName: selectedClient?.CL_Name,
      year: selectedYear,
      rfqType: selectedRFQ?.type,
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {grid.locked && (
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
            <Lock size={12} />
            RFQ locked — read only
          </span>
        )}
        <GridLastUpdated
          blUpdatedAt={grid.lastUpdated.bl}
          actualsUpdatedAt={grid.lastUpdated.actuals}
          actualsLabel={REVENUE_AXIS_CONFIG.actualsLabel}
        />
      </div>

      <div className="flex items-center gap-2">
        {!grid.locked && <SaveStatusIndicator status={grid.saveStatus} />}

        {!grid.locked &&
          (addingBucket ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitBucket();
                  if (e.key === "Escape") setAddingBucket(false);
                }}
                placeholder="Project name..."
                className="w-44 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                onClick={submitBucket}
                className="px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingBucket(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <FolderPlus size={14} />
              Add project
            </button>
          ))}

        <button
          onClick={onToggleNotes}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
            showNotes
              ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
              : "text-gray-600 border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-900"
          }`}
          title={showNotes ? "Hide the notes column" : "Show the notes column"}
        >
          {showNotes ? <Eye size={14} /> : <EyeOff size={14} />}
          Notes
        </button>

        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
          title="Download this axis as a CSV file"
        >
          <Download size={14} />
          CSV
        </button>

        {grid.hasChanges && (
          <button
            onClick={grid.discard}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            title="Discard unsaved changes"
          >
            <RotateCcw size={13} />
            Discard
          </button>
        )}

        <button
          onClick={grid.save}
          disabled={!grid.hasChanges || grid.saving || grid.locked}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
        >
          {grid.saving && <Loader2 size={14} className="animate-spin" />}
          Save
          {grid.hasChanges && (
            <span className="px-1.5 py-0.5 rounded-md bg-gray-900 text-yellow-400 text-[10px] font-bold">
              {grid.dirtyCount > 0 ? grid.dirtyCount : "•"}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── BL Input section header (plain band — the projects structure the rows) ──

function BlSectionHeader({ showNotes }: { showNotes: boolean }) {
  return (
    <tr className="bg-gray-100 border-y border-gray-200">
      <td colSpan={showNotes ? 15 : 14} className="p-0">
        <div className="sticky left-0 z-10 flex w-fit items-center gap-3 px-4 py-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            BL Input
          </span>
        </div>
      </td>
    </tr>
  );
}

// ─── Project header (name + subtotal + add-line + remove) ────────────────────

/**
 * One revenue project's header row, mirroring the Media/Labs bucket header:
 * collapse chevron, editable name, per-project add-line control, remove
 * button, and the project's monthly subtotal across the row. The "General"
 * project is fixed — unrenamable and unremovable — because it hosts the
 * computed Commission and the Accrual lines (see ensureRevenueShape).
 */
function RevenueProjectHeader({
  bucket,
  readOnly,
  lockName,
  collapsed,
  onToggleCollapse,
  grid,
  showNotes,
}: {
  bucket: ForecastBucket;
  readOnly: boolean;
  /** The fixed General project — no rename, no remove. */
  lockName: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  grid: UseForecasterGridResult;
  showNotes: boolean;
}) {
  const totals = useMemo(() => monthTotals(bucket.rows), [bucket.rows]);

  return (
    <tr className="bg-gray-50 border-t border-gray-200">
      <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
            title={collapsed ? "Expand project" : "Collapse project"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <input
            type="text"
            value={bucket.name}
            disabled={readOnly || lockName}
            onChange={(e) => grid.renameBucket(bucket.bucketId, e.target.value)}
            title={
              lockName
                ? `The "${GENERAL_PROJECT_NAME}" project is fixed — it hosts the Commission and Accrual lines.`
                : undefined
            }
            className="font-semibold text-gray-900 text-sm bg-transparent border border-transparent rounded-md px-1.5 py-0.5 min-w-0 flex-1
              hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white
              disabled:hover:border-transparent"
          />
          {!readOnly && (
            <>
              <AddLineControl
                onPick={(rowType) => grid.addRow(bucket.bucketId, rowType)}
              />
              {!lockName && (
                <button
                  onClick={() => grid.removeBucket(bucket.bucketId)}
                  className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors"
                  title="Remove project (until saved)"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </td>
      {showNotes && <td className="bg-gray-50 border-b border-gray-100" />}
      {MONTHS.map((m) => (
        <TotalCell key={m} value={totals[m] ?? 0} emphasis="bucket" />
      ))}
      <TotalCell value={sumMonths(totals)} emphasis="bucket" />
    </tr>
  );
}

/** Reveals a small select of the addable BL streams; calls onPick with the type. */
function AddLineControl({ onPick }: { onPick: (rowType: string) => void }) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <div className="relative">
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
            setAdding(false);
          }}
          onBlur={() => setAdding(false)}
          className="appearance-none pl-3 pr-8 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
        >
          <option value="" disabled>
            Add line...
          </option>
          {REVENUE_BL_ADDABLE_STREAMS.map((s) => (
            <option key={s} value={s}>
              {REVENUE_STREAM_LABELS[s]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      title="Add a Retainer, Commission Overwrite, Project Fees or Product Fees line"
    >
      <Plus size={12} />
      Add line
    </button>
  );
}

// ─── Source-of-truth legend ──────────────────────────────────────────────────

function SourceOfTruthLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
        Source of truth
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-emerald-600" />
        Official Revenue (hand-entered, the source of truth)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-purple-200 ring-1 ring-inset ring-purple-300" />
        Counted in BL Submission
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="text-gray-400 line-through decoration-gray-400">12 500</span>
        Overridden (not counted)
      </span>
    </div>
  );
}

// ─── Subtotal row (informational — not the official total) ───────────────────

function SubtotalRow({
  label,
  totals,
  showNotes,
}: {
  label: string;
  totals: MonthlyMap;
  showNotes: boolean;
}) {
  return (
    <tr className="bg-gray-100 border-b border-gray-200">
      <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1.5 pl-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </td>
      {showNotes && <td className="bg-gray-100 border-b border-gray-200" />}
      {MONTHS.map((m) => (
        <TotalCell key={m} value={totals[m] ?? 0} emphasis="bucket" />
      ))}
      <TotalCell value={sumMonths(totals)} emphasis="bucket" />
    </tr>
  );
}

/** Format a rounded amount; em dash for an empty (null) or zero value. */
function fmtAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "—";
  return Math.round(value).toLocaleString("en-CA");
}

// ─── Previous-RFQ official revenue (comparison reference) ────────────────────

function PrevOfficialRow({
  label,
  totals,
  loading,
  showNotes,
}: {
  label: string;
  totals: MonthlyMap | null;
  loading: boolean;
  showNotes: boolean;
}) {
  const annual = totals ? sumMonths(totals) : null;
  return (
    <tr className="bg-green-500 border-b border-green-500">
      <td className="sticky left-0 z-10 bg-green-500 px-4 py-2 pl-6 text-xs font-semibold text-white uppercase tracking-wider">
        {label}
      </td>
      {showNotes && <td className="bg-green-500 border-b border-green-500" />}
      {MONTHS.map((m) => (
        <td key={m} className="px-2.5 py-2 text-right align-middle">
          <p className="text-sm font-medium text-white tabular-nums">
            {loading && !totals ? "…" : fmtAmount(totals?.[m])}
          </p>
        </td>
      ))}
      <td className="px-2.5 py-2 text-right align-middle bg-green-600">
        <p className="text-sm font-semibold text-white tabular-nums">
          {loading && !totals ? "…" : fmtAmount(annual)}
        </p>
      </td>
    </tr>
  );
}

// ─── Variance (current official − previous official) ─────────────────────────

/** Signed variance amount, coloured by direction (gain green, drop red, flat grey). */
function varianceCell(value: number) {
  const cls =
    value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-gray-300";
  const text =
    value === 0
      ? "—"
      : `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-CA")}`;
  return <p className={`text-sm font-medium tabular-nums ${cls}`}>{text}</p>;
}

function VarianceRow({
  totals,
  showNotes,
}: {
  /** Current BL Submission minus the previous RFQ's Official Revenue, per month. */
  totals: MonthlyMap;
  showNotes: boolean;
}) {
  const annual = sumMonths(totals);
  return (
    <tr className="bg-white border-b border-gray-200">
      <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Variance
      </td>
      {showNotes && <td className="bg-white border-b border-gray-200" />}
      {MONTHS.map((m) => (
        <td key={m} className="px-2.5 py-2 text-right align-middle">
          {varianceCell(totals[m] ?? 0)}
        </td>
      ))}
      <td className="px-2.5 py-2 text-right align-middle bg-gray-50">
        {varianceCell(annual)}
      </td>
    </tr>
  );
}

// ─── Expand/collapse toggle for a GAIA row's detail lines ────────────────────

function ExpandToggle({
  expand,
  inverse = false,
}: {
  expand: { expanded: boolean; onToggle: () => void };
  /** Rendered on a dark row (the Official Revenue row) — light icon colors. */
  inverse?: boolean;
}) {
  return (
    <button
      onClick={expand.onToggle}
      className={`p-0.5 rounded transition-colors flex-shrink-0 ${
        inverse
          ? "text-gray-300 hover:text-white hover:bg-gray-700"
          : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
      }`}
      title={expand.expanded ? "Hide detail" : "Show detail"}
    >
      {expand.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

// ─── Editable data row (label + spread + 12 cells + total) ───────────────────

// ─── Row-label help tooltip ──────────────────────────────────────────────────
// A small info icon next to a row label that reveals free-text help on hover.
// Rendered through a portal (like CommissionTooltip) to escape table overflow.

function InfoTooltip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setAnchor(null)}
        className="inline-flex cursor-help text-gray-400 hover:text-gray-600"
      >
        <Info size={13} />
      </span>
      {anchor && <InfoTooltipPopover text={text} anchor={anchor} />}
    </>
  );
}

function InfoTooltipPopover({ text, anchor }: { text: string; anchor: DOMRect }) {
  if (typeof document === "undefined") return null;

  const WIDTH = 260;
  // Left-align to the icon, clamped to the viewport.
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8));
  // Below the icon, unless that would overflow the viewport bottom.
  const below = anchor.bottom + 6;
  const placeAbove = below + 120 > window.innerHeight && anchor.top > 120;

  const style: React.CSSProperties = {
    position: "fixed",
    left,
    width: WIDTH,
    zIndex: 60,
    pointerEvents: "none",
    ...(placeAbove ? { bottom: window.innerHeight - anchor.top + 6 } : { top: below }),
  };

  return createPortal(
    <div
      style={style}
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-xl"
    >
      <p className="text-xs leading-relaxed text-gray-600">{text}</p>
    </div>,
    document.body
  );
}

// ─── Product selector (Revenue "Product Fees" BL lines) ──────────────────────
// A compact dropdown under the row label to link the fee to a catalog product
// (a "Revenue Dropdown" product). Expected on Product Fees lines — an empty
// selection is flagged in yellow (a non-blocking warning; Save still works). A
// previously-picked product that is no longer in the dropdown catalog stays
// visible as a disabled "(unavailable)" option so the selection never vanishes.

function ProductSelect({
  value,
  products,
  productById,
  readOnly,
  onSelect,
}: {
  value?: string;
  products: ProductDefinition[];
  productById: Map<string, ProductDefinition>;
  readOnly: boolean;
  onSelect: (productId: string) => void;
}) {
  // Is the current selection missing from the dropdown list (deleted/unflagged)?
  const stale = !!value && !products.some((p) => p.productId === value);
  const staleName = stale ? productById.get(value!)?.name ?? value : "";
  // A Product Fees line should be linked to a product — flag an empty pick as a
  // non-blocking warning (yellow), not an error.
  const missing = !readOnly && !value;

  return (
    <div className="mt-1 pl-2">
      <select
        value={value ?? ""}
        disabled={readOnly}
        onChange={(e) => onSelect(e.target.value)}
        title="Link this Product Fees line to a product (recommended)"
        className={`w-full max-w-[220px] px-2 py-1 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:bg-gray-50 disabled:text-gray-400 ${
          missing || stale
            ? "border-yellow-400 text-gray-500"
            : "border-gray-200 text-gray-600"
        }`}
      >
        <option value="">— Select a product —</option>
        {stale && (
          <option value={value} disabled>
            {staleName} (unavailable)
          </option>
        )}
        {products.map((p) => (
          <option key={p.productId} value={p.productId}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function RevenueDataRow({
  row,
  category,
  level,
  blLevel,
  bucketId,
  readOnly,
  monthsDerived = false,
  removable = false,
  grid,
  sel,
  rowIndex,
  draggingRef,
  rowBg,
  showNotes,
  onSpread,
  expand,
  labelTooltip,
  productDropdown,
}: {
  row: ForecastRow;
  category: InputCategory;
  /** This row's BL Submission level (LEVEL_DETAIL for GAIA details, LEVEL_BL for BL). */
  level: BlLevel;
  /** The BL Submission winning level per month, shared by the grid. */
  blLevel: Record<number, BlLevel>;
  bucketId: string | null;
  readOnly: boolean;
  /** The months are derived from the detail lines (row = Σ details) — cells
   *  read-only, Distribute hidden. */
  monthsDerived?: boolean;
  /** Shows a delete button (set on BL data rows; the GAIA section is fixed). */
  removable?: boolean;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  rowBg: string;
  showNotes: boolean;
  onSpread: () => void;
  /** Expand/collapse control for GAIA rows that carry detail lines. */
  expand?: { expanded: boolean; onToggle: () => void; count: number };
  /** Optional help text shown via an info icon next to the row label. */
  labelTooltip?: string;
  /** Product selector for "Product Fees" BL lines (rendered under the label). */
  productDropdown?: {
    products: ProductDefinition[];
    productById: Map<string, ProductDefinition>;
    readOnly: boolean;
    onSelect: (productId: string) => void;
  };
}) {
  const r = rowIndex.get(row.rowId)!;
  // Closed periods only lock BL cells, and only for users who can't edit them.
  const closedHere =
    category === "BL_INPUT" && !grid.canEditClosed ? grid.closedMonths : EMPTY_MONTHS;

  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 ${rowBg} px-4 py-1.5 border-b border-gray-100`}>
        <div className={`flex items-center gap-1.5 ${expand ? "" : "pl-2"}`}>
          {expand && <ExpandToggle expand={expand} />}
          <span className="text-sm text-gray-700">{row.label}</span>
          {labelTooltip && <InfoTooltip text={labelTooltip} />}
          {expand && expand.count > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-gray-200 text-gray-500">
              {expand.count}
            </span>
          )}
          {!readOnly &&
            (() => {
              const actions: RowAction[] = [
                // Distribute writes the parent's months — meaningless when
                // they are derived from the detail lines.
                ...(monthsDerived
                  ? []
                  : [
                      {
                        label: "Distribute…",
                        icon: <SplitSquareHorizontal size={14} />,
                        onClick: onSpread,
                      },
                    ]),
                {
                  label: row.note ? "Edit note" : "Add note",
                  icon: <StickyNote size={14} />,
                  onClick: () => setNoteOpen(true),
                },
              ];
              if (removable) {
                actions.push({
                  label: "Remove",
                  icon: <Trash2 size={14} />,
                  danger: true,
                  onClick: () => grid.removeRow(bucketId!, row.rowId),
                });
              }
              return (
                <RowActionsMenu ariaLabel={`Actions for ${row.label}`} actions={actions} />
              );
            })()}
        </div>
        {productDropdown && (
          <ProductSelect
            value={row.productId}
            products={productDropdown.products}
            productById={productDropdown.productById}
            readOnly={productDropdown.readOnly}
            onSelect={productDropdown.onSelect}
          />
        )}
        {noteOpen && (
          <NoteDialog
            rowLabel={row.label}
            note={row.note ?? ""}
            readOnly={readOnly}
            onSave={(note) => grid.setRowNote(category, bucketId, row.rowId, note)}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </td>
      {showNotes && (
        <NoteCell note={row.note} readOnly={readOnly} onClick={() => setNoteOpen(true)} />
      )}
      {MONTHS.map((m, ci) => {
        const coord = { category, bucketId, rowId: row.rowId, month: m };
        const closed = closedHere.has(m);
        const value = row.months[m] ?? 0;
        // A deliberate 0 is real data: it renders as "0" and wins the month
        // over the BL Input like any other value (GAIA rows), or suppresses
        // the computed commission (the BL Commission Overwrite lines).
        const explicitZero =
          (category === "ADMIN_INPUT" ||
            row.rowType === REVENUE_COMMISSION_OVERWRITE_TYPE) &&
          hasExplicitZero(row, m);
        const { counted, overridden } = blCellState(
          level,
          blLevel[m],
          value,
          explicitZero
        );
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={value}
            readOnly={readOnly || closed || monthsDerived}
            closed={closed}
            counted={counted}
            overridden={overridden}
            explicitZero={explicitZero}
            dirty={grid.dirtyMap.has(buildCellKey(coord))}
            sel={sel}
            draggingRef={draggingRef}
          />
        );
      })}
      <TotalCell value={sumMonths(row.months)} emphasis="row" />
    </tr>
  );
}

// ─── Official Revenue row (the hand-entered `gaiaForecast` line) ─────────────
// The grid's grand total AND its entry at once: it looks like the emerald
// summary row it replaced, but its cells are editable by admins exactly like
// the other GAIA rows. It is independent of the BL Submission lines above.

function OfficialRevenueRow({
  row,
  grid,
  sel,
  rowIndex,
  draggingRef,
  showNotes,
  onSpread,
  expand,
}: {
  row: ForecastRow;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  showNotes: boolean;
  onSpread: () => void;
  /** Expand/collapse control for detail lines under the Official Revenue line. */
  expand?: { expanded: boolean; onToggle: () => void; count: number };
}) {
  const r = rowIndex.get(row.rowId)!;
  const readOnly = !grid.canEditActuals;
  // With detail lines the months are derived (row = Σ details) — the cells
  // lock and the details become the entry point.
  const monthsDerived = (row.details?.length ?? 0) > 0;
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <tr className="group bg-emerald-600 border-t-2 border-emerald-700">
      <td className="sticky left-0 z-10 bg-emerald-600 px-4 py-2 border-b border-emerald-500">
        <div className={`flex items-center gap-1.5 ${expand ? "" : "pl-2"}`}>
          {expand && <ExpandToggle expand={expand} inverse />}
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {row.label}
          </span>
          <span className="text-xs font-medium text-gray-100">
            · current submission
          </span>
          {expand && expand.count > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-emerald-500 text-white">
              {expand.count}
            </span>
          )}
          {!readOnly && (
            <RowActionsMenu
              inverse
              ariaLabel={`Actions for ${row.label}`}
              actions={[
                // Distribute writes the parent's months — meaningless when
                // they are derived from the detail lines.
                ...(monthsDerived
                  ? []
                  : [
                      {
                        label: "Distribute…",
                        icon: <SplitSquareHorizontal size={14} />,
                        onClick: onSpread,
                      },
                    ]),
                {
                  label: row.note ? "Edit note" : "Add note",
                  icon: <StickyNote size={14} />,
                  onClick: () => setNoteOpen(true),
                },
              ]}
            />
          )}
        </div>
        {noteOpen && (
          <NoteDialog
            rowLabel={row.label}
            note={row.note ?? ""}
            readOnly={readOnly}
            onSave={(note) => grid.setRowNote("ADMIN_INPUT", null, row.rowId, note)}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </td>
      {showNotes && (
        <NoteCell
          note={row.note}
          readOnly={readOnly}
          onClick={() => setNoteOpen(true)}
          inverse
        />
      )}
      {MONTHS.map((m, ci) => {
        const coord = {
          category: "ADMIN_INPUT" as const,
          bucketId: null,
          rowId: row.rowId,
          month: m,
        };
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={row.months[m] ?? 0}
            readOnly={readOnly || monthsDerived}
            inverse
            explicitZero={hasExplicitZero(row, m)}
            dirty={grid.dirtyMap.has(buildCellKey(coord))}
            sel={sel}
            draggingRef={draggingRef}
          />
        );
      })}
      <td className="px-2.5 py-2 text-right align-middle bg-emerald-700">
        <p className="text-sm font-bold text-white tabular-nums">
          {Math.round(sumMonths(row.months)).toLocaleString("en-CA")}
        </p>
      </td>
    </tr>
  );
}

// ─── Commission row (calculated, read-only, per-month hover breakdown) ───────

function CommissionRow({
  row,
  bucketId,
  readOnly,
  grid,
  commission,
  blLevel,
  noRates,
  showNotes,
}: {
  row: ForecastRow;
  bucketId: string | null;
  readOnly: boolean;
  grid: UseForecasterGridResult;
  commission: CommissionBreakdown;
  /** The BL Submission winning level per month — Commission is a BL row. */
  blLevel: Record<number, BlLevel>;
  /** No commission rates set for the year — flags the row (Commission stays 0). */
  noRates?: boolean;
  showNotes: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <tr className="group bg-gray-50">
      <td className="sticky left-0 z-10 bg-gray-50 group-hover:bg-gray-100 px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm text-gray-700">Commission</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-purple-600 text-white">
            <Sparkles size={10} />
            Calculated
          </span>
          {noRates && (
            <span
              className="text-amber-500 cursor-help"
              title="No commission rates are configured for this client this year, so the Commission row is 0. Set rates in Clients → commissions."
            >
              <Flag size={12} />
            </span>
          )}
        </div>
        {noteOpen && (
          <NoteDialog
            rowLabel={row.label}
            note={row.note ?? ""}
            readOnly={readOnly}
            onSave={(note) => grid.setRowNote("BL_INPUT", bucketId, row.rowId, note)}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </td>
      {showNotes && (
        <NoteCell note={row.note} readOnly={readOnly} onClick={() => setNoteOpen(true)} />
      )}
      {MONTHS.map((m) => {
        const value = commission.months[m] ?? 0;
        const { counted, overridden } = blCellState(LEVEL_BL, blLevel[m], value);
        return (
          <CommissionCell
            key={m}
            month={m}
            value={value}
            lines={commission.byMonth[m] ?? []}
            counted={counted}
            overridden={overridden}
            suppressed={commission.overwritten.has(m)}
          />
        );
      })}
      <TotalCell value={commission.annual} emphasis="row" />
    </tr>
  );
}

function CommissionCell({
  month,
  value,
  lines,
  counted,
  overridden,
  suppressed,
}: {
  month: number;
  value: number;
  lines: CommissionBreakdown["byMonth"][number];
  /** Counted in BL Submission for its month — highlighted mauve. */
  counted: boolean;
  /** Overridden by the GAIA detail lines — struck through. */
  overridden: boolean;
  /** Not calculated — a Commission Overwrite value exists for this month. */
  suppressed: boolean;
}) {
  // Anchor rect captured on hover — the tooltip renders through a portal in
  // fixed position so it escapes the table's overflow-x clipping.
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  // BL Submission styling takes precedence over the default indigo look.
  const bg = anchor
    ? "ring-1 ring-inset ring-indigo-300 bg-gray-100"
    : counted
    ? "bg-purple-200"
    : "";
  const text =
    value === 0
      ? "text-gray-300"
      : overridden
      ? "text-gray-400 line-through decoration-gray-400"
      : counted
      ? "text-gray-900 font-semibold"
      : "text-indigo-900";

  return (
    <td className="px-0 py-0 border-b border-r border-gray-100 align-middle">
      <div className="px-1 py-1">
        <div
          ref={ref}
          onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
          onMouseLeave={() => setAnchor(null)}
          className={`w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md select-none cursor-help ${bg} ${text}`}
        >
          {value === 0 ? "—" : formatMoney(value)}
        </div>
      </div>

      {anchor && (
        <CommissionTooltip
          month={month}
          value={value}
          lines={lines}
          suppressed={suppressed}
          anchor={anchor}
        />
      )}
    </td>
  );
}

/** Fixed-position breakdown popover, portalled to <body> to avoid clipping. */
function CommissionTooltip({
  month,
  value,
  lines,
  suppressed,
  anchor,
}: {
  month: number;
  value: number;
  lines: CommissionBreakdown["byMonth"][number];
  /** Not calculated — a Commission Overwrite value exists for this month. */
  suppressed: boolean;
  anchor: DOMRect;
}) {
  if (typeof document === "undefined") return null;

  const WIDTH = 280;
  // Align the tooltip's right edge to the cell, clamped to the viewport.
  const left = Math.max(
    8,
    Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8)
  );
  // Below the cell, unless that would overflow the viewport bottom.
  const below = anchor.bottom + 6;
  const placeAbove = below + 180 > window.innerHeight && anchor.top > 180;

  const style: React.CSSProperties = {
    position: "fixed",
    left,
    width: WIDTH,
    zIndex: 60,
    pointerEvents: "none",
    ...(placeAbove ? { bottom: window.innerHeight - anchor.top + 6 } : { top: below }),
  };

  return createPortal(
    <div
      style={style}
      className="rounded-xl border border-gray-200 bg-white px-4 py-5 text-left shadow-xl"
    >
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <Sparkles size={11} className="text-indigo-400" />
        Commission · {MONTH_LABELS[month - 1]}
      </p>
      {suppressed ? (
        <p className="text-xs text-gray-400">
          Not calculated — a Commission Overwrite value is entered for this
          month.
        </p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-gray-400">No media spend or rate this month.</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li
              key={l.mediaType}
              className="flex items-center justify-between gap-3 text-xs text-gray-600"
            >
              <span className="truncate">
                {l.label}{" "}
                <span className="text-gray-400">
                  ({formatMoney(l.spend)} × {l.rate}%)
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-gray-800">
                {formatMoney(l.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-xs">
        <span className="font-semibold text-gray-700">Total</span>
        <span className="font-semibold tabular-nums text-indigo-700">
          {formatMoney(value)}
        </span>
      </div>
    </div>,
    document.body
  );
}
