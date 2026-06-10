// components/forecaster/note-dialog.tsx
"use client";

/**
 * Note dialog — view or edit the free-text note attached to a single grid line.
 *
 * The note lives on the row and is persisted with the grid's explicit Save, not
 * on close: editing here only updates the working copy (hence the footer hint).
 * In read-only contexts (locked RFQ, or actuals for a non-admin) the textarea is
 * shown read-only so the note can still be viewed but not changed.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface NoteDialogProps {
  /** Line label shown as the dialog subtitle. */
  rowLabel: string;
  note: string;
  /** When true, the note can be viewed but not edited. */
  readOnly?: boolean;
  onSave: (note: string) => void;
  onClose: () => void;
}

export default function NoteDialog({
  rowLabel,
  note,
  readOnly,
  onSave,
  onClose,
}: NoteDialogProps) {
  const [value, setValue] = useState(note);

  function save() {
    onSave(value);
    onClose();
  }

  // Portal to <body> so the overlay escapes the table's sticky/z-indexed cells
  // (a sticky first-column td creates its own stacking context — rendering the
  // modal inside it would let other sticky cells paint over the dark backdrop).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
      // The dialog renders inside the grid container, which listens for
      // keyboard / clipboard events. Stop them here so typing in the textarea
      // never leaks into the spreadsheet cell behind it.
      onKeyDown={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {readOnly ? "Note" : "Edit note"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{rowLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <textarea
            autoFocus={!readOnly}
            readOnly={readOnly}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !readOnly) {
                save();
              }
            }}
            rows={5}
            placeholder={readOnly ? "No note." : "Write a note for this line..."}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y
              focus:outline-none focus:ring-2 focus:ring-yellow-400
              read-only:bg-gray-50 read-only:text-gray-600"
          />
          {!readOnly && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              ⌘/Ctrl + Enter to save · the note is stored with the grid&apos;s Save
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              onClick={save}
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
            >
              Save note
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
