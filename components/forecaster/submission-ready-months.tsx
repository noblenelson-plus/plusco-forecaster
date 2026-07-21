// components/forecaster/submission-ready-months.tsx
"use client";

/**
 * BL Forecast Validation dropdown — a compact picker to confirm which milestone
 * steps of a submission are complete (CONFIRMATION_STEPS: RFQ BL deadlines and
 * Mid-Quarter Validations). The set is shared across the Media, Revenue and Labs
 * tabs (stored on the data_entries doc) and is purely indicative: confirming a
 * step locks nothing, it just signals completion.
 *
 * A step cannot be confirmed while the submission has active, unjustified flags
 * (see the Flags drawer) — the user must justify them first. Confirmations
 * already set stay put and can still be removed.
 *
 * Lives in the forecast top bar, left of the Flags button. Editable for anyone
 * with access, including on a locked RFQ.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, ChevronDown, Loader2 } from "lucide-react";
import { useSubmissionReadyMonths } from "../../lib/hooks/use-submission-ready-months";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";

interface SubmissionReadyMonthsProps {
  /** Block confirming (ticking ON) any step while unjustified flags remain. */
  blocked?: boolean;
  /** How many flags are still unjustified — shown in the blocked message. */
  blockedCount?: number;
}

export default function SubmissionReadyMonths({
  blocked = false,
  blockedCount = 0,
}: SubmissionReadyMonthsProps) {
  const { ready, loading, confirmed, toggle, selectAll, clear, status } =
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

  const count = confirmed.size;
  const total = CONFIRMATION_STEPS.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Confirm which steps are complete"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          count > 0
            ? "border-green-500 bg-green-500 text-white"
            : "border-green-500 bg-white text-green-700 hover:bg-green-50"
        }`}
      >
        {status === "saving" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <CalendarCheck size={13} className={count > 0 ? "text-white" : "text-green-600"} />
        )}
        <span>BL Forecast Validation</span>
        <span className="tabular-nums opacity-80">{count}/{total}</span>
        <ChevronDown size={13} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">BL Forecast Validation</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                disabled={loading || blocked}
                title={blocked ? "Justify the active flags first" : undefined}
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

          {/* Active unjustified flags block confirming new steps. */}
          {blocked && (
            <p className="px-3 pt-2 text-[11px] font-medium text-red-700">
              {blockedCount} unjustified flag{blockedCount > 1 ? "s" : ""} — justify
              {blockedCount > 1 ? " them" : " it"} in Flags before confirming steps.
            </p>
          )}

          {/* Step list */}
          <div className="max-h-80 space-y-1 overflow-y-auto p-1.5">
            {CONFIRMATION_STEPS.map((step) => {
              const on = confirmed.has(step.id);
              // A step can always be un-confirmed; confirming (ticking ON) a new
              // step is blocked while unjustified flags remain.
              const lockOn = blocked && !on;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (loading || lockOn) return;
                    toggle(step.id);
                  }}
                  disabled={loading || lockOn}
                  aria-pressed={on}
                  title={lockOn ? "Justify the active flags before confirming this step" : undefined}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left border transition-colors disabled:opacity-50 ${
                    on
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center border ${
                      on ? "border-white bg-white" : "border-gray-300 bg-white"
                    }`}
                  >
                    {on && <Check size={11} className="text-green-600" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="px-3 pb-2 text-[11px] text-gray-400">
            Shared across all tabs · marks steps complete (no lock).
          </p>
        </div>
      )}
    </div>
  );
}
