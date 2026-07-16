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

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  Eye,
  EyeOff,
  StickyNote,
} from "lucide-react";
import type {
  AxisConfig,
  ForecastBucket,
  ForecastRow,
  InputCategory,
  RowDetail,
  RowTypeOption,
} from "../../lib/types/forecaster.types";
import {
  buildCellKey,
  DETAIL_LEVEL_COUNT,
  GENERAL_PROJECT_NAME,
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
import { MONTHS } from "../../lib/types/common.types";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { downloadAxisCSV } from "../../lib/format/forecast-csv";
import { actualsTheme } from "../../lib/format/actuals-theme";
import { SpreadsheetCell, TotalCell } from "./editable-cell";
import SpreadDialog from "./spread-dialog";
import NoteDialog from "./note-dialog";
import RowActionsMenu from "./row-actions-menu";
import SelectionTotal from "./selection-total";
import SaveStatusIndicator from "./save-status";
import GridLastUpdated from "./grid-last-updated";
import MediaboxActualsSection, {
  axisHasMediabox,
} from "./mediabox-actuals-section";
import {
  useMediaboxTotals,
  type UseMediaboxTotalsResult,
} from "../../lib/hooks/use-mediabox-totals";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Shared empty set for rows with no closed months (avoids re-allocating). */
const EMPTY_MONTHS: Set<number> = new Set();

/**
 * Presentation-only per-row extras, resolved by the page from a row's type.
 * Labs uses it to surface each partner's media type (badge), description
 * (tooltip) and a cap warning; Media leaves it undefined. Kept off AxisConfig
 * on purpose — it's a rendering concern, not data the hook needs.
 */
export interface RowMeta {
  /** Small chip shown after the label — e.g. the partner's media type. */
  badge?: string;
  /**
   * Secondary description shown inline, muted, after the label — e.g. the
   * partner's description. Disambiguates rows that share a label (two Labs
   * partners with the same name and media type).
   */
  description?: string;
}

interface ForecastGridProps {
  config: AxisConfig;
  grid: UseForecasterGridResult;
  /** Optional per-row extras (badge/tooltip/warning), resolved by row type. */
  rowMeta?: (rowType: string) => RowMeta | undefined;
}

/**
 * A single editable row in display order — BL rows first, then actuals (each
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

export default function ForecastGrid({ config, grid, rowMeta }: ForecastGridProps) {
  const blReadOnly = grid.locked;

  // Client/year drive the read-only MediaBox actuals section under MediaOcean.
  const { selectedClient, selectedYear } = useForecastSelection();

  // MediaBox totals — owned here (not by the section) so the CSV export can
  // include the same rows. Disabled (undefined client) on axes without a
  // MediaBox section, e.g. Revenue.
  const mediabox = useMediaboxTotals(
    axisHasMediabox(config.axisId) ? selectedClient?.cl_id : undefined,
    selectedYear
  );

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

  // Expanded actuals rows — their detail lines are shown (and, like collapsed
  // buckets, only the visible detail cells join the selection model below).
  const [expandedActuals, setExpandedActuals] = useState<Set<string>>(new Set());
  const toggleActualsExpand = (rowId: string) =>
    setExpandedActuals((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  // Notes column visibility — persisted so the choice sticks across reloads.
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
  // Label + 12 months + Total (+ Notes when shown) — used for full-width rows.
  const colCount = showNotes ? 15 : 14;

  // ─── Selection model — flat ordered list of editable rows × 12 months ───
  const orderedRows = useMemo<OrderedRow[]>(() => {
    const list: OrderedRow[] = [];
    for (const bucket of grid.data.buckets) {
      if (collapsed.has(bucket.bucketId)) continue;
      for (const row of bucket.rows) {
        list.push({
          key: row.rowId,
          rowId: row.rowId,
          category: "BL_INPUT",
          bucketId: bucket.bucketId,
        });
      }
    }
    for (const row of grid.data.actuals) {
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
    }
    return list;
  }, [grid.data, collapsed, expandedActuals]);

  const rowIndex = useMemo(
    () => new Map(orderedRows.map((r, i) => [r.key, i])),
    [orderedRows]
  );

  const descriptors = useMemo<GridRowDescriptor[]>(
    () =>
      orderedRows.map((r) => ({
        key: r.key,
        // Per-cell: actuals (and their details) follow the admin flag — except
        // a parent with detail lines, whose months are derived (row = Σ
        // details); BL rows are locked when the RFQ is locked or — for a BL —
        // on a closed month.
        cellReadOnly: (col: number) => {
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

  // Shared drag flag — set on cell mousedown, cleared on window mouseup.
  const draggingRef = useRef(false);
  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // A lone project is always named "General" (its name field is locked below).
  // Load-time seeding/naming is handled by the grid's normalizeLoaded; this
  // keeps it correct after the user deletes back down to a single project
  // mid-session. No-op once a second project exists (names are then editable).
  useEffect(() => {
    if (blReadOnly || !config.allowMultipleBuckets) return;
    const buckets = grid.data.buckets;
    if (buckets.length === 1 && buckets[0].name !== GENERAL_PROJECT_NAME) {
      grid.renameBucket(buckets[0].bucketId, GENERAL_PROJECT_NAME);
    }
  }, [grid.data.buckets, blReadOnly, config.allowMultipleBuckets, grid.renameBucket]);

  return (
    <div className="space-y-4">
      <GridToolbar
        config={config}
        grid={grid}
        mediabox={mediabox}
        showNotes={showNotes}
        onToggleNotes={toggleNotes}
      />

      {grid.error && (
        <div className="bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg text-sm">
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
          // Bounded height makes this the vertical scroller too (it is already
          // the horizontal one via overflow), so the sticky header row below can
          // pin to the top — Excel-style frozen header + frozen first column.
          className="bg-white border border-gray-200 rounded-xl overflow-auto max-h-[calc(100vh-14rem)]"
          onKeyDown={sel.onKeyDown}
          onCopy={sel.onCopy}
          onPaste={sel.onPaste}
        >
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50">
                {/* Corner cell — frozen on both axes, above every other sticky cell. */}
                <th className="sticky left-0 top-0 z-30 bg-gray-50 text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs w-52 border-b border-gray-200">
                  {config.bucketLabel} / {config.rowTypeLabel}
                </th>
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
              {/* ─── Section 1 — BL Submission (the editable forecast) ─── */}
              <SectionBand label="BL Submission" colSpan={colCount} />

              {grid.data.buckets.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center text-gray-400">
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
                    rowMeta={rowMeta}
                    readOnly={blReadOnly}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    collapsed={collapsed.has(bucket.bucketId)}
                    onToggleCollapse={() => toggleCollapse(bucket.bucketId)}
                    showNotes={showNotes}
                    lockName={
                      config.allowMultipleBuckets &&
                      grid.data.buckets.length === 1
                    }
                  />
                ))
              )}

              {/* ─── BL_INPUT grand total ─── */}
              {grid.data.buckets.length > 0 && (
                <tr className="bg-gray-900">
                  <td className="sticky left-0 z-10 bg-gray-900 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                    BL Submission
                    <span className="ml-1.5 font-medium normal-case tracking-normal text-gray-300">
                      · current submission
                    </span>
                  </td>
                  {showNotes && <td className="bg-gray-900" />}
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

              {/* ─── Section 2 — Reference data (MediaOcean + MediaBox) ─── */}
              <SectionBand label="Reference Data" colSpan={colCount} gap />

              {/* ─── Actuals (ADMIN_INPUT) — one row per type ─── */}
              <ActualsSection
                config={config}
                grid={grid}
                rowMeta={rowMeta}
                sel={sel}
                rowIndex={rowIndex}
                draggingRef={draggingRef}
                showNotes={showNotes}
                expandedActuals={expandedActuals}
                onToggleExpand={toggleActualsExpand}
              />

              {/* ─── MediaBox actuals (read-only, synced) — under MediaOcean ─── */}
              <MediaboxActualsSection
                axisId={config.axisId}
                year={selectedYear}
                showNotes={showNotes}
                mediabox={mediabox}
              />
            </tbody>
          </table>
        </div>
      )}

      <SelectionTotal
        count={sel.selectionStats.count}
        sum={sel.selectionStats.sum}
      />
    </div>
  );
}

