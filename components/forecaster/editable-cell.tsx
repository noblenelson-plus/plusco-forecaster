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

import { useEffect, useRef, useState } from "react";
import { formatMoney, parseMoney } from "../../lib/format/money";
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
  onCommit: (value: number, move: EditMove) => void;
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
    onCommit(parseMoney(draft), move);
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
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
      className="w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md
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

  const display = value === 0 ? "" : formatMoney(value);

  return (
    <td className="px-0 py-0 border-b border-r border-gray-100 align-middle">
      {editing ? (
        <div className="px-1 py-1">
          <EditingInput
            initial={sel.editSeed !== "" ? sel.editSeed : value === 0 ? "" : String(value)}
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
            className={`w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md
              outline-none select-none transition-colors
              ${closed ? "cursor-not-allowed" : "cursor-cell"}
              ${selected ? "bg-yellow-200/70" : closed ? "bg-gray-100/80" : value < 0 ? "bg-red-100/70 hover:bg-red-100" : "hover:bg-gray-50"}
              ${active ? "ring-2 ring-inset ring-yellow-400" : ""}
              ${closed ? "text-gray-300" : dirty ? "text-gray-900 font-medium" : value < 0 ? "text-red-700" : value === 0 ? "text-gray-300" : "text-gray-700"}
            `}
          >
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
      className={`px-2.5 py-1.5 border-b border-gray-100 text-right align-middle ${
        value < 0 ? "bg-red-100/70" : ""
      }`}
    >
      <p
        className={`tabular-nums ${styles} ${
          value < 0 ? "!text-red-700" : value === 0 ? "!text-gray-300" : ""
        }`}
      >
        {formatMoney(value)}
      </p>
    </td>
  );
}
