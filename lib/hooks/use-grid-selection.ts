// lib/hooks/use-grid-selection.ts

/**
 * Spreadsheet-style selection + clipboard layer for the forecast grid.
 *
 * The grid is modelled as an ordered list of editable rows (BL rows of every
 * bucket, then the actuals rows) × 12 month columns. This hook owns:
 *   — the rectangular selection (anchor → focus) and the active cell
 *   — keyboard navigation (arrows / Shift+arrows / Tab / Enter)
 *   — edit-mode state (which cell holds the inline input, and its seed)
 *   — clipboard copy/paste as TSV, so ranges round-trip with Excel
 *   — fill down / fill right (Ctrl/Cmd+D / Ctrl/Cmd+R) and delete-to-clear
 *
 * It is DOM-agnostic: the grid passes row descriptors plus getValue/setCells
 * callbacks, wires the returned handlers onto the table container, and reads
 * `isSelected` / `isActive` / `editing` to render.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { CellCoord } from "../types/forecaster.types";
import { MONTHS } from "../types/common.types";
import { parseMoney } from "../format/money";

/** One editable row in display order. `month` is a 1–12 value, not a column. */
export interface GridRowDescriptor {
  /** Stable key (the rowId) — used by the grid to focus the right cell. */
  key: string;
  /** A read-only row still takes part in copy, but rejects paste/fill/edit. */
  readOnly: boolean;
  /** Builds the cell coordinate for a given month (1–12). */
  coordFor: (month: number) => CellCoord;
}

export interface CellPos {
  r: number;
  c: number;
}

/** Where focus goes after committing an inline edit. */
export type EditMove = "down" | "up" | "left" | "right" | "none";

const COLS = MONTHS.length; // 12
const monthOf = (col: number) => MONTHS[col]; // col 0 → month 1

interface UseGridSelectionArgs {
  rows: GridRowDescriptor[];
  getValue: (coord: CellCoord) => number;
  setCells: (updates: { coord: CellCoord; value: number }[]) => void;
  /** Whole grid read-only (RFQ locked) — disables every mutation. */
  locked: boolean;
}

export interface GridSelection {
  activeCell: CellPos | null;
  editing: boolean;
  editSeed: string;

  isSelected: (r: number, c: number) => boolean;
  isActive: (r: number, c: number) => boolean;
  hasRangeSelection: boolean;

  /** Mouse: plain click, Shift+click (extend), or drag start. */
  selectCell: (r: number, c: number, extend?: boolean) => void;
  startDrag: (r: number, c: number) => void;
  dragOver: (r: number, c: number) => void;
  clear: () => void;

  beginEdit: (r: number, c: number, seed?: string) => void;
  commitEdit: (value: number, move?: EditMove) => void;
  cancelEdit: () => void;

