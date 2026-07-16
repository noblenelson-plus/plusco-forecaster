// components/forecaster/submission-ready-months.tsx
"use client";

/**
 * Ready-months dropdown — a compact picker to flag which months of a submission
 * are complete ("the data is ready"). The set is shared across the Media,
 * Revenue and Labs tabs (stored on the data_entries doc) and is purely
 * indicative: checking a month locks nothing, it just signals readiness.
 *
 * Lives beside the submission notes. Editable for anyone with access, including
 * on a locked RFQ.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, ChevronDown, Loader2 } from "lucide-react";
import { useSubmissionReadyMonths } from "../../lib/hooks/use-submission-ready-months";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function SubmissionReadyMonths() {
  const { ready, loading, months, toggle, selectAll, clear, status } =
    useSubmissionReadyMonths();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready) return null;

  const count = months.size;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Flag which months are complete and ready"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          count > 0
            ? "border-green-500 bg-green-500 text-white"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {status === "saving" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <CalendarCheck size={13} className={count > 0 ? "text-white" : ""} />
        )}
        <span>Data ready</span>
        <span className="tabular-nums opacity-80">{count}/12</span>
        <ChevronDown size={13} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Ready months</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                disabled={loading}
                className="px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                All
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={loading}
                className="px-1.5 py-0.5 text-[11px] font-medium text-gray-500 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Month grid (3 × 4) */}
          <div className="grid grid-cols-3 gap-1 p-2">
            {MONTH_LABELS.map((label, i) => {
              const month = i + 1;
              const on = months.has(month);
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => toggle(month)}
                  disabled={loading}
                  aria-pressed={on}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
                    on
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {on && <Check size={11} className="text-white" />}
                  {label}
                </button>
              );
            })}
          </div>

          <p className="px-3 pb-2 text-[11px] text-gray-400">
            Shared across all tabs · marks data complete (no lock).
          </p>
        </div>
      )}
    </div>
  );
}
