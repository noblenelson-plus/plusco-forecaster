// components/forecaster/non-commissionable-dialog.tsx
"use client";

/**
 * Confirmation before a Media project's commission flag changes.
 *
 * Marking a project non-commissionable removes its media spend from the
 * calculated Commission line on the Revenue tab, so a stray click used to zero
 * commission revenue silently. The project-row control is now a small icon that
 * opens this dialog, which explains the effect and asks for an explicit
 * confirm. Reverting goes through the same dialog. The change edits the
 * working copy and is saved like any other edit.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Ban, X } from "lucide-react";

interface NonCommissionableDialogProps {
  projectName: string;
  /** The flag the confirm will set: true = mark non-commissionable. */
  markNonCommissionable: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function NonCommissionableDialog({
  projectName,
  markNonCommissionable,
  onConfirm,
  onClose,
}: NonCommissionableDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = () => {
    onConfirm();
    onClose();
  };

  // Portal to <body> so the overlay escapes the table's sticky/z-indexed cells.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
      // Keep keyboard/clipboard events from reaching the grid behind the dialog.
      onKeyDown={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="non-commissionable-title"
        className="w-full max-w-md bg-white shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3
              id="non-commissionable-title"
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"
            >
              <Ban size={14} />
              {markNonCommissionable
                ? "Mark project non-commissionable?"
                : "Make project commissionable again?"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-gray-700">
          {markNonCommissionable ? (
            <>
              <p>
                This project&apos;s media spend will be{" "}
                <strong>excluded from the commission calculation</strong>. The
                calculated Commission line on the Revenue tab will no longer
                include any commission on it.
              </p>
              <p>
                The spend still counts in every other total (Media totals,
                dashboards). Only do this for a project billed without
                commission.
              </p>
            </>
          ) : (
            <p>
              This project&apos;s media spend will be{" "}
              <strong>included in the commission calculation</strong> again, so
              the calculated Commission line on the Revenue tab will include
              commission on it.
            </p>
          )}
          <p className="text-xs text-gray-500">
            You can switch it back at any time from the project row.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              markNonCommissionable
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-yellow-400 text-gray-900 hover:bg-yellow-500"
            }`}
          >
            {markNonCommissionable
              ? "Mark non-commissionable"
              : "Make commissionable"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
