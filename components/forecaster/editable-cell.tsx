// components/forecaster/editable-cell.tsx
"use client";

/**
 * Forecast grid cells — shared by the 3 axes.
 *
 * <SpreadsheetCell/> — a single month value, spreadsheet-style:
 *   — at rest it is a focusable display div (formatted "12 500", em dash for 0)
 *   — single click / drag / Shift+click select; the selection layer
 *     (use-grid-selection) owns the geometry, this component only reports
 *     mouse events and renders the selected / active / dirty states
 *   — editing (double-click, Enter/F2, or typing a digit) swaps in an <input>;
 *     Enter / Tab / Escape commit or cancel and move the active cell
 *   — read-only when the RFQ is locked, or for ADMIN_INPUT viewed by a BL
 *
 * <TotalCell/> — read-only total (row, bucket header, grand total).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoney, parseMoney } from "../../lib/format/money";
import { copyCellValue } from "../../lib/format/copy-cell";
import type { EditMove, GridSelection } from "../../lib/hooks/use-grid-selection";

// Re-exported for modules that still import it from here (comparison-panel).
export { formatMoney, parseMoney } from "../../lib/format/money";

// ─── Inline editing input ─────────────────────────────────────────────────────

function EditingInput({
  initial,
  selectOnFocus,
  onCommit,
  onCancel,
}: {
  initial: string;
  /** true → select all (Enter/F2/double-click); false → caret at end (typed). */
  selectOnFocus: boolean;
  /** null = the field was left blank (clear the cell), as opposed to a typed 0. */
  onCommit: (value: number | null, move: EditMove) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Guards against a trailing blur firing a second commit after Enter/Tab,
  // which would override the intended move direction.
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (selectOnFocus) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [selectOnFocus]);

  function commit(move: EditMove) {
    if (done.current) return;
    done.current = true;
    // A blank field clears the cell (null); "0" is a real, deliberate zero —
    // the distinction lets GAIA months record an explicit 0.
    onCommit(draft.trim() === "" ? null : parseMoney(draft), move);
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      // size=1 keeps the input's intrinsic width tiny so it never widens the
      // column in the auto-layout table; w-full then fills the existing cell.
      size={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit("none")}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.shiftKey ? "up" : "down");
        } else if (e.key === "Tab") {
          e.preventDefault();
          commit(e.shiftKey ? "left" : "right");
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      className="w-full min-w-0 px-1.5 py-1 text-right text-sm tabular-nums rounded-md
        border border-yellow-300 bg-white text-gray-900 font-medium
        focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
    />
  );
}

// ─── SpreadsheetCell ──────────────────────────────────────────────────────────

interface SpreadsheetCellProps {
  r: number;
  c: number;
  value: number;
  readOnly: boolean;
  /** Closed period (locked month for this user) — greyed, not editable. */
  closed?: boolean;
  /** De-emphasized (greyed) while still editable — e.g. an excluded roll-up. */
  muted?: boolean;
  /** Source-of-truth value for its month — highlighted green (the official figure). */
  official?: boolean;
  /** Counted in BL Submission for its month — highlighted mauve (violet). */
  counted?: boolean;
  /** A non-source value its month overrides — struck through, excluded from totals. */
  overridden?: boolean;
  /** The 0 in this cell was deliberately entered — rendered "0" (not an em
   *  dash) and styled like any real value. */
  explicitZero?: boolean;
  /** Rendered on a dark row (e.g. the Official Revenue row) — light text on the
   *  row's own background. Mutually exclusive with the light-row state props. */
  inverse?: boolean;
  /** Small indicator at the cell's left edge (e.g. a match check / mismatch flag). */
  badge?: ReactNode;
  dirty: boolean;
  sel: GridSelection;
  /** Shared drag flag owned by the grid (true while a select-drag is active). */
  draggingRef: React.MutableRefObject<boolean>;
}