// ─── Top-level section band ──────────────────────────────────────────────────

/**
 * Splits the table into its two top-level sections: "BL Submission" (the
 * editable forecast) and "Reference Data" (MediaOcean + MediaBox, read-only
 * sources). Heavier than the per-source bands (orange/blue) nested under it.
 */
function SectionBand({
  label,
  colSpan,
  gap = false,
}: {
  label: string;
  colSpan: number;
  /** Thick light top border — visually detaches this section from the previous one. */
  gap?: boolean;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`p-0 bg-gray-200 border-y border-gray-300 ${
          gap ? "border-t-8 border-t-gray-100" : ""
        }`}
      >
        <div className="sticky left-0 z-10 flex w-fit items-center px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-700">
            {label}
          </span>
        </div>
      </td>
    </tr>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function GridToolbar({
  config,
  grid,
  mediabox,
  showNotes,
  onToggleNotes,
}: {
  config: AxisConfig;
  grid: UseForecasterGridResult;
  mediabox: UseMediaboxTotalsResult;
  showNotes: boolean;
  onToggleNotes: () => void;
}) {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const [addingBucket, setAddingBucket] = useState(false);
  const [bucketName, setBucketName] = useState("");

  // MediaBox rows for the export — same grouping as the grid section (media
  // type on the Media axis, LABS partner on Labs; empty on Revenue).
  const mediaboxRows = mediabox.cad
    ? config.axisId === "labs"
      ? mediabox.cad.labsByPartner
      : mediabox.cad.mediaByType
    : [];

  // Something to export only if a BL, actuals or MediaBox row holds a line.
  const hasData =
    grid.data.buckets.some((b) => b.rows.length > 0) ||
    grid.data.actuals.length > 0 ||
    mediaboxRows.length > 0;

  function submitBucket() {
    const name = bucketName.trim();
    if (name) grid.addBucket(name);
    setBucketName("");
    setAddingBucket(false);
  }

  function downloadCSV() {
    downloadAxisCSV(
      grid.data,
      config,
      {
        clientName: selectedClient?.CL_Name,
        year: selectedYear,
        rfqType: selectedRFQ?.type,
      },
      mediaboxRows
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left — lock badge + last-updated stamps */}
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
          actualsLabel={config.actualsLabel}
        />
      </div>

      {/* Right — autosave status + add bucket + discard/save */}
      <div className="flex items-center gap-2">
        {!grid.locked && <SaveStatusIndicator status={grid.saveStatus} />}

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
              {[o.label, o.hint, o.description].filter(Boolean).join(" · ")}
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

/**
 * A row whose type is no longer offered by the axis config — e.g. a Labs partner
 * removed from the year's admin/labs setup. Its data is kept (the row keeps its
 * stored label) but it can't be re-selected; the grid flags it. Guarded on a
 * non-empty option list so rows aren't flagged while options are still loading;
 * Media types are always present, so this never triggers there.
 */
function isRetiredType(config: AxisConfig, rowType: string): boolean {
  return (
    config.rowTypeOptions.length > 0 &&
    !config.rowTypeOptions.some((o) => o.value === rowType)
  );
}

// ─── A data row (BL or actuals) — label + spread button + 12 cells + total ──

function DataRow({
  row,
  category,
  bucketId,
  readOnly,
  monthsDerived = false,
  grid,
  sel,
  rowIndex,
  draggingRef,
  rowBg,
  labelClass,
  retired,
  meta,
  onSpread,
  showNotes,
  expand,
}: {
  row: ForecastRow;
  category: InputCategory;
  bucketId: string | null;
  readOnly: boolean;
  /** The months are derived from the detail lines (row = Σ details) — cells
   *  read-only, Distribute hidden. */
  monthsDerived?: boolean;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  /** Sticky-cell background — must be opaque to cover scrolled content. */
  rowBg: string;
  labelClass: string;
  /** Type no longer offered by the config (e.g. a removed Labs partner). */
  retired?: boolean;
  /** Presentation extras (badge/tooltip/warning) for this row. */
  meta?: RowMeta;
  onSpread: () => void;
  showNotes: boolean;
  /** Expand/collapse control for rows that carry detail lines (actuals only). */
  expand?: { expanded: boolean; onToggle: () => void; count: number };
}) {
  const r = rowIndex.get(row.rowId)!;
  // Closed periods only lock BL_INPUT cells, and only for users who can't edit
  // them (BLs). Actuals are admin-only already, so they are never "closed".
  const closedHere =
    category === "BL_INPUT" && !grid.canEditClosed
      ? grid.closedMonths
      : EMPTY_MONTHS;

  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 ${rowBg} px-4 py-1.5 border-b border-gray-100`}>
        <div className={`flex items-center gap-1.5 ${expand ? "" : "pl-2"}`}>
          {expand && (
            <button
              onClick={expand.onToggle}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
              title={expand.expanded ? "Hide detail" : "Show detail"}
            >
              {expand.expanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          )}
          <span className={`text-sm ${labelClass}`}>{row.label}</span>
          {expand && expand.count > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-gray-200 text-gray-500">
              {expand.count}
            </span>
          )}
          {/* Media-type chip (Labs). */}
          {meta?.badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500">
              {meta.badge}
            </span>
          )}
          {/* Description (Labs) — inline, muted; disambiguates same-named partners. */}
          {meta?.description && (
            <span
              title={meta.description}
              className="min-w-0 truncate text-xs italic text-gray-400"
            >
              {meta.description}
            </span>
          )}
          {retired && (
            <span
              title="No longer configured — kept for its existing data, but can't be re-added."
              className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-yellow-400 text-gray-900"
            >
              Not configured
            </span>
          )}
          {!readOnly && (
            <RowActionsMenu
              ariaLabel={`Actions for ${row.label}`}
              actions={[
                // Distribute writes the parent's months — meaningless when they
                // are derived from the detail lines.
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
                {
                  label: "Remove",
                  icon: <Trash2 size={14} />,
                  danger: true,
                  onClick: () =>
                    category === "ADMIN_INPUT"
                      ? grid.removeActualsRow(row.rowId)
                      : grid.removeRow(bucketId!, row.rowId),
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
            onSave={(note) => grid.setRowNote(category, bucketId, row.rowId, note)}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </td>
      {showNotes && (
        <NoteCell
          note={row.note}
          readOnly={readOnly}
          onClick={() => setNoteOpen(true)}
        />
      )}
      {MONTHS.map((m, ci) => {
        const coord = { category, bucketId, rowId: row.rowId, month: m };
        const closed = closedHere.has(m);
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={row.months[m] ?? 0}
            readOnly={readOnly || closed || monthsDerived}
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

// ─── Note cell — the note rendered as its own grid column ───────────────────

/**
 * A row's note shown in the dedicated Notes column: the full text (clamped to
 * two lines, full text on hover via `title`), click to view/edit through the
 * NoteDialog. Empty + editable shows a faint "Add a note" affordance.
 */
export function NoteCell({
  note,
  readOnly,
  onClick,
  inverse = false,
}: {
  note?: string;
  readOnly: boolean;
  onClick: () => void;
  /** Rendered on a dark row (e.g. the Official Revenue row) — light text. */
  inverse?: boolean;
}) {
  const hasNote = !!note;
  return (
    <td
      className={`px-2 py-1.5 border-b align-middle ${
        inverse ? "border-gray-700" : "border-gray-100"
      }`}
    >
      <button
        onClick={onClick}
        disabled={readOnly && !hasNote}
        title={hasNote ? note : undefined}
        className={`w-full text-left text-xs leading-snug line-clamp-2 break-words rounded px-1.5 py-1 transition-colors ${
          hasNote
            ? inverse
              ? "text-gray-100 hover:bg-gray-800"
              : "text-gray-600 hover:bg-gray-100"
            : readOnly
              ? "cursor-default"
              : inverse
                ? "italic text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                : "italic text-gray-300 hover:text-gray-500 hover:bg-gray-100"
        }`}
      >
        {hasNote ? note : readOnly ? "" : "Add a note…"}
      </button>
    </td>
  );
}

// ─── Bucket section (header with inline subtotal + rows) ─────────────────────

function BucketSection({
  bucket,
  config,
  grid,
  rowMeta,
  readOnly,
  sel,
  rowIndex,
  draggingRef,
  collapsed,
  onToggleCollapse,
  showNotes,
  lockName,
}: {
  bucket: ForecastBucket;
  config: AxisConfig;
  grid: UseForecasterGridResult;
  rowMeta?: (rowType: string) => RowMeta | undefined;
  readOnly: boolean;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showNotes: boolean;
  /** Lone project — its name is auto-managed ("General") and not editable, and
   *  it can't be removed. Lifted once a second project exists. */
  lockName: boolean;
}) {
  const bucketTotals = useMemo(() => monthTotals(bucket.rows), [bucket.rows]);
  const types = availableTypes(config, bucket.rows);
  const [spreadRow, setSpreadRow] = useState<ForecastRow | null>(null);

  return (
    <>
      {/* Bucket header — name + controls on the left, subtotal across the row */}
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
                  ? `The single ${config.bucketLabel.toLowerCase()} is always named "${GENERAL_PROJECT_NAME}" — add another ${config.bucketLabel.toLowerCase()} to enable renaming.`
                  : undefined
              }
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
                {/* The lone "General" project can't be removed — adding a second
                    project is what unlocks naming and removal. */}
                {!lockName && (
                  <button
                    onClick={() => grid.removeBucket(bucket.bucketId)}
                    className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors"
                    title={`Remove ${config.bucketLabel.toLowerCase()} (until saved)`}
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
          <TotalCell key={m} value={bucketTotals[m] ?? 0} emphasis="bucket" />
        ))}
        <TotalCell value={sumMonths(bucketTotals)} emphasis="bucket" />
      </tr>

      {/* Rows — hidden while the project is collapsed */}
      {!collapsed &&
        (bucket.rows.length === 0 ? (
          <tr>
            <td colSpan={showNotes ? 15 : 14} className="px-8 py-2.5 text-xs text-gray-400 border-b border-gray-100">
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
              retired={isRetiredType(config, row.rowType)}
              meta={rowMeta?.(row.rowType)}
              onSpread={() => setSpreadRow(row)}
              showNotes={showNotes}
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

// ─── Detail line — a breakdown row under an actuals row ──────────────────────

/**
 * One breakdown line of an actuals row: DETAIL_LEVEL_COUNT header-less free-text
 * info slots (project name, admin number… — meaning is up to the user) followed
 * by its own 12-month budget. The budget cells join the spreadsheet selection
 * (paste/fill/keyboard) like any other; the budget is an annotation and never
 * rolls into the parent row's total.
 *
 * Exported so the Revenue grid (a separate component) reuses the exact same
 * detail row under its GAIA/ADMIN_INPUT lines.
 */
export function DetailRow({
  parentRowId,
  detail,
  readOnly,
  grid,
  sel,
  rowIndex,
  draggingRef,
  showNotes,
}: {
  parentRowId: string;
  detail: RowDetail;
  readOnly: boolean;
  grid: UseForecasterGridResult;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  showNotes: boolean;
}) {
  const r = rowIndex.get(detail.detailId)!;

  // Read-only viewers (BLs) see only the filled levels: with levels 2/3 empty,
  // level 1 stretches across the whole line instead of truncating at its fixed
  // editing width. Editors always get the 3 fixed slots.
  let visibleLevels = DETAIL_LEVEL_COUNT;
  if (readOnly) {
    visibleLevels = 1;
    for (let i = DETAIL_LEVEL_COUNT - 1; i >= 1; i--) {
      if ((detail.levels[i] ?? "").trim() !== "") {
        visibleLevels = i + 1;
        break;
      }
    }
  }
  const stretch = readOnly && visibleLevels < DETAIL_LEVEL_COUNT;

  return (
    <tr className="group bg-white">
      {/* Detail lines stay quiet — plain white, deeper indent, muted text — so
          they read as secondary breakdowns under their parent actuals row. The
          sticky cell is OPAQUE so it covers scrolled content during horizontal
          scroll. */}
      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-1 border-b border-gray-100">
        <div className="flex items-center gap-1.5 pl-8">
          {/* In stretch mode the container keeps the editing layout's width
              (3 × w-36 + gaps) as a minimum, so the label column doesn't
              shrink and level 1 stays fully readable. */}
          <div className={`flex items-center gap-1.5 ${stretch ? "flex-1 min-w-[28rem]" : ""}`}>
            {Array.from({ length: visibleLevels }, (_, i) => (
              <input
                key={i}
                type="text"
                value={detail.levels[i] ?? ""}
                disabled={readOnly}
                title={readOnly ? detail.levels[i] ?? "" : undefined}
                onChange={(e) =>
                  grid.setActualsDetailLevel(
                    parentRowId,
                    detail.detailId,
                    i,
                    e.target.value
                  )
                }
                className={`${stretch ? "flex-1 min-w-0" : "w-36"} px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded
                  hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent
                  disabled:bg-transparent disabled:border-transparent`}
              />
            ))}
          </div>
          {!readOnly && (
            <button
              onClick={() =>
                grid.removeActualsDetail(parentRowId, detail.detailId)
              }
              className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Remove detail line (until saved)"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </td>
      {showNotes && <td className="bg-white border-b border-gray-100" />}
      {MONTHS.map((m, ci) => {
        const coord = {
          category: "ADMIN_INPUT" as const,
          bucketId: null,
          rowId: parentRowId,
          detailId: detail.detailId,
          month: m,
        };
        return (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={detail.months[m] ?? 0}
            readOnly={readOnly}
            closed={false}
            explicitZero={hasExplicitZero(detail, m)}
            dirty={grid.dirtyMap.has(buildCellKey(coord))}
            sel={sel}
            draggingRef={draggingRef}
          />
        );
      })}
      <TotalCell value={sumMonths(detail.months)} emphasis="row" />
    </tr>
  );
}

// ─── Actuals section (ADMIN_INPUT — typed rows, no bucket) ───────────────────

function ActualsSection({
  config,
  grid,
  rowMeta,
  sel,
  rowIndex,
  draggingRef,
  showNotes,
  expandedActuals,
  onToggleExpand,
}: {
  config: AxisConfig;
  grid: UseForecasterGridResult;
  rowMeta?: (rowType: string) => RowMeta | undefined;
  sel: ReturnType<typeof useGridSelection>;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
  showNotes: boolean;
  expandedActuals: Set<string>;
  onToggleExpand: (rowId: string) => void;
}) {
  const actuals = grid.data.actuals;
  const readOnly = !grid.canEditActuals;
  const totals = useMemo(() => monthTotals(actuals), [actuals]);
  const types = availableTypes(config, actuals);
  const [spreadRow, setSpreadRow] = useState<ForecastRow | null>(null);
  const colCount = showNotes ? 15 : 14;
  // Per-source colour: MediaOcean → orange, GAIA → purple, others → grey.
  const theme = actualsTheme(config.actualsLabel);

  return (
    <>
      {/* Section header — opaque fill; the label is pinned left so it stays
          visible while scrolling the months horizontally. */}
      <tr className={theme.headerRow}>
        <td colSpan={showNotes ? 15 : 14} className="p-0">
          <div className="sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.headerText}`}>
              {config.actualsLabel}
            </span>
            {readOnly && <Lock size={10} className={theme.lockIcon} />}
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
          <td colSpan={showNotes ? 15 : 14} className={`px-8 py-2.5 text-xs ${theme.labelClass} ${theme.emptyRow}`}>
            {readOnly
              ? "No admin input recorded."
              : `No admin input yet — add a ${config.rowTypeLabel.toLowerCase()} above.`}
          </td>
        </tr>
      ) : (
        actuals.map((row) => {
          const details = row.details ?? [];
          const expanded = expandedActuals.has(row.rowId);
          // Nothing to expand for a read-only viewer with no details yet.
          const canExpand = !readOnly || details.length > 0;
          return (
            <Fragment key={row.rowId}>
              <DataRow
                row={row}
                category="ADMIN_INPUT"
                bucketId={null}
                readOnly={readOnly}
                monthsDerived={details.length > 0}
                grid={grid}
                sel={sel}
                rowIndex={rowIndex}
                draggingRef={draggingRef}
                rowBg={theme.rowBg}
                labelClass={theme.labelClass}
                retired={isRetiredType(config, row.rowType)}
                meta={rowMeta?.(row.rowType)}
                onSpread={() => setSpreadRow(row)}
                showNotes={showNotes}
                expand={
                  canExpand
                    ? {
                        expanded,
                        onToggle: () => onToggleExpand(row.rowId),
                        count: details.length,
                      }
                    : undefined
                }
              />
              {expanded &&
                details.map((detail) => (
                  <DetailRow
                    key={detail.detailId}
                    parentRowId={row.rowId}
                    detail={detail}
                    readOnly={readOnly}
                    grid={grid}
                    sel={sel}
                    rowIndex={rowIndex}
                    draggingRef={draggingRef}
                    showNotes={showNotes}
                  />
                ))}
              {expanded && !readOnly && (
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
        })
      )}

      {/* Actuals total */}
      {actuals.length > 0 && (
        <tr className="bg-gray-900">
          <td className="sticky left-0 z-10 bg-gray-900 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
            {config.actualsLabel} total
          </td>
          {showNotes && <td className="bg-gray-900" />}
          {MONTHS.map((m) => (
            <td key={m} className="px-2.5 py-2 text-right align-middle">
              <p className="text-sm font-bold text-white tabular-nums">
                {totals[m]
                  ? Math.round(totals[m]).toLocaleString("en-CA")
                  : "—"}
              </p>
            </td>
          ))}
          <td className="px-2.5 py-2 text-right align-middle bg-gray-800">
            <p className="text-sm font-bold text-yellow-400 tabular-nums">
              {Math.round(sumMonths(totals)).toLocaleString("en-CA")}
            </p>
          </td>
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
