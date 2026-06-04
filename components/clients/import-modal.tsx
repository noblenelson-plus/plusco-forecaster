// components/clients/import-modal.tsx
"use client";

import { useState } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2, FileText } from "lucide-react";
import { CSVValidationResult, commitCSVImport } from "../../lib/services/client-service";

interface ImportModalProps {
  open: boolean;
  validation: CSVValidationResult | null;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({
  open,
  validation,
  onClose,
  onImported,
}: ImportModalProps) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  if (!open || !validation) return null;

  const hasErrors = validation.errors.length > 0;
  const hasValidRows = validation.validRows.length > 0;

  async function handleConfirm() {
    setImporting(true);
    setError("");
    try {
      await commitCSVImport(validation!.validRows);
      onImported();
    } catch (err: any) {
      setError("Import failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <FileText size={16} className="text-gray-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Review import
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {validation.fileName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Summary pills */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {validation.validRows.length} ready
              </span>
            </div>
            {hasErrors && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-sm font-medium text-red-600">
                  {validation.errors.length} error{validation.errors.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Error list */}
          {hasErrors && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Errors — these rows will be skipped
              </p>
              {validation.errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5"
                >
                  <AlertTriangle
                    size={13}
                    className="text-red-400 flex-shrink-0 mt-0.5"
                  />
                  <p className="text-xs text-red-700 leading-relaxed">{err}</p>
                </div>
              ))}
            </div>
          )}

          {/* No errors — all good message */}
          {!hasErrors && (
            <div className="px-6 py-6 flex flex-col items-center text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">
                All rows are valid
              </p>
              <p className="text-xs text-gray-400">
                No errors found — all {validation.validRows.length} clients are ready to import.
              </p>
            </div>
          )}

          {/* Global error */}
          {error && (
            <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleConfirm}
              disabled={importing || !hasValidRows}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              {importing
                ? "Importing..."
                : `Import ${validation.validRows.length} client${validation.validRows.length !== 1 ? "s" : ""}`
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );
}