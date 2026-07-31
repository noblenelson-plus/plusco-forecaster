// components/forecaster/validation-control.tsx
"use client";

/**
 * "BL Forecast Validation" control — the top-bar dropdown that replaces the old
 * tick-a-box list. Each milestone step of the selected RFQ has a Validate button
 * that force-saves and (re)runs the flag analysis for that step's window. A step
 * turns green when every flag is justified, yellow when it failed (flags left to
 * justify) or when the data changed since (revalidate). Justifying happens on the
 * Flags page — this control links there.
 *
 * Presentational: the parent owns the validation hook and passes its state in.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, ChevronDown, Loader2, Play, RotateCcw } from "lucide-react";
import type { ConfirmationStep } from "../../lib/constants/confirmation-steps";
import type { RfqValidationStatus } from "../../lib/types/forecast-flags.types";
import type { ValidationRunResult } from "../../lib/hooks/use-forecast-validation";

const STATUS_META: Record<
  RfqValidationStatus,
  { label: string; dot: string }
> = {
  not_validated: { label: "Not validated", dot: "bg-gray-300" },
  failed: { label: "Flags to justify", dot: "bg-yellow-400" },
  validated: { label: "Validated", dot: "bg-green-500" },
  stale_bl: { label: "BL data changed", dot: "bg-yellow-400" },
  stale_mo: { label: "MediaOcean changed", dot: "bg-yellow-400" },
};

interface ValidationControlProps {
  steps: ConfirmationStep[];
  stepStatus: (stepId: string) => RfqValidationStatus;
  runningStep: string | null;
  onValidate: (stepId: string) => Promise<ValidationRunResult | null>;
  onUnvalidate: (stepId: string) => Promise<void>;
  onOpenFlags: () => void;
  unjustifiedCount: number;
  /** RFQ is locked — validation still allowed (reads actuals); label reflects it. */
  locked?: boolean;
}

export default function ValidationControl({
  steps,
  stepStatus,
  runningStep,
  onValidate,
  onUnvalidate,
  onOpenFlags,
  unjustifiedCount,
  locked = false,
}: ValidationControlProps) {
  const [open, setOpen] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationRunResult | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  if (steps.length === 0) return null;

  // Worst status drives the trigger colour: yellow (needs attention) beats
  // gray (untouched) beats green (all good).
  const statuses = steps.map((s) => stepStatus(s.id));
  const anyAttention = statuses.some(
    (s) => s === "failed" || s === "stale_bl" || s === "stale_mo"
  );
  const allValidated = statuses.every((s) => s === "validated");
  const triggerClass = anyAttention
    ? "border-yellow-400 bg-yellow-400 text-gray-900"
    : allValidated
      ? "border-green-500 bg-green-500 text-white"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

  const runStep = async (stepId: string) => {
    const result = await onValidate(stepId);
    setLastResult(result);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Validate the forecast and refresh its flags"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition-colors ${triggerClass}`}
      >
        <CalendarCheck size={13} />
        <span>BL Forecast Validation</span>
        {unjustifiedCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center bg-white px-1 text-[11px] font-bold text-gray-900">
            {unjustifiedCount}
          </span>
        )}
        <ChevronDown size={13} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-80 border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">
              Validate this submission
            </span>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Saves your edits, then re-checks the flags for the step&apos;s months.
            </p>
          </div>

          <div className="space-y-1 p-1.5">
            {steps.map((step) => {
              const status = stepStatus(step.id);
              const meta = STATUS_META[status];
              const running = runningStep === step.id;
              return (
                <div
                  key={step.id}
                  className="flex items-center gap-2 border border-gray-200 px-2.5 py-1.5"
                >
                  <span className={`h-2 w-2 flex-shrink-0 ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-800">
                      {step.label}
                    </div>
                    <div className="text-[11px] text-gray-500">{meta.label}</div>
                  </div>
                  {status !== "not_validated" && (
                    <button
                      type="button"
                      onClick={() => void onUnvalidate(step.id)}
                      disabled={running}
                      title="Reset this step to not validated (keeps the flags)"
                      className="flex items-center gap-1 border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
                    >
                      <RotateCcw size={11} />
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void runStep(step.id)}
                    disabled={running}
                    className="flex items-center gap-1 border border-gray-900 bg-gray-900 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
                  >
                    {running ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Play size={11} />
                    )}
                    {status === "not_validated" ? "Validate" : "Re-validate"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Outcome of the last run. */}
          {lastResult && (
            <div className="border-t border-gray-100 px-3 py-2 text-[11px]">
              {lastResult.passed ? (
                <span className="font-medium text-green-700">
                  Validation successful — all flags justified.
                </span>
              ) : (
                <span className="text-gray-700">
                  {lastResult.unjustified} flag
                  {lastResult.unjustified > 1 ? "s" : ""} to justify.{" "}
                  <button
                    type="button"
                    onClick={onOpenFlags}
                    className="font-semibold text-gray-900 underline"
                  >
                    Open Flags
                  </button>
                </span>
              )}
            </div>
          )}

          {locked && (
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
              This RFQ is locked — validation still checks the latest MediaOcean
              actuals.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
