// components/forecaster/copy-row-modal.tsx
"use client";

/**
 * Copies one BL Input row to another submission (any year + RFQ) of the same
 * client. Available even when the current submission is locked — but the
 * destination must be UNLOCKED. When the destination already holds a matching
 * row, the user chooses whether to overwrite it or add a new line.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Copy, ArrowRight, Check, AlertTriangle } from "lucide-react";
import type { AxisConfig, ForecastRow } from "../../lib/types/forecaster.types";
import type { RFQ, RFQType } from "../../lib/types/rfq.types";
import { RFQ_TYPES, sortRFQs } from "../../lib/types/rfq.types";
import {
  applyRowCopy,
  planRowCopy,
  type CopyDest,
  type CopyMode,
  type RowCopyPlan,
} from "../../lib/services/copy-row-service";

const RFQ_TYPE_LABEL: Record<RFQType, string> = Object.fromEntries(
  RFQ_TYPES.map((t) => [t.value, t.label])
) as Record<RFQType, string>;

export interface CopyRowSource {
  row: ForecastRow;
  bucketName: string;
}

interface CopyRowModalProps {
  source: CopyRowSource;
  config: AxisConfig;
  clientId: string;
  clientName: string;
  sourceYear: number;
  sourceRfq: RFQType;
  rfqs: RFQ[];
  userUid?: string;
  onClose: () => void;
  /** Called after a successful copy, with the destination that received it. */
  onCopied?: (dest: CopyDest) => void;
}

