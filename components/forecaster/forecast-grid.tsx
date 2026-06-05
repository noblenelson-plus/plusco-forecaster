// components/forecaster/forecast-grid.tsx
"use client";

/**
 * Generic forecast grid — driven by an AxisConfig + the useForecasterGrid
 * hook. Used as-is by Media, then Revenue and Labs.
 *
 * Anatomy:
 *   [Toolbar]  add bucket · discard/save (+ dirty counter)
 *   [Table]    Jan → Dec + Total
 *     ├─ Bucket header — editable name + the bucket subtotal on the SAME row
 *     │    └─ Typed rows (SpreadsheetCell × 12 + row total) with a spread tool
 *     ├─ ... other buckets
 *     ├─ TOTAL (BL_INPUT grand total)
 *     └─ Actuals (ADMIN_INPUT — one row per type, admin-editable only)
 *
 * Data entry is spreadsheet-style: cells form a selectable grid (rows × 12
 * months) wired to useGridSelection — click/drag/Shift to select, Ctrl/Cmd+C/V
 * to copy & paste (round-trips with Excel via TSV), Ctrl/Cmd+D/R to fill,
 * arrows/Tab/Enter to navigate. The spread tool distributes one amount across
 * ticked months.
 *
 * Deletions (row/bucket) are local until Save — recoverable via Discard.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Lock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  FolderPlus,
  SplitSquareHorizontal,
  Download,
} from "lucide-react";
import type {
  AxisConfig,
  ForecastBucket,
  ForecastRow,
  InputCategory,
  RowTypeOption,
} from "../../lib/types/forecaster.types";
import { buildCellKey } from "../../lib/types/forecaster.types";
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
import { SpreadsheetCell, TotalCell } from "./editable-cell";
import SpreadDialog from "./spread-dialog";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Shared empty set for rows with no closed months (avoids re-allocating). */
const EMPTY_MONTHS: Set<number> = new Set();

interface ForecastGridProps {
  config: AxisConfig;
  grid: UseForecasterGridResult;
}

/** A single editable row in display order — BL rows first, then actuals. */
interface OrderedRow {
  rowId: string;
  category: InputCategory;
  bucketId: string | null;
}

