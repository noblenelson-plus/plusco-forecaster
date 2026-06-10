// components/forecaster/revenue-grid.tsx
"use client";

/**
 * Revenue grid — a flat, fixed-row variant of the forecast grid.
 *
 * Unlike Media/Labs there is no project notion: a single implicit bucket holds
 * the BL revenue streams (Retainer, Commission, Project Fees, Product Fees), and
 * the GAIA (admin) section adds Unallocated and Accrual. The four BL streams are
 * always seeded by `ensureRevenueShape`; the user may add extra lines of
 * Retainer, Project Fees or Product Fees (rename/remove them), but not
 * Commission (the single computed row). The GAIA section has no add/remove UI.
 *
 * The BL Commission row is calculated (media spend × commission rate, same
 * submission) — read-only, with a per-month hover breakdown. The GAIA
 * Commission row is a normal manual entry.
 *
 * Source of truth (per month): the official revenue figure comes from the
 * first level that carries a value, in this order —
 *   1. GAIA Revenue (the top GAIA line)
 *   2. the other GAIA detail lines, summed
 *   3. BL Input, summed
 * Cells from the winning level are highlighted green (official); values at the
 * lower levels are struck through and excluded. The "Official Revenue" total
 * row picks each month from its winning level. A legend above the table spells
 * this out.
 *
 * Reuses the shared cell primitives (SpreadsheetCell, TotalCell, the
 * useGridSelection clipboard/keyboard layer) and the useForecasterGrid result
 * for load/save/lock/comparison.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
} from "lucide-react";
import type {
  ForecastRow,
  InputCategory,
} from "../../lib/types/forecaster.types";
import {
  REVENUE_AXIS_CONFIG,
  REVENUE_COMMISSION_TYPE,
  REVENUE_GAIA_FORECAST_TYPE,
  REVENUE_BL_ADDABLE_STREAMS,
  REVENUE_STREAM_LABELS,
  buildCellKey,
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
import { downloadAxisCSV } from "../../lib/format/forecast-csv";
import type { CommissionBreakdown } from "../../lib/format/revenue-commission";
import { officialRevenueByMonth } from "../../lib/format/revenue-commission";
import { SpreadsheetCell, TotalCell, formatMoney } from "./editable-cell";
import SpreadDialog from "./spread-dialog";
import NoteDialog from "./note-dialog";
import SaveStatusIndicator from "./save-status";
import GridLastUpdated from "./grid-last-updated";
import { NoteCell } from "./forecast-grid";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Shared empty set for rows with no closed months (avoids re-allocating). */
const EMPTY_MONTHS: Set<number> = new Set();

/**
 * Per-month source-of-truth level. The official revenue for a month comes from
 * the first level (lowest number) that carries a value; 0 = no data.
 */
type SourceLevel = 0 | 1 | 2 | 3;
const LEVEL_NONE: SourceLevel = 0;
const LEVEL_GAIA: SourceLevel = 1; // GAIA Revenue line — overrides everything below
const LEVEL_DETAIL: SourceLevel = 2; // the other GAIA detail lines, summed
const LEVEL_BL: SourceLevel = 3; // BL Input, summed

/** Visual state for a cell sitting at `level`, given its month's winning level. */
function sourceCellState(
  level: SourceLevel,
  winning: SourceLevel,
  value: number
): { official: boolean; overridden: boolean } {
  if (value === 0) return { official: false, overridden: false };
  if (winning === level) return { official: true, overridden: false };
  return { official: false, overridden: true };
}

interface RevenueGridProps {
  grid: UseForecasterGridResult;
  /** Commission breakdown — drives the BL Commission row and its hover. */
  commission: CommissionBreakdown;
  /** The client has no commission rates configured for the selected year. */
  noRates?: boolean;
}

/** One editable cell row in selection order (BL editable rows, then actuals). */
interface OrderedRow {
  rowId: string;
  category: InputCategory;
  bucketId: string | null;
}

