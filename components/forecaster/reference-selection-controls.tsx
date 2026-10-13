// components/forecaster/reference-selection-controls.tsx
"use client";

/**
 * Small controls shared by the forecast grid's reference strips (MediaBox and
 * MediaOcean): the row checkbox (with a parent's indeterminate state), the
 * shared Campaign ↔ Channel orientation toggle that sits in the "Reference
 * Data" band, and the "N selected · Clear" readout in a strip header.
 */

import { useEffect, useRef } from "react";
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

/** "N selected · Clear" readout for a strip header; nothing when empty. */
export function SelectionCount({
  selection,
  className = "",
}: {
  selection: ReferenceSelection;
  className?: string;
}) {
  if (selection.count === 0) return null;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] normal-case ${className}`}>
      <span className="font-semibold tabular-nums">
        {selection.count} selected
      </span>
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
