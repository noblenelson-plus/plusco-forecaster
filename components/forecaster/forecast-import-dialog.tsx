// components/forecaster/forecast-import-dialog.tsx
"use client";

/**
 * Preview + confirm step for a Sheets import. Shows the diff the parser produced
 * and requires an explicit confirm before anything is written — a malformed
 * sheet (diff.blocked) lists the row-numbered fixes and offers no apply.
 *
 * Removals (grid rows missing from the sheet) are OPT-IN: kept by default,
 * shown with a toggle so a row a BL dropped from the sheet is never deleted by
 * accident. Applying calls back into the grid's applyBlImport — one undoable
 * commit that autosaves — so a wrong import is one Ctrl+Z away.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Plus, Trash2, X } from "lucide-react";
import type { ImportDiff } from "../../lib/format/forecast-sheets-import";

export default function ForecastImportDialog({
  diff,
  bucketLabel,
  onApply,
  onClose,
}: {
  diff: ImportDiff;
  /** e.g. "Project" — for the summary copy. */
  bucketLabel: string;
  onApply: (opts: { applyRemovals: boolean }) => void;
  onClose: () => void;
}) {
  const [applyRemovals, setApplyRemovals] = useState(false);

  const nothingToApply = useMemo(
    () =>
      diff.updates.length === 0 &&
      diff.additions.length === 0 &&
      !(applyRemovals && diff.removals.length > 0),
    [diff, applyRemovals]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col bg-white rounded-2xl shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Import from Sheet</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {diff.blocked ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  This sheet can&apos;t be imported yet. Fix the following in the
                  BL Submission tab and paste the link again — nothing has been
                  changed.
                </span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {diff.errors.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="min-w-14 flex-shrink-0 font-medium text-gray-500">
                      {e.rowNumber != null ? `Row ${e.rowNumber}` : "Sheet"}
                    </span>
                    <span className="text-gray-800">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{diff.updates.length}</span> changed
                {" · "}
                <span className="font-semibold text-gray-900">{diff.additions.length}</span> added
                {" · "}
                <span className="font-semibold text-gray-900">{diff.removals.length}</span> in the app but not in your sheet
                {" · "}
                <span className="text-gray-500">{diff.unchanged} unchanged</span>
              </p>

              {diff.updates.length > 0 && (
                <Section title="Changed">
                  {diff.updates.map((u) => (
                    <Line key={u.rowId} icon={<ArrowRight size={12} className="text-blue-500" />}>
                      <b>{u.bucketName}</b> · {u.label}
                      <span className="text-gray-400"> — {u.changes.length} month{u.changes.length > 1 ? "s" : ""}</span>
                    </Line>
                  ))}
                </Section>
              )}

              {diff.additions.length > 0 && (
                <Section title="Added">
                  {diff.additions.map((a, i) => (
                    <Line key={i} icon={<Plus size={12} className="text-green-600" />}>
                      <b>{a.bucketName}</b> · {a.label}
                      {a.newBucket && (
                        <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-medium text-green-700">
                          new {bucketLabel.toLowerCase()}
                        </span>
                      )}
                    </Line>
                  ))}
                </Section>
              )}

              {diff.removals.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={applyRemovals}
                      onChange={(e) => setApplyRemovals(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-amber-900">
                      Also remove {diff.removals.length} row
                      {diff.removals.length > 1 ? "s" : ""} that are in the app but
                      not in your sheet.{" "}
                      <span className="text-amber-700">
                        Off by default — leave unchecked to keep them.
                      </span>
                    </span>
                  </label>
                  {applyRemovals && (
                    <ul className="ml-6 space-y-0.5 text-xs text-amber-800">
                      {diff.removals.map((r) => (
                        <li key={r.rowId} className="flex items-center gap-1">
                          <Trash2 size={11} />
                          <b>{r.bucketName}</b> · {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {diff.blocked ? "Close" : "Cancel"}
          </button>
          {!diff.blocked && (
            <button
              onClick={() => onApply({ applyRemovals })}
              disabled={nothingToApply}
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
            >
              {nothingToApply ? "Nothing to change" : "Apply import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 text-sm text-gray-700">
      <span className="flex-shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}