// components/progression/milestone-batch-runner.tsx
"use client";

/**
 * "Refresh a milestone check for every client I can edit" — the batch trigger on
 * the Milestones page. The user picks one milestone step and re-runs its flag
 * analysis across the currently-filtered clients they have WRITE access to
 * (Admin → all, Exec → their agency, BL → assigned). Read-only clients are
 * excluded upstream. Only clients ALREADY validated for the step are refreshed —
 * never-validated ones are skipped (handy after a data import).
 *
 * Presentational shell around useMilestoneBatchCheck: a step picker, a confirm
 * step (it writes many docs), a progress bar and a per-status summary. Calls
 * onComplete when a run finishes so the parent can reload the recap table.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MinusCircle,
  Play,
  XCircle,
} from "lucide-react";
import {
  CONFIRMATION_STEPS,
  type ConfirmationStep,
} from "../../lib/constants/confirmation-steps";
import { useMilestoneBatchCheck } from "../../lib/hooks/use-milestone-batch-check";

interface MilestoneBatchRunnerProps {
  /** Ids of the filtered clients the current user may write to. */
  writableClientIds: string[];
  year: number | null;
  /** Called when a run completes — the parent reloads the recap table. */
  onComplete: () => void;
}

export default function MilestoneBatchRunner({
  writableClientIds,
  year,
  onComplete,
}: MilestoneBatchRunnerProps) {
  const batch = useMilestoneBatchCheck();
  const [stepId, setStepId] = useState<string>(CONFIRMATION_STEPS[0].id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const step: ConfirmationStep =
    CONFIRMATION_STEPS.find((s) => s.id === stepId) ?? CONFIRMATION_STEPS[0];
  const count = writableClientIds.length;
  const canRun = !!year && count > 0 && batch.ready && !batch.running;

  // Close the step picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  async function handleConfirm() {
    if (!year) return;
    setConfirming(false);
    await batch.run(step, writableClientIds, year);
    onComplete();
  }

  const pct =
    batch.progress && batch.progress.total > 0
      ? Math.round((batch.progress.done / batch.progress.total) * 100)
      : 0;

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      {/* Step picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={batch.running}
          aria-expanded={pickerOpen}
          className="flex items-center gap-1.5 border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          <span className="text-gray-400">Milestone</span>
          <span className="text-gray-900">{step.label}</span>
          <ChevronDown size={13} className="opacity-60" />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 z-50 mt-1.5 w-64 border border-gray-200 bg-white p-1 shadow-xl">
            {CONFIRMATION_STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStepId(s.id);
                  setPickerOpen(false);
                }}
                className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 ${
                  s.id === stepId ? "font-semibold text-gray-900" : "text-gray-700"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-[11px] text-gray-400">{s.targetRfq}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={!canRun}
        title={
          count === 0
            ? "No clients you can edit in the current filter"
            : `Run this check for ${count} client${count > 1 ? "s" : ""}`
        }
        className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {batch.running ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Play size={13} />
        )}
        Run check · {count} client{count === 1 ? "" : "s"}
      </button>

      {/* Progress while running */}
      {batch.running && batch.progress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-32 bg-gray-200">
            <div
              className="h-full bg-gray-900 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-gray-500">
            {batch.progress.done}/{batch.progress.total}
          </span>
        </div>
      )}

      {/* Summary once done */}
      {!batch.running && batch.summary && (
        <div className="flex flex-wrap items-center gap-3 border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium">
          <span className="flex items-center gap-1 text-green-700">
            <CheckCircle2 size={13} /> {batch.summary.validated} validated
          </span>
          {batch.summary.failed > 0 && (
            <span className="flex items-center gap-1 text-gray-700">
              <AlertTriangle size={13} className="text-yellow-500" />
              {batch.summary.failed} with flags
            </span>
          )}
          {batch.summary.skipped > 0 && (
            <span className="flex items-center gap-1 text-gray-400">
              <MinusCircle size={13} /> {batch.summary.skipped} skipped
            </span>
          )}
          {batch.summary.errored > 0 && (
            <span
              className="flex items-center gap-1 text-red-600"
              title={batch.summary.errors
                .map((e) => `${e.clientId}: ${e.message}`)
                .join("\n")}
            >
              <XCircle size={13} /> {batch.summary.errored} error
              {batch.summary.errored > 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={batch.reset}
            className="text-gray-400 underline hover:text-gray-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Run milestone check
              </h2>
            </div>
            <div className="px-4 py-3 text-sm text-gray-700">
              <p>
                This refreshes the{" "}
                <span className="font-semibold">{step.label}</span> check for the{" "}
                <span className="font-semibold">
                  {count} client{count === 1 ? "" : "s"}
                </span>{" "}
                in view for {year} that are{" "}
                <span className="font-semibold">already validated</span> (or have
                flags to justify), recomputing their flags and updating each
                outcome.
              </p>
              <p className="mt-2 text-[13px] text-gray-500">
                Clients not yet validated for this milestone are left untouched —
                initial validation stays a manual action. Clients with no forecast
                for {step.targetRfq} are skipped, and existing justifications are
                kept.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Play size={13} />
                Run for {count} client{count === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