export default function CopyRowModal({
  source,
  config,
  clientId,
  clientName,
  sourceYear,
  sourceRfq,
  rfqs,
  userUid,
  onClose,
  onCopied,
}: CopyRowModalProps) {
  const years = useMemo(
    () => [...new Set(rfqs.map((r) => r.year))].sort((a, b) => b - a),
    [rfqs]
  );

  // Destination selection. Kept as nullable "user picked" state; the effective
  // values are derived below so we never need an effect to seed/repair them.
  const [destYear, setDestYear] = useState<number | null>(null);
  const [destType, setDestType] = useState<RFQType | null>(null);
  const [mode, setMode] = useState<CopyMode>("overwrite");
  const [plan, setPlan] = useState<RowCopyPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const allowDuplicates = config.allowDuplicateRowTypes;

  // Effective year — the user's pick, else the source's year (a common target),
  // else the newest year with an RFQ.
  const destYearEff =
    destYear ?? (years.includes(sourceYear) ? sourceYear : years[0] ?? null);

  const typesForYear = useMemo(
    () => sortRFQs(rfqs.filter((r) => r.year === destYearEff)),
    [rfqs, destYearEff]
  );

  // Effective submission — the user's pick when still valid for the year, else
  // the first available one.
  const destTypeEff =
    destType && typesForYear.some((r) => r.type === destType)
      ? destType
      : typesForYear[0]?.type ?? null;

  const destRfq = useMemo(
    () => rfqs.find((r) => r.year === destYearEff && r.type === destTypeEff) ?? null,
    [rfqs, destYearEff, destTypeEff]
  );

  const isSameSubmission = destYearEff === sourceYear && destTypeEff === sourceRfq;
  const destLocked = destRfq?.status === "LOCKED";
  const destSelectable = !!destRfq && !destLocked && !isSameSubmission;

  // Reset the dry run whenever the (valid) destination changes — done in render
  // (React's "adjust state on change" pattern) so it lands before the fetch
  // effect and without a synchronous setState inside an effect body.
  const destKey =
    destSelectable && destRfq ? `${destRfq.year}_${destRfq.type}` : null;
  const [plannedKey, setPlannedKey] = useState<string | null>(null);
  if (destKey !== plannedKey) {
    setPlannedKey(destKey);
    setPlan(null);
    setError("");
    setPlanning(destKey !== null);
  }

  // Dry run for the chosen destination. Every setState lives in an async
  // callback (the guard just bails), so nothing fires synchronously here.
  useEffect(() => {
    if (!destKey || !destRfq) return;
    let cancelled = false;
    planRowCopy({
      dest: { clientId, year: destRfq.year, rfq: destRfq.type },
      axisId: config.axisId,
      source: source.row,
      sourceBucketName: source.bucketName,
    })
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        // With duplicates forbidden, a clash can only be resolved by overwriting.
        setMode(p.conflict ? "overwrite" : "add");
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to inspect the destination.");
      })
      .finally(() => {
        if (!cancelled) setPlanning(false);
      });
    return () => {
      cancelled = true;
    };
    // destKey identifies the destination; other inputs are stable per modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey]);

  async function handleApply() {
    if (!destRfq || !destSelectable) return;
    setApplying(true);
    setError("");
    const dest: CopyDest = { clientId, year: destRfq.year, rfq: destRfq.type };
    try {
      await applyRowCopy({
        dest,
        axisId: config.axisId,
        source: source.row,
        sourceBucketName: source.bucketName,
        // With no clash, "add" is always correct; with a clash the radio decides.
        mode: plan?.conflict ? mode : "add",
        userUid,
      });
      setDone(true);
      onCopied?.(dest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy the row.");
    } finally {
      // Re-enable the footer buttons (Close on success, Cancel/Copy on error).
      setApplying(false);
    }
  }

  const rowTypeLabel = source.row.label || source.row.rowType;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={applying ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Copy to submission</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Copy this {config.title} line to another submission of {clientName}.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            className="p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* What is being copied */}
          <div className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
            <div className="text-gray-900 font-medium truncate">{rowTypeLabel}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {config.bucketLabel}: {source.bucketName} · from {sourceYear}{" "}
              {RFQ_TYPE_LABEL[sourceRfq]}
            </div>
          </div>

          {done ? (
            <div className="bg-green-500 text-white px-3 py-2.5 rounded-lg text-sm flex items-center gap-2">
              <Check size={16} className="flex-shrink-0" />
              Copied to {destRfq?.year} {destTypeEff && RFQ_TYPE_LABEL[destTypeEff]}.
            </div>
          ) : (
            <>
              {/* Destination pickers */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Year
                  </label>
                  <select
                    value={destYearEff ?? ""}
                    onChange={(e) => setDestYear(Number(e.target.value))}
                    disabled={applying}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <ArrowRight size={14} className="text-gray-300 mb-2.5 flex-shrink-0" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Submission
                  </label>
                  <select
                    value={destTypeEff ?? ""}
                    onChange={(e) => setDestType(e.target.value as RFQType)}
                    disabled={applying || typesForYear.length === 0}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                  >
                    {typesForYear.map((r) => (
                      <option key={r.type} value={r.type}>
                        {RFQ_TYPE_LABEL[r.type]}
                        {r.status === "LOCKED" ? " (locked)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Validation / status messages */}
              {isSameSubmission && (
                <p className="text-xs text-gray-500">
                  Pick a submission different from the source.
                </p>
              )}
              {destLocked && !isSameSubmission && (
                <div className="bg-yellow-400 text-gray-900 px-3 py-2 rounded-lg text-xs flex gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  This submission is locked — choose an unlocked one to copy into.
                </div>
              )}

              {/* Dry-run outcome */}
              {destSelectable && (
                <div className="text-xs text-gray-500 min-h-[1.25rem]">
                  {planning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Checking destination…
                    </span>
                  ) : plan ? (
                    plan.bucketExists ? (
                      plan.conflict ? (
                        <span>
                          A “{rowTypeLabel}” line already exists in this{" "}
                          {config.bucketLabel.toLowerCase()}.
                        </span>
                      ) : (
                        <span>
                          Will be added to the existing {config.bucketLabel.toLowerCase()} “
                          {source.bucketName}”.
                        </span>
                      )
                    ) : (
                      <span>
                        A new {config.bucketLabel.toLowerCase()} “{source.bucketName}” will
                        be created.
                      </span>
                    )
                  ) : null}
                </div>
              )}

              {/* Conflict resolution */}
              {destSelectable && plan?.conflict && (
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="copy-mode"
                      checked={mode === "overwrite"}
                      onChange={() => setMode("overwrite")}
                      disabled={applying}
                      className="mt-0.5 accent-yellow-400"
                    />
                    <span className="text-sm text-gray-700">
                      Overwrite the existing line
                      <span className="block text-xs text-gray-400">
                        Replaces its monthly values with this one&apos;s.
                      </span>
                    </span>
                  </label>
                  {allowDuplicates && (
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="copy-mode"
                        checked={mode === "add"}
                        onChange={() => setMode("add")}
                        disabled={applying}
                        className="mt-0.5 accent-yellow-400"
                      />
                      <span className="text-sm text-gray-700">
                        Add as a new line
                        <span className="block text-xs text-gray-400">
                          Keeps the existing line and adds a second one.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={handleApply}
              disabled={applying || planning || !destSelectable}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
              {applying ? "Copying…" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