  /** Container-level handlers. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCopy: (e: React.ClipboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function useGridSelection({
  rows,
  getValue,
  setCells,
  locked,
}: UseGridSelectionArgs): GridSelection {
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSeed, setEditSeed] = useState("");

  const maxR = rows.length - 1;

  // Selection rectangle derived from anchor + focus.
  const rect = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      minR: Math.min(anchor.r, focus.r),
      maxR: Math.max(anchor.r, focus.r),
      minC: Math.min(anchor.c, focus.c),
      maxC: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);

  const isSelected = useCallback(
    (r: number, c: number) =>
      !!rect &&
      r >= rect.minR &&
      r <= rect.maxR &&
      c >= rect.minC &&
      c <= rect.maxC,
    [rect]
  );

  const isActive = useCallback(
    (r: number, c: number) => !!focus && focus.r === r && focus.c === c,
    [focus]
  );

  const clear = useCallback(() => {
    setAnchor(null);
    setFocus(null);
    setEditing(false);
  }, []);

  const selectCell = useCallback(
    (r: number, c: number, extend = false) => {
      setEditing(false);
      const pos = { r, c };
      setFocus(pos);
      if (!extend || !anchor) setAnchor(pos);
    },
    [anchor]
  );

  const startDrag = useCallback((r: number, c: number) => {
    setEditing(false);
    const pos = { r, c };
    setAnchor(pos);
    setFocus(pos);
  }, []);

  const dragOver = useCallback(
    (r: number, c: number) => {
      // Only meaningful while a primary button drag is in progress; the grid
      // gates this behind its own dragging ref, so just track the focus end.
      setFocus({ r, c });
    },
    []
  );

  // ─── Edit mode ────────────────────────────────────────────────────────────

  const beginEdit = useCallback(
    (r: number, c: number, seed?: string) => {
      if (locked || rows[r]?.readOnly) return;
      setAnchor({ r, c });
      setFocus({ r, c });
      setEditSeed(seed ?? "");
      setEditing(true);
    },
    [locked, rows]
  );

  const cancelEdit = useCallback(() => setEditing(false), []);

  const move = useCallback(
    (dr: number, dc: number, extend = false) => {
      setFocus((prev) => {
        const base = prev ?? { r: 0, c: 0 };
        const next = {
          r: clamp(base.r + dr, 0, maxR),
          c: clamp(base.c + dc, 0, COLS - 1),
        };
        if (!extend) setAnchor(next);
        return next;
      });
    },
    [maxR]
  );

  const commitEdit = useCallback(
    (value: number, mv: EditMove = "down") => {
      setEditing(false);
      if (focus && !locked && !rows[focus.r]?.readOnly) {
        setCells([{ coord: rows[focus.r].coordFor(monthOf(focus.c)), value }]);
      }
      if (mv === "down") move(1, 0, false);
      else if (mv === "up") move(-1, 0, false);
      else if (mv === "right") move(0, 1, false);
      else if (mv === "left") move(0, -1, false);
    },
    [focus, locked, rows, setCells, move]
  );

  // ─── Clipboard ──────────────────────────────────────────────────────────

  const onCopy = useCallback(
    (e: React.ClipboardEvent) => {
      if (!rect || editing) return;
      const lines: string[] = [];
      for (let r = rect.minR; r <= rect.maxR; r++) {
        const cells: string[] = [];
        for (let c = rect.minC; c <= rect.maxC; c++) {
          const v = getValue(rows[r].coordFor(monthOf(c)));
          cells.push(v === 0 ? "" : String(v));
        }
        lines.push(cells.join("\t"));
      }
      e.clipboardData.setData("text/plain", lines.join("\n"));
      e.preventDefault();
    },
    [rect, editing, getValue, rows]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (editing || locked || !rect) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();

      const matrix = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");
      if (matrix.length > 1 && matrix[matrix.length - 1] === "") matrix.pop();
      const grid = matrix.map((line) => line.split("\t"));

      const updates: { coord: CellCoord; value: number }[] = [];
      const single = grid.length === 1 && grid[0].length === 1;

      if (single && (rect.minR !== rect.maxR || rect.minC !== rect.maxC)) {
        // One source value → fill the whole current selection (Excel behaviour).
        const v = parseMoney(grid[0][0]);
        for (let r = rect.minR; r <= rect.maxR; r++) {
          if (rows[r].readOnly) continue;
          for (let c = rect.minC; c <= rect.maxC; c++) {
            updates.push({ coord: rows[r].coordFor(monthOf(c)), value: v });
          }
        }
      } else {
        // Place the block with its top-left at the selection's top-left.
        for (let i = 0; i < grid.length; i++) {
          const r = rect.minR + i;
          if (r > maxR || rows[r].readOnly) continue;
          for (let j = 0; j < grid[i].length; j++) {
            const c = rect.minC + j;
            if (c > COLS - 1) continue;
            updates.push({
              coord: rows[r].coordFor(monthOf(c)),
              value: parseMoney(grid[i][j]),
            });
          }
        }
      }
      setCells(updates);
    },
    [editing, locked, rect, rows, maxR, setCells]
  );

  // ─── Fill / clear ─────────────────────────────────────────────────────────

  const fillDown = useCallback(() => {
    if (!rect || locked || rect.minR === rect.maxR) return;
    const updates: { coord: CellCoord; value: number }[] = [];
    for (let c = rect.minC; c <= rect.maxC; c++) {
      const src = getValue(rows[rect.minR].coordFor(monthOf(c)));
      for (let r = rect.minR + 1; r <= rect.maxR; r++) {
        if (rows[r].readOnly) continue;
        updates.push({ coord: rows[r].coordFor(monthOf(c)), value: src });
      }
    }
    setCells(updates);
  }, [rect, locked, getValue, rows, setCells]);

  const fillRight = useCallback(() => {
    if (!rect || locked || rect.minC === rect.maxC) return;
    const updates: { coord: CellCoord; value: number }[] = [];
    for (let r = rect.minR; r <= rect.maxR; r++) {
      if (rows[r].readOnly) continue;
      const src = getValue(rows[r].coordFor(monthOf(rect.minC)));
      for (let c = rect.minC + 1; c <= rect.maxC; c++) {
        updates.push({ coord: rows[r].coordFor(monthOf(c)), value: src });
      }
    }
    setCells(updates);
  }, [rect, locked, getValue, rows, setCells]);

  const clearSelection = useCallback(() => {
    if (!rect || locked) return;
    const updates: { coord: CellCoord; value: number }[] = [];
    for (let r = rect.minR; r <= rect.maxR; r++) {
      if (rows[r].readOnly) continue;
      for (let c = rect.minC; c <= rect.maxC; c++) {
        updates.push({ coord: rows[r].coordFor(monthOf(c)), value: 0 });
      }
    }
    setCells(updates);
  }, [rect, locked, rows, setCells]);

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focus) return;
      // While editing, the inline input owns the keystrokes (it handles
      // Enter / Tab / Escape itself and calls commitEdit / cancelEdit).
      if (editing) return;

      const meta = e.metaKey || e.ctrlKey;
      const { r, c } = focus;

      // Let the native copy/paste events fire for Ctrl/Cmd + C / V / X.
      if (meta && ["c", "v", "x"].includes(e.key.toLowerCase())) return;

      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        fillDown();
        return;
      }
      if (meta && e.key.toLowerCase() === "r") {
        e.preventDefault();
        fillRight();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAnchor({ r: 0, c: 0 });
        setFocus({ r: maxR, c: COLS - 1 });
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          move(-1, 0, e.shiftKey);
          return;
        case "ArrowDown":
          e.preventDefault();
          move(1, 0, e.shiftKey);
          return;
        case "ArrowLeft":
          e.preventDefault();
          move(0, -1, e.shiftKey);
          return;
        case "ArrowRight":
          e.preventDefault();
          move(0, 1, e.shiftKey);
          return;
        case "Tab":
          e.preventDefault();
          move(0, e.shiftKey ? -1 : 1, false);
          return;
        case "Enter":
        case "F2":
          e.preventDefault();
          beginEdit(r, c);
          return;
        case "Escape":
          e.preventDefault();
          setAnchor(focus);
          return;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          clearSelection();
          return;
      }

      // A printable character starts editing, seeded with that character.
      if (e.key.length === 1 && !meta && !e.altKey) {
        if (/[0-9.,\-]/.test(e.key)) {
          e.preventDefault();
          beginEdit(r, c, e.key);
        }
      }
    },
    [focus, editing, maxR, move, beginEdit, fillDown, fillRight, clearSelection]
  );

  return {
    activeCell: focus,
    editing,
    editSeed,
    isSelected,
    isActive,
    hasRangeSelection:
      !!rect && (rect.minR !== rect.maxR || rect.minC !== rect.maxC),
    selectCell,
    startDrag,
    dragOver,
    clear,
    beginEdit,
    commitEdit,
    cancelEdit,
    onKeyDown,
    onCopy,
    onPaste,
  };
}