export function SpreadsheetCell({
  r,
  c,
  value,
  readOnly,
  closed = false,
  muted = false,
  official = false,
  counted = false,
  overridden = false,
  explicitZero = false,
  inverse = false,
  badge,
  dirty,
  sel,
  draggingRef,
}: SpreadsheetCellProps) {
  const active = sel.isActive(r, c);
  const selected = sel.isSelected(r, c);
  const editing = active && sel.editing;
  const divRef = useRef<HTMLDivElement>(null);

  // Keep DOM focus on the active cell so the container receives key/clipboard
  // events. The editing input focuses itself, so only grab focus when at rest.
  useEffect(() => {
    if (active && !editing) divRef.current?.focus();
  }, [active, editing]);

  // An untouched 0 renders as an em dash; a deliberate 0 shows as "0".
  const empty = value === 0 && !explicitZero;
  const display = empty ? "" : value === 0 ? "0" : formatMoney(value);
  // A value the user can't edit (locked / closed / actuals) → click copies it.
  const copyable = readOnly || closed;

  // Dark-row (inverse) rest state: light text on the row's own background; the
  // selection/active/editing states keep the shared yellow so they read the
  // same across the whole grid.
  const stateClasses = inverse
    ? `${
        selected
          ? "bg-yellow-200 text-gray-900 font-semibold"
          : `hover:bg-gray-800 font-bold ${
              value < 0
                ? "text-red-200"
                : empty
                ? "text-gray-400"
                : dirty
                ? "text-yellow-200"
                : "text-white"
            }`
      }`
    : `${selected ? "bg-yellow-200" : closed ? "bg-gray-100" : official ? "bg-blue-200 hover:bg-blue-200" : counted ? "bg-purple-200 hover:bg-purple-200" : muted ? "bg-gray-100" : value < 0 ? "bg-red-500 hover:bg-red-500" : "hover:bg-gray-50"}
       ${closed ? "text-gray-300" : overridden ? "text-gray-400 line-through decoration-gray-400" : official ? "text-gray-900 font-semibold" : counted ? "text-gray-900 font-semibold" : dirty ? "text-gray-900 font-medium" : muted ? "text-gray-400 line-through decoration-gray-400" : value < 0 ? "text-white" : empty ? "text-gray-300" : "text-gray-700"}`;

  return (
    <td
      className={`px-0 py-0 border-b border-r align-middle ${
        inverse ? "border-gray-700" : "border-gray-100"
      }`}
    >
      {editing ? (
        <div className="px-1 py-1">
          <EditingInput
            initial={sel.editSeed !== "" ? sel.editSeed : empty ? "" : String(value)}
            selectOnFocus={sel.editSeed === ""}
            onCommit={sel.commitEdit}
            onCancel={sel.cancelEdit}
          />
        </div>
      ) : (
        <div className="px-1 py-1">
          <div
            ref={divRef}
            tabIndex={-1}
            onMouseDown={(e) => {
              // Avoid native text selection while drag-selecting cells.
              e.preventDefault();
              if (e.shiftKey) {
                sel.selectCell(r, c, true);
              } else {
                draggingRef.current = true;
                sel.startDrag(r, c);
              }
            }}
            onMouseEnter={() => {
              if (draggingRef.current) sel.dragOver(r, c);
            }}
            onDoubleClick={() => {
              if (!readOnly) sel.beginEdit(r, c);
            }}
            onClick={() => {
              // Read-only / closed cells aren't editable, so a click copies
              // the value to the clipboard instead.
              if (copyable && !empty) copyCellValue(value);
            }}
            title={copyable ? "Click to copy" : undefined}
            className={`relative w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md
              outline-none select-none transition-colors
              ${copyable ? "cursor-copy" : "cursor-cell"}
              ${active ? "ring-2 ring-inset ring-yellow-400" : ""}
              ${stateClasses}
            `}
          >
            {badge && (
              <span className="pointer-events-none absolute left-1 top-1/2 flex -translate-y-1/2 items-center">
                {badge}
              </span>
            )}
            {display || "—"}
          </div>
        </div>
      )}
    </td>
  );
}

// ─── TotalCell ────────────────────────────────────────────────────────────────

interface TotalCellProps {
  value: number;
  /** "row" = row total, "bucket" = subtotal, "grand" = grand total. */
  emphasis?: "row" | "bucket" | "grand";
}

export function TotalCell({ value, emphasis = "row" }: TotalCellProps) {
  const styles = {
    row: "text-sm font-medium text-gray-900",
    bucket: "text-sm font-semibold text-gray-900",
    grand: "text-sm font-bold text-gray-900",
  }[emphasis];

  return (
    <td
      onClick={() => {
        if (value !== 0) copyCellValue(value);
      }}
      title={value !== 0 ? "Click to copy" : undefined}
      className={`px-2.5 py-1.5 border-b border-gray-100 text-right align-middle ${
        value !== 0 ? "cursor-copy" : ""
      } ${value < 0 ? "bg-red-500" : ""}`}
    >
      <p
        className={`tabular-nums ${styles} ${
          value < 0 ? "!text-white" : value === 0 ? "!text-gray-300" : ""
        }`}
      >
        {formatMoney(value)}
      </p>
    </td>
  );
}
