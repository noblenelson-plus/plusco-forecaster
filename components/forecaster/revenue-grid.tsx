// components/forecaster/revenue-grid.tsx
"use client";

/**
 * Revenue grid — a flat, fixed-row variant of the forecast grid.
 *
 * Unlike Media/Labs there is no project notion: a single implicit bucket holds
 * one BL row per revenue stream (Retainer, Commission, Project Fees, Product
 * Fees), and the GAIA (admin) section adds Unallocated and Accrual. Rows are
 * seeded by `ensureRevenueShape`, so there is no add/remove UI.
 *
 * The BL Commission row is calculated (media spend × commission rate, same
 * submission) — read-only, with a per-month hover breakdown. The GAIA
 * Commission row is a normal manual entry.
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
  Info,
} from "lucide-react";
import type {
  ForecastRow,
  InputCategory,
} from "../../lib/types/forecaster.types";
import {
  REVENUE_AXIS_CONFIG,
  REVENUE_COMMISSION_TYPE,
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
import { MONTHS } from "../../lib/types/common.types";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { downloadAxisCSV } from "../../lib/format/forecast-csv";
import type { CommissionBreakdown } from "../../lib/format/revenue-commission";
import { SpreadsheetCell, TotalCell, formatMoney } from "./editable-cell";
import SpreadDialog from "./spread-dialog";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Shared empty set for rows with no closed months (avoids re-allocating). */
const EMPTY_MONTHS: Set<number> = new Set();

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

  const bucket = grid.data.buckets[0];
  const blRows = useMemo(() => bucket?.rows ?? [], [bucket]);
  const actuals = grid.data.actuals;

  const grandTotals = useMemo(() => grandMonthTotals(grid.data), [grid.data]);
  const actualsTotals = useMemo(() => monthTotals(actuals), [actuals]);

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
      <RevenueToolbar grid={grid} />

      {grid.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {grid.error}
        </div>
      )}

      {noRates && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <p>
            No commission rates are configured for this client this year, so the
            Commission row is 0. Set rates in{" "}
            <span className="font-semibold">Clients → commissions</span>.
          </p>
        </div>
      )}

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
              <SectionHeader label="BL Input" />
              {blRows.map((row) => {
                if (row.rowType === REVENUE_COMMISSION_TYPE) {
                  return <CommissionRow key={row.rowId} commission={commission} />;
                }
                return (
                  <RevenueDataRow
                    key={row.rowId}
                    row={row}
                    category="BL_INPUT"
                    bucketId={bucket?.bucketId ?? null}
                    readOnly={blReadOnly}
                    grid={grid}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    rowBg="bg-white group-hover:bg-gray-50"
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

              {/* BL grand total */}
              <tr className="bg-gray-900">
                <td className="sticky left-0 z-10 bg-gray-900 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                  Total
                </td>
                {MONTHS.map((m) => (
                  <td key={m} className="px-2.5 py-2 text-right align-middle">
                    <p className="text-sm font-bold text-white tabular-nums">
                      {grandTotals[m]
                        ? Math.round(grandTotals[m]).toLocaleString("en-CA")
                        : "—"}
                    </p>
                  </td>
                ))}
                <td className="px-2.5 py-2 text-right align-middle bg-gray-800">
                  <p className="text-sm font-bold text-yellow-400 tabular-nums">
                    {Math.round(sumMonths(grandTotals)).toLocaleString("en-CA")}
                  </p>
                </td>
              </tr>

              {/* ─── GAIA (ADMIN_INPUT) ─── */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={14} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {config.actualsLabel}
                    </span>
                    {!grid.canEditActuals && <Lock size={10} className="text-gray-400" />}
                  </div>
                </td>
              </tr>

              {actuals.map((row) => (
                <RevenueDataRow
                  key={row.rowId}
                  row={row}
                  category="ADMIN_INPUT"
                  bucketId={null}
                  readOnly={!grid.canEditActuals}
                  grid={grid}
                  sel={sel}
                  rowIndex={rowIndex}
                  draggingRef={draggingRef}
                  rowBg="bg-gray-50/40 group-hover:bg-gray-50"
                  onSpread={() =>
                    setSpreadRow({
                      category: "ADMIN_INPUT",
                      bucketId: null,
                      rowId: row.rowId,
                      label: row.label,
                      months: row.months,
                    })
                  }
                />
              ))}

              {/* GAIA total */}
              <tr className="bg-gray-100 border-b border-gray-200">
                <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1.5 pl-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {config.actualsLabel} total
                </td>
                {MONTHS.map((m) => (
                  <TotalCell key={m} value={actualsTotals[m] ?? 0} emphasis="bucket" />
                ))}
                <TotalCell value={sumMonths(actualsTotals)} emphasis="bucket" />
              </tr>
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

function RevenueToolbar({ grid }: { grid: UseForecasterGridResult }) {
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
      <div className="flex items-center gap-2">
        {grid.locked && (
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
            <Lock size={12} />
            RFQ locked — read only
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
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

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50/80 border-t border-gray-200">
      <td colSpan={14} className="px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          {label}
        </span>
      </td>
    </tr>
  );
}

// ─── Editable data row (label + spread + 12 cells + total) ───────────────────

function RevenueDataRow({
  row,
  category,
  bucketId,
  readOnly,
  grid,
  sel,
  rowIndex,
  draggingRef,
  rowBg,
  onSpread,
}: {
  row: ForecastRow;
  category: InputCategory;
  bucketId: string | null;
  readOnly: boolean;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  rowBg: string;
  onSpread: () => void;
}) {
  const r = rowIndex.get(row.rowId)!;
  // Closed periods only lock BL cells, and only for users who can't edit them.
  const closedHere =
    category === "BL_INPUT" && !grid.canEditClosed ? grid.closedMonths : EMPTY_MONTHS;

  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 ${rowBg} px-4 py-1.5 border-b border-gray-100`}>
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm text-gray-700">{row.label}</span>
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
      </td>
      {MONTHS.map((m, ci) => {
        const coord = { category, bucketId, rowId: row.rowId, month: m };
        const closed = closedHere.has(m);
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={row.months[m] ?? 0}
            readOnly={readOnly || closed}
            closed={closed}
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

function CommissionRow({ commission }: { commission: CommissionBreakdown }) {
  return (
    <tr className="group bg-indigo-50/30">
      <td className="sticky left-0 z-10 bg-indigo-50/40 group-hover:bg-indigo-50/70 px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-sm text-gray-700">Commission</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-indigo-100 text-indigo-600">
            <Sparkles size={10} />
            Calculated
          </span>
        </div>
      </td>
      {MONTHS.map((m) => (
        <CommissionCell
          key={m}
          month={m}
          value={commission.months[m] ?? 0}
          lines={commission.byMonth[m] ?? []}
        />
      ))}
      <TotalCell value={commission.annual} emphasis="row" />
    </tr>
  );
}

function CommissionCell({
  month,
  value,
  lines,
}: {
  month: number;
  value: number;
  lines: CommissionBreakdown["byMonth"][number];
}) {
  // Anchor rect captured on hover — the tooltip renders through a portal in
  // fixed position so it escapes the table's overflow-x clipping.
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <td className="px-0 py-0 border-b border-r border-gray-100 align-middle">
      <div className="px-1 py-1">
        <div
          ref={ref}
          onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
          onMouseLeave={() => setAnchor(null)}
          className={`w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md select-none cursor-help ${
            anchor ? "ring-1 ring-inset ring-indigo-300 bg-indigo-50/60" : ""
          } ${value === 0 ? "text-gray-300" : "text-indigo-900/80"}`}
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