export default function RevenueGrid({ grid, commission, noRates }: RevenueGridProps) {
  const config = REVENUE_AXIS_CONFIG;
  const blReadOnly = grid.locked;

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

  const bucket = grid.data.buckets[0];
  const blRows = useMemo(() => bucket?.rows ?? [], [bucket]);
  const actuals = grid.data.actuals;

  // BL Input total per month (includes the computed Commission row, overlaid
  // into grid.data) — the level-3 candidate for the source of truth.
  const blTotals = useMemo(() => grandMonthTotals(grid.data), [grid.data]);

  // ─── Source of truth (per month) ─────────────────────────────────────────
  // Order: GAIA Revenue line > the other GAIA detail lines > BL Input. The
  // first level that carries a value for a month is that month's official
  // figure; the lower levels are struck through and excluded from the total.
  const forecastRow = useMemo(
    () => actuals.find((row) => row.rowType === REVENUE_GAIA_FORECAST_TYPE) ?? null,
    [actuals]
  );
  const otherActuals = useMemo(
    () => actuals.filter((row) => row.rowType !== REVENUE_GAIA_FORECAST_TYPE),
    [actuals]
  );
  const otherActualsTotals = useMemo(() => monthTotals(otherActuals), [otherActuals]);

  // Which level wins each month (0 when no level carries a value).
  const sourceLevel = useMemo<Record<number, SourceLevel>>(() => {
    const map: Record<number, SourceLevel> = {};
    for (const m of MONTHS) {
      if ((forecastRow?.months[m] ?? 0) !== 0) map[m] = LEVEL_GAIA;
      else if (otherActuals.some((row) => (row.months[m] ?? 0) !== 0))
        map[m] = LEVEL_DETAIL;
      else if (blTotals[m] !== 0) map[m] = LEVEL_BL;
      else map[m] = LEVEL_NONE;
    }
    return map;
  }, [forecastRow, otherActuals, blTotals]);

  // The official revenue per month — drawn from the winning level.
  const officialTotals = useMemo(
    () => officialRevenueByMonth(grid.data),
    [grid.data]
  );

  // Previous RFQ's official revenue — same source-of-truth rule applied to the
  // comparison reference (defaults to the previous submission), plus the
  // month-by-month variance against the current official figure. Null until a
  // reference is loaded (e.g. no earlier RFQ exists).
  const prevOfficialTotals = useMemo<MonthlyMap | null>(
    () => (grid.referenceData ? officialRevenueByMonth(grid.referenceData) : null),
    [grid.referenceData]
  );
  const varianceTotals = useMemo<MonthlyMap>(() => {
    const totals: MonthlyMap = {};
    for (const m of MONTHS) {
      totals[m] = officialTotals[m] - (prevOfficialTotals?.[m] ?? 0);
    }
    return totals;
  }, [officialTotals, prevOfficialTotals]);
  const prevRefLabel = grid.compareRef
    ? `${grid.compareRef.rfq} · ${grid.compareRef.year}`
    : null;

  // Selection model — editable rows only. The computed BL Commission row is
  // excluded (read-only, never edited/copied through the selection layer).
  const orderedRows = useMemo<OrderedRow[]>(() => {
    const list: OrderedRow[] = [];
    for (const row of blRows) {
      if (row.rowType === REVENUE_COMMISSION_TYPE) continue;
      list.push({ rowId: row.rowId, category: "BL_INPUT", bucketId: bucket?.bucketId ?? null });
    }
    for (const row of actuals) {
      list.push({ rowId: row.rowId, category: "ADMIN_INPUT", bucketId: null });
    }
    return list;
  }, [blRows, actuals, bucket?.bucketId]);

  const rowIndex = useMemo(
    () => new Map(orderedRows.map((r, i) => [r.rowId, i])),
    [orderedRows]
  );

  const descriptors = useMemo<GridRowDescriptor[]>(
    () =>
      orderedRows.map((r) => ({
        key: r.rowId,
        cellReadOnly: (col: number) => {
          if (r.category === "ADMIN_INPUT") return !grid.canEditActuals;
          if (blReadOnly) return true;
          return !grid.canEditClosed && grid.closedMonths.has(MONTHS[col]);
        },
        coordFor: (month: number) => ({
          category: r.category,
          bucketId: r.bucketId,
          rowId: r.rowId,
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {grid.error}
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
          className="bg-white border border-gray-200 rounded-xl overflow-x-auto"
          onKeyDown={sel.onKeyDown}
          onCopy={sel.onCopy}
          onPaste={sel.onPaste}
        >
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs w-52">
                  {config.rowTypeLabel}
                </th>
                {showNotes && (
                  <th className="px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs text-left min-w-[200px]">
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
                      className={`px-1.5 py-2.5 font-semibold uppercase tracking-wider text-xs text-right min-w-[72px] ${
                        closed ? "text-gray-400 bg-gray-100/70" : "text-gray-500"
                      }`}
                    >
                      <span className="inline-flex w-full items-center justify-end gap-1">
                        {closed && <Lock size={10} className="text-gray-400" />}
                        {m}
                      </span>
                    </th>
                  );
                })}
                <th className="px-2.5 py-2.5 font-semibold text-gray-700 uppercase tracking-wider text-xs text-right min-w-[88px] bg-gray-100/60">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ─── BL Input ─── */}
              <BlSectionHeader
                showNotes={showNotes}
                canAdd={!blReadOnly}
                onAdd={(rowType) =>
                  bucket && grid.addRow(bucket.bucketId, rowType)
                }
              />
              {blRows.map((row) => {
                if (row.rowType === REVENUE_COMMISSION_TYPE) {
                  return (
                    <CommissionRow
                      key={row.rowId}
                      row={row}
                      bucketId={bucket?.bucketId ?? null}
                      readOnly={blReadOnly}
                      grid={grid}
                      commission={commission}
                      sourceLevel={sourceLevel}
                      noRates={noRates}
                      showNotes={showNotes}
                    />
                  );
                }
                return (
                  <RevenueDataRow
                    key={row.rowId}
                    row={row}
                    category="BL_INPUT"
                    level={LEVEL_BL}
                    sourceLevel={sourceLevel}
                    bucketId={bucket?.bucketId ?? null}
                    readOnly={blReadOnly}
                    removable
                    grid={grid}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    rowBg="bg-white group-hover:bg-gray-50"
                    showNotes={showNotes}
                    onSpread={() =>
                      setSpreadRow({
                        category: "BL_INPUT",
                        bucketId: bucket?.bucketId ?? null,
                        rowId: row.rowId,
                        label: row.label,
                        months: row.months,
                      })
                    }
                  />
                );
              })}

              {/* BL Input subtotal (informational — see the official total below) */}
              <SubtotalRow
                label="BL Input total"
                totals={blTotals}
                showNotes={showNotes}
              />

              {/* ─── GAIA (ADMIN_INPUT) ─── */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={showNotes ? 15 : 14} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {config.actualsLabel}
                    </span>
                    {!grid.canEditActuals && <Lock size={10} className="text-gray-400" />}
                  </div>
                </td>
              </tr>

              {actuals.map((row) => {
                const onSpread = () =>
                  setSpreadRow({
                    category: "ADMIN_INPUT",
                    bucketId: null,
                    rowId: row.rowId,
                    label: row.label,
                    months: row.months,
                  });
                if (row.rowType === REVENUE_GAIA_FORECAST_TYPE) {
                  return (
                    <GaiaRevenueRow
                      key={row.rowId}
                      row={row}
                      grid={grid}
                      sel={sel}
                      rowIndex={rowIndex}
                      draggingRef={draggingRef}
                      sourceLevel={sourceLevel}
                      showNotes={showNotes}
                      onSpread={onSpread}
                    />
                  );
                }
                return (
                  <RevenueDataRow
                    key={row.rowId}
                    row={row}
                    category="ADMIN_INPUT"
                    level={LEVEL_DETAIL}
                    sourceLevel={sourceLevel}
                    bucketId={null}
                    readOnly={!grid.canEditActuals}
                    grid={grid}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    rowBg="bg-gray-50/40 group-hover:bg-gray-50"
                    showNotes={showNotes}
                    onSpread={onSpread}
                  />
                );
              })}

              {/* GAIA detail subtotal (the level-2 detail lines, informational) */}
              <SubtotalRow
                label={`${config.actualsLabel} detail total`}
                totals={otherActualsTotals}
                showNotes={showNotes}
              />

              {/* ─── Official revenue (source of truth, per month) ─── */}
              <tr className="bg-emerald-600 border-t-2 border-emerald-700">
                <td className="sticky left-0 z-10 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">
                  Official Revenue
                </td>
                {showNotes && <td className="bg-emerald-600" />}
                {MONTHS.map((m) => (
                  <td key={m} className="px-2.5 py-2.5 text-right align-middle">
                    <p className="text-sm font-bold text-white tabular-nums">
                      {officialTotals[m]
                        ? Math.round(officialTotals[m]).toLocaleString("en-CA")
                        : "—"}
                    </p>
                  </td>
                ))}
                <td className="px-2.5 py-2.5 text-right align-middle bg-emerald-700">
                  <p className="text-sm font-bold text-white tabular-nums">
                    {Math.round(sumMonths(officialTotals)).toLocaleString("en-CA")}
                  </p>
                </td>
              </tr>

              {/* Official revenue of the comparison reference (previous RFQ by
                  default) + the per-month variance against the current one. */}
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

// ─── BL Input section header (label + add-line control) ──────────────────────

function BlSectionHeader({
  showNotes,
  canAdd,
  onAdd,
}: {
  showNotes: boolean;
  canAdd: boolean;
  onAdd: (rowType: string) => void;
}) {
  return (
    <tr className="bg-gray-50/80 border-t border-gray-200">
      <td colSpan={showNotes ? 15 : 14} className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            BL Input
          </span>
          {canAdd && <AddLineControl onPick={onAdd} />}
        </div>
      </td>
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
      title="Add a Retainer, Project Fees or Product Fees line"
    >
      <Plus size={12} />
      Add line
    </button>
  );
}

// ─── Source-of-truth legend ──────────────────────────────────────────────────

function SourceOfTruthLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2.5 text-xs text-gray-600">
      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
        Source of truth
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-emerald-100 ring-1 ring-inset ring-emerald-300" />
        Official value (counted in the total)
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
    <tr className="bg-emerald-50/70 border-b border-emerald-100">
      <td className="sticky left-0 z-10 bg-emerald-50/70 px-4 py-2 pl-6 text-xs font-semibold text-emerald-800/80 uppercase tracking-wider">
        {label}
      </td>
      {showNotes && <td className="bg-emerald-50/70 border-b border-emerald-100" />}
      {MONTHS.map((m) => (
        <td key={m} className="px-2.5 py-2 text-right align-middle">
          <p className="text-sm font-medium text-emerald-900/70 tabular-nums">
            {loading && !totals ? "…" : fmtAmount(totals?.[m])}
          </p>
        </td>
      ))}
      <td className="px-2.5 py-2 text-right align-middle bg-emerald-100/50">
        <p className="text-sm font-semibold text-emerald-900/80 tabular-nums">
          {loading && !totals ? "…" : fmtAmount(annual)}
        </p>
      </td>
    </tr>
  );
}

// ─── Variance (current official − previous official) ─────────────────────────

function VarianceRow({
  totals,
  showNotes,
}: {
  totals: MonthlyMap;
  showNotes: boolean;
}) {
  // Signed amount, coloured by direction (gain green, drop red, flat grey).
  const cell = (value: number) => {
    const cls =
      value > 0
        ? "text-emerald-700"
        : value < 0
        ? "text-red-600"
        : "text-gray-300";
    const text =
      value === 0
        ? "—"
        : `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-CA")}`;
    return <p className={`text-sm font-medium tabular-nums ${cls}`}>{text}</p>;
  };
  const annual = sumMonths(totals);
  return (
    <tr className="bg-white border-b border-gray-200">
      <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Variance
      </td>
      {showNotes && <td className="bg-white border-b border-gray-200" />}
      {MONTHS.map((m) => (
        <td key={m} className="px-2.5 py-2 text-right align-middle">
          {cell(totals[m] ?? 0)}
        </td>
      ))}
      <td className="px-2.5 py-2 text-right align-middle bg-gray-50">
        {cell(annual)}
      </td>
    </tr>
  );
}

// ─── Editable data row (label + spread + 12 cells + total) ───────────────────

function RevenueDataRow({
  row,
  category,
  level,
  sourceLevel,
  bucketId,
  readOnly,
  removable = false,
  grid,
  sel,
  rowIndex,
  draggingRef,
  rowBg,
  showNotes,
  onSpread,
}: {
  row: ForecastRow;
  category: InputCategory;
  /** This row's source-of-truth level (LEVEL_DETAIL for GAIA details, LEVEL_BL for BL). */
  level: SourceLevel;
  /** The winning level per month, shared by the grid. */
  sourceLevel: Record<number, SourceLevel>;
  bucketId: string | null;
  readOnly: boolean;
  /** Shows a delete button (set on BL data rows; the GAIA section is fixed). */
  removable?: boolean;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  rowBg: string;
  showNotes: boolean;
  onSpread: () => void;
}) {
  const r = rowIndex.get(row.rowId)!;
  // Closed periods only lock BL cells, and only for users who can't edit them.
  const closedHere =
    category === "BL_INPUT" && !grid.canEditClosed ? grid.closedMonths : EMPTY_MONTHS;

  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 ${rowBg} px-4 py-1.5 border-b border-gray-100`}>
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm text-gray-700">{row.label}</span>
          {!readOnly && (
            <>
              <button
                onClick={onSpread}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-700 transition-all"
                title="Distribute an amount across months"
              >
                <SplitSquareHorizontal size={12} />
              </button>
              {removable && (
                <button
                  onClick={() => grid.removeRow(bucketId!, row.rowId)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all"
                  title="Remove this line (until saved)"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </>
          )}
        </div>
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
        const { official, overridden } = sourceCellState(level, sourceLevel[m], value);
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={value}
            readOnly={readOnly || closed}
            closed={closed}
            official={official}
            overridden={overridden}
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

// ─── GAIA Revenue row (top of the source-of-truth order) ─────────────────────
// The hand-entered top-line figure. Whenever it carries a value for a month it
// is that month's source of truth (highlighted green) and overrides the detail
// lines and BL below it. Empty months simply defer to the lower levels.

function GaiaRevenueRow({
  row,
  grid,
  sel,
  rowIndex,
  draggingRef,
  sourceLevel,
  showNotes,
  onSpread,
}: {
  row: ForecastRow;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  sourceLevel: Record<number, SourceLevel>;
  showNotes: boolean;
  onSpread: () => void;
}) {
  const r = rowIndex.get(row.rowId)!;
  const readOnly = !grid.canEditActuals;
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <tr className="group bg-emerald-50/20">
      <td className="sticky left-0 z-10 bg-emerald-50/30 group-hover:bg-emerald-50/60 px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm font-medium text-gray-800">{row.label}</span>
          {!readOnly && (
            <button
              onClick={onSpread}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-700 transition-all"
              title="Distribute an amount across months"
            >
              <SplitSquareHorizontal size={12} />
            </button>
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
        <NoteCell note={row.note} readOnly={readOnly} onClick={() => setNoteOpen(true)} />
      )}
      {MONTHS.map((m, ci) => {
        const value = row.months[m] ?? 0;
        const { official, overridden } = sourceCellState(
          LEVEL_GAIA,
          sourceLevel[m],
          value
        );
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
            value={value}
            readOnly={readOnly}
            official={official}
            overridden={overridden}
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

// ─── Commission row (calculated, read-only, per-month hover breakdown) ───────

function CommissionRow({
  row,
  bucketId,
  readOnly,
  grid,
  commission,
  sourceLevel,
  noRates,
  showNotes,
}: {
  row: ForecastRow;
  bucketId: string | null;
  readOnly: boolean;
  grid: UseForecasterGridResult;
  commission: CommissionBreakdown;
  /** The winning level per month — Commission is a BL (level-3) row. */
  sourceLevel: Record<number, SourceLevel>;
  /** No commission rates set for the year — flags the row (Commission stays 0). */
  noRates?: boolean;
  showNotes: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <tr className="group bg-indigo-50/30">
      <td className="sticky left-0 z-10 bg-indigo-50/40 group-hover:bg-indigo-50/70 px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm text-gray-700">Commission</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-indigo-100 text-indigo-600">
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
        const { official, overridden } = sourceCellState(LEVEL_BL, sourceLevel[m], value);
        return (
          <CommissionCell
            key={m}
            month={m}
            value={value}
            lines={commission.byMonth[m] ?? []}
            official={official}
            overridden={overridden}
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
  official,
  overridden,
}: {
  month: number;
  value: number;
  lines: CommissionBreakdown["byMonth"][number];
  /** Source of truth for its month — highlighted green. */
  official: boolean;
  /** Overridden by a higher source — struck through. */
  overridden: boolean;
}) {
  // Anchor rect captured on hover — the tooltip renders through a portal in
  // fixed position so it escapes the table's overflow-x clipping.
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  // Source-of-truth styling takes precedence over the default indigo look.
  const bg = anchor
    ? "ring-1 ring-inset ring-indigo-300 bg-indigo-50/60"
    : official
    ? "bg-emerald-100"
    : "";
  const text =
    value === 0
      ? "text-gray-300"
      : overridden
      ? "text-gray-400 line-through decoration-gray-400"
      : official
      ? "text-emerald-900 font-semibold"
      : "text-indigo-900/80";

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
        <CommissionTooltip month={month} value={value} lines={lines} anchor={anchor} />
      )}
    </td>
  );
}

/** Fixed-position breakdown popover, portalled to <body> to avoid clipping. */
function CommissionTooltip({
  month,
  value,
  lines,
  anchor,
}: {
  month: number;
  value: number;
  lines: CommissionBreakdown["byMonth"][number];
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
      {lines.length === 0 ? (
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
