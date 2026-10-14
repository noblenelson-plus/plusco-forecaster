// components/forecaster/reference-selection-controls.tsx
"use client";

/**
 * Small controls shared by the forecast grid's reference strips (MediaBox and
 * MediaOcean): the row checkbox (with a parent's indeterminate state), the
 * shared Campaign ↔ Channel orientation toggle that sits in the "Reference
 * Data" band, and the "Copy to my submission · Clear" control in a strip header.
 */

import { useEffect, useRef } from "react";
import { ClipboardPaste } from "lucide-react";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import type { GridSelection } from "../../lib/hooks/use-grid-selection";
import { SpreadsheetCell } from "./editable-cell";
import type { ReferenceSort } from "../../lib/format/reference-copy";

/** The grid's cell-selection plumbing, handed to the read-only reference rows. */
export interface ReferenceCellsApi {
  sel: GridSelection;
  rowIndex: Map<string, number>;
  draggingRef: React.MutableRefObject<boolean>;
}

/**
 * The 12 month cells of a read-only reference row, as spreadsheet cells of the
 * grid's selection model (select, Shift/drag, Ctrl/Cmd+C, the sum widget) —
 * never editable. Falls back to plain cells if the row isn't registered.
 */
export function ReferenceMonthCells({
  rowKey,
  months,
  cells,
}: {
  rowKey: string;
  months: MonthlyMap;
  cells: ReferenceCellsApi;
}) {
  const r = cells.rowIndex.get(rowKey);
  return (
    <>
      {MONTHS.map((m, ci) =>
        r === undefined ? (
          <td key={m} className="px-2.5 py-2 text-right align-middle">
            <p className="text-sm tabular-nums text-gray-700">
              {months[m] ? Math.round(months[m]).toLocaleString("en-CA") : "—"}
            </p>
          </td>
        ) : (
          <SpreadsheetCell
            key={m}
            r={r}
            c={ci}
            value={months[m] ?? 0}
            readOnly
            dirty={false}
            sel={cells.sel}
            draggingRef={cells.draggingRef}
          />
        )
      )}
    </>
  );
}
import type {
  ReferenceOrientation,
  ReferenceSelection,
} from "../../lib/hooks/use-reference-selection";

/**
 * Row checkbox for a reference strip. `keys` are the leaf keys under the row —
 * one key for a leaf row, every leaf beneath it for a parent row (whose box then
 * shows indeterminate when only some are selected).
 */
export function RowCheckbox({
  selection,
  keys,
  parent = false,
  label,
}: {
  selection: ReferenceSelection;
  keys: string[];
  parent?: boolean;
  /** Accessible name — the row's label. */
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const checked = selection.isChecked(keys);
  const indeterminate = parent && selection.isIndeterminate(keys);

  // `indeterminate` is a DOM property only (no HTML attribute), so set it here.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  if (keys.length === 0) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={() =>
        parent ? selection.toggleParent(keys) : selection.toggle(keys[0])
      }
      // Keep a click on the box from also toggling an enclosing expand button.
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select ${label}`}
      title={parent ? `Select all of ${label}` : `Select ${label}`}
      className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-gray-900"
    />
  );
}

/**
 * The one orientation toggle for both reference strips, styled for the dark
 * "Reference Data" band. `typeLabel` is "Channel" (Media) or "Partner" (Labs).
 */
export function ReferenceOrientationToggle({
  value,
  onChange,
  typeLabel,
}: {
  value: ReferenceOrientation;
  onChange: (value: ReferenceOrientation) => void;
  typeLabel: string;
}) {
  const option = (v: ReferenceOrientation, text: string) => (
    <button
      type="button"
      onClick={() => v !== value && onChange(v)}
      aria-pressed={value === v}
      className={`px-2 py-1 transition-colors ${
        value === v
          ? "bg-white text-gray-900"
          : "text-gray-300 hover:bg-gray-800"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div
      className="inline-flex border border-gray-700 text-[11px] font-medium"
      title="Group both reference strips by campaign or by channel. Switching clears the ticked rows."
    >
      {option("campaign", `Campaign › ${typeLabel}`)}
      {option("channel", `${typeLabel} › Campaign`)}
    </div>
  );
}

/**
 * Display order of both reference strips — Default (as delivered) / A–Z /
 * Z–A — styled for the dark "Reference Data" band. View-only.
 */
export function ReferenceSortToggle({
  value,
  onChange,
}: {
  value: ReferenceSort;
  onChange: (value: ReferenceSort) => void;
}) {
  const options: [ReferenceSort, string][] = [
    ["default", "Default"],
    ["asc", "A–Z"],
    ["desc", "Z–A"],
  ];
  return (
    <div
      className="inline-flex items-center border border-gray-700 text-[11px] font-medium"
      title="Order the MediaOcean and MediaBox rows by name. View only — nothing is saved."
    >
      <span className="px-2 text-gray-400">Sort</span>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => v !== value && onChange(v)}
          aria-pressed={value === v}
          className={`px-2 py-1 transition-colors ${
            value === v ? "bg-white text-gray-900" : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Copy to my submission (N) · Clear" for a strip header — the single entry
 * point of the structured copy; nothing while no row is ticked.
 */
export function SelectionCount({
  selection,
  onCopy,
  className = "",
}: {
  selection: ReferenceSelection;
  /** Opens the copy dialog for this strip's ticked rows. */
  onCopy?: () => void;
  className?: string;
}) {
  if (selection.count === 0) return null;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] normal-case ${className}`}>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 bg-gray-900 px-2 py-0.5 font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          <ClipboardPaste size={11} />
          Copy to my submission
          <span className="bg-yellow-400 px-1 text-gray-900 tabular-nums">
            {selection.count}
          </span>
        </button>
      ) : (
        <span className="font-semibold tabular-nums">
          {selection.count} selected
        </span>
      )}
      <button
        type="button"
        onClick={selection.clear}
        className="underline underline-offset-2 hover:opacity-70"
      >
        Clear
      </button>
    </span>
  );
}