export default function ForecastGrid({ config, grid }: ForecastGridProps) {
  const blReadOnly = grid.locked;

  const grandTotals = useMemo(() => grandMonthTotals(grid.data), [grid.data]);

  // Collapsed buckets — hidden rows are also excluded from the selection model
  // below so keyboard navigation / paste never reach rows you can't see.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (bucketId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(bucketId)) next.delete(bucketId);
      else next.add(bucketId);
      return next;
    });

  // ─── Selection model — flat ordered list of editable rows × 12 months ───
  const orderedRows = useMemo<OrderedRow[]>(() => {
    const list: OrderedRow[] = [];
    for (const bucket of grid.data.buckets) {
      if (collapsed.has(bucket.bucketId)) continue;
      for (const row of bucket.rows) {
        list.push({
          rowId: row.rowId,
          category: "BL_INPUT",
          bucketId: bucket.bucketId,
        });
      }
    }
    for (const row of grid.data.actuals) {
      list.push({
        rowId: row.rowId,
        category: "ADMIN_INPUT",
        bucketId: null,
      });
    }
    return list;
  }, [grid.data, collapsed]);

  const rowIndex = useMemo(
    () => new Map(orderedRows.map((r, i) => [r.rowId, i])),
    [orderedRows]
  );

  const descriptors = useMemo<GridRowDescriptor[]>(
    () =>
      orderedRows.map((r) => ({
        key: r.rowId,
        // Per-cell: actuals follow the admin flag; BL rows are locked when the
        // RFQ is locked or — for a BL — when the month is a closed period.
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

  // Shared drag flag — set on cell mousedown, cleared on window mouseup.
  const draggingRef = useRef(false);
  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  return (
    <div className="space-y-4">
      <GridToolbar config={config} grid={grid} />

      {grid.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {grid.error}
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
                  {config.bucketLabel} / {config.rowTypeLabel}
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
              {grid.data.buckets.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-gray-400">
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      No {config.bucketLabel.toLowerCase()} yet
                    </p>
                    <p className="text-xs">
                      {blReadOnly
                        ? "This RFQ is locked."
                        : `Add a ${config.bucketLabel.toLowerCase()} to start forecasting.`}
                    </p>
                  </td>
                </tr>
              ) : (
                grid.data.buckets.map((bucket) => (
                  <BucketSection
                    key={bucket.bucketId}
                    bucket={bucket}
                    config={config}
                    grid={grid}
                    readOnly={blReadOnly}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    collapsed={collapsed.has(bucket.bucketId)}
                    onToggleCollapse={() => toggleCollapse(bucket.bucketId)}
                  />
                ))
              )}

              {/* ─── BL_INPUT grand total ─── */}
              {grid.data.buckets.length > 0 && (
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
              )}

              {/* ─── Actuals (ADMIN_INPUT) — one row per type ─── */}
              <ActualsSection
                config={config}
                grid={grid}
                sel={sel}
                rowIndex={rowIndex}
                draggingRef={draggingRef}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function GridToolbar({
  config,
  grid,
}: {
  config: AxisConfig;
  grid: UseForecasterGridResult;
}) {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const [addingBucket, setAddingBucket] = useState(false);
  const [bucketName, setBucketName] = useState("");

  // Something to export only if any BL row or actuals row holds a line.
  const hasData =
    grid.data.buckets.some((b) => b.rows.length > 0) ||
    grid.data.actuals.length > 0;

  function submitBucket() {
    const name = bucketName.trim();
    if (name) grid.addBucket(name);
    setBucketName("");
    setAddingBucket(false);
  }

  function downloadCSV() {
    downloadAxisCSV(grid.data, config, {
      clientName: selectedClient?.CL_Name,
      year: selectedYear,
      rfqType: selectedRFQ?.type,
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left — lock badge */}
      <div className="flex items-center gap-2">
        {grid.locked && (
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
            <Lock size={12} />
            RFQ locked — read only
          </span>
        )}
      </div>

      {/* Right — add bucket + discard/save */}
      <div className="flex items-center gap-2">
        {!grid.locked &&
          config.allowMultipleBuckets &&
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
                placeholder={`${config.bucketLabel} name...`}
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
              Add {config.bucketLabel.toLowerCase()}
            </button>
          ))}

        <button
          onClick={downloadCSV}
          disabled={!hasData}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
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

// ─── Inline "add row type" select (shared by bucket & actuals) ───────────────

function AddRowTypeSelect({
  label,
  options,
  onPick,
}: {
  label: string;
  options: RowTypeOption[];
  onPick: (rowType: string) => void;
}) {
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
            {label}...
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
      disabled={options.length === 0}
      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-40 transition-colors"
    >
      <Plus size={12} />
      {label}
    </button>
  );
}

/** Row types still available given the rows already present (no duplicates). */
function availableTypes(
  config: AxisConfig,
  rows: ForecastRow[]
): RowTypeOption[] {
  if (config.allowDuplicateRowTypes) return config.rowTypeOptions;
  return config.rowTypeOptions.filter(
    (o) => !rows.some((r) => r.rowType === o.value)
  );
}

// ─── A data row (BL or actuals) — label + spread button + 12 cells + total ──

function DataRow({
  row,
  category,
  bucketId,
  readOnly,
  grid,
  sel,
  rowIndex,
  draggingRef,
  rowBg,
  labelClass,
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
  /** Sticky-cell background — must be opaque to cover scrolled content. */
  rowBg: string;
  labelClass: string;
  onSpread: () => void;
}) {
  const r = rowIndex.get(row.rowId)!;
  // Closed periods only lock BL_INPUT cells, and only for users who can't edit
  // them (BLs). Actuals are admin-only already, so they are never "closed".
  const closedHere =
    category === "BL_INPUT" && !grid.canEditClosed
      ? grid.closedMonths
      : EMPTY_MONTHS;

  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 ${rowBg} px-4 py-1.5 border-b border-gray-100`}>
        <div className="flex items-center gap-1.5 pl-2">
          <span className={`text-sm ${labelClass}`}>{row.label}</span>
          {!readOnly && (
            <>
              <button
                onClick={onSpread}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-700 transition-all"
                title="Distribute an amount across months"
              >
                <SplitSquareHorizontal size={12} />
              </button>
              <button
                onClick={() =>
                  category === "ADMIN_INPUT"
                    ? grid.removeActualsRow(row.rowId)
                    : grid.removeRow(bucketId!, row.rowId)
                }
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all"
                title="Remove row (until saved)"
              >
                <Trash2 size={11} />
              </button>
            </>
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

// ─── Bucket section (header with inline subtotal + rows) ─────────────────────

function BucketSection({
  bucket,
  config,
  grid,
  readOnly,
  sel,
  rowIndex,
  draggingRef,
  collapsed,
  onToggleCollapse,
}: {
  bucket: ForecastBucket;
  config: AxisConfig;
  grid: UseForecasterGridResult;
  readOnly: boolean;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const bucketTotals = useMemo(() => monthTotals(bucket.rows), [bucket.rows]);
  const types = availableTypes(config, bucket.rows);
  const [spreadRow, setSpreadRow] = useState<ForecastRow | null>(null);

  return (
    <>
      {/* Bucket header — name + controls on the left, subtotal across the row */}
      <tr className="bg-gray-50/80 border-t border-gray-200">
        <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleCollapse}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 transition-colors flex-shrink-0"
              title={collapsed ? "Expand project" : "Collapse project"}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
            <input
              type="text"
              value={bucket.name}
              disabled={readOnly}
              onChange={(e) => grid.renameBucket(bucket.bucketId, e.target.value)}
              className="font-semibold text-gray-900 text-sm bg-transparent border border-transparent rounded-md px-1.5 py-0.5 min-w-0 flex-1
                hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white
                disabled:hover:border-transparent"
            />

            {!readOnly && (
              <>
                <AddRowTypeSelect
                  label={config.rowTypeLabel}
                  options={types}
                  onPick={(rowType) => grid.addRow(bucket.bucketId, rowType)}
                />
                <button
                  onClick={() => grid.removeBucket(bucket.bucketId)}
                  className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title={`Remove ${config.bucketLabel.toLowerCase()} (until saved)`}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </td>
        {MONTHS.map((m) => (
          <TotalCell key={m} value={bucketTotals[m] ?? 0} emphasis="bucket" />
        ))}
        <TotalCell value={sumMonths(bucketTotals)} emphasis="bucket" />
      </tr>

      {/* Rows — hidden while the project is collapsed */}
      {!collapsed &&
        (bucket.rows.length === 0 ? (
          <tr>
            <td colSpan={14} className="px-8 py-2.5 text-xs text-gray-400 border-b border-gray-100">
              No {config.rowTypeLabel.toLowerCase()} yet — add one above.
            </td>
          </tr>
        ) : (
          bucket.rows.map((row) => (
            <DataRow
              key={row.rowId}
              row={row}
              category="BL_INPUT"
              bucketId={bucket.bucketId}
              readOnly={readOnly}
              grid={grid}
              sel={sel}
              rowIndex={rowIndex}
              draggingRef={draggingRef}
              rowBg="bg-white group-hover:bg-gray-50"
              labelClass="text-gray-700"
              onSpread={() => setSpreadRow(row)}
            />
          ))
        ))}

      {spreadRow && (
        <SpreadDialog
          rowLabel={`${bucket.name} · ${spreadRow.label}`}
          months={spreadRow.months}
          lockedMonths={grid.canEditClosed ? undefined : grid.closedMonths}
          onClose={() => setSpreadRow(null)}
          onApply={(updates) =>
            grid.setCells(
              updates.map((u) => ({
                coord: {
                  category: "BL_INPUT" as const,
                  bucketId: bucket.bucketId,
                  rowId: spreadRow.rowId,
                  month: u.month,
                },
                value: u.value,
              }))
            )
          }
        />
      )}
    </>
  );
}

// ─── Actuals section (ADMIN_INPUT — typed rows, no bucket) ───────────────────

function ActualsSection({
  config,
  grid,
  sel,
  rowIndex,
  draggingRef,
}: {
  config: AxisConfig;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
}) {
  const actuals = grid.data.actuals;
  const readOnly = !grid.canEditActuals;
  const totals = useMemo(() => monthTotals(actuals), [actuals]);
  const types = availableTypes(config, actuals);
  const [spreadRow, setSpreadRow] = useState<ForecastRow | null>(null);

  return (
    <>
      {/* Section header */}
      <tr className="bg-gray-50 border-t-2 border-gray-200">
        <td colSpan={14} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {config.actualsLabel}
            </span>
            {readOnly && <Lock size={10} className="text-gray-400" />}
            {!readOnly && (
              <AddRowTypeSelect
                label={config.rowTypeLabel}
                options={types}
                onPick={(rowType) => grid.addActualsRow(rowType)}
              />
            )}
          </div>
        </td>
      </tr>

      {/* Actuals rows */}
      {actuals.length === 0 ? (
        <tr>
          <td colSpan={14} className="px-8 py-2.5 text-xs text-gray-400 bg-gray-50/40 border-b border-gray-100">
            {readOnly
              ? "No actuals recorded."
              : `No actuals yet — add a ${config.rowTypeLabel.toLowerCase()} above.`}
          </td>
        </tr>
      ) : (
        actuals.map((row) => (
          <DataRow
            key={row.rowId}
            row={row}
            category="ADMIN_INPUT"
            bucketId={null}
            readOnly={readOnly}
            grid={grid}
            sel={sel}
            rowIndex={rowIndex}
            draggingRef={draggingRef}
            rowBg="bg-gray-50/40 group-hover:bg-gray-50"
            labelClass="text-gray-700"
            onSpread={() => setSpreadRow(row)}
          />
        ))
      )}

      {/* Actuals total */}
      {actuals.length > 0 && (
        <tr className="bg-gray-100 border-b border-gray-200">
          <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1.5 pl-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            {config.actualsLabel} total
          </td>
          {MONTHS.map((m) => (
            <TotalCell key={m} value={totals[m] ?? 0} emphasis="bucket" />
          ))}
          <TotalCell value={sumMonths(totals)} emphasis="bucket" />
        </tr>
      )}

      {spreadRow && (
        <SpreadDialog
          rowLabel={`${config.actualsLabel} · ${spreadRow.label}`}
          months={spreadRow.months}
          onClose={() => setSpreadRow(null)}
          onApply={(updates) =>
            grid.setCells(
              updates.map((u) => ({
                coord: {
                  category: "ADMIN_INPUT" as const,
                  bucketId: null,
                  rowId: spreadRow.rowId,
                  month: u.month,
                },
                value: u.value,
              }))
            )
          }
        />
      )}
    </>
  );
}
