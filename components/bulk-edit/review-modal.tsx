// components/bulk-edit/review-modal.tsx
"use client";

/**
 * QA + confirmation step for a bulk import. Shows the validation outcome, an
 * explicit Add / Replace toggle with a live recap (added / replaced / deleted)
 * recomputed per mode, and the per-row error list — nothing is written until the
 * user confirms. Extends the pattern of components/clients/import-modal.tsx.
 */

import { useMemo, useState } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Plus,
  Replace,
} from "lucide-react";
import {
  type PreparedImport,
  type CommitResult,
  summarizeImport,
  commitImport,
} from "../../lib/services/bulk-import-service";
import type { ImportMode } from "../../lib/format/bulk-forecast";

export default function ReviewModal({
  prepared,
  userUid,
  onClose,
  onImported,
}: {
  prepared: PreparedImport;
  userUid?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>("ADD");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  const summary = useMemo(() => summarizeImport(prepared, mode), [prepared, mode]);

  const canCommit = !importing && summary.readyRows > 0;

  async function handleConfirm() {
    setImporting(true);
    setError("");
    try {
      const res = await commitImport(prepared, mode, userUid);
      setResult(res);
      if (res.errors.length === 0) {
        // Brief success view, then let the parent refresh.
        setTimeout(onImported, 900);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Review import</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Summary pills */}
          <div className="flex flex-wrap items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <Pill color="emerald" icon={<CheckCircle2 size={14} />}>
              {summary.readyRows} ready
            </Pill>
            <Pill color="gray" icon={<Info size={14} />}>
              {summary.affectedTargets} target{summary.affectedTargets !== 1 ? "s" : ""}
            </Pill>
            {summary.ignoredRows > 0 && (
              <Pill color="amber" icon={<Info size={14} />}>
                {summary.ignoredRows} ignored
              </Pill>
            )}
            {summary.errorRows > 0 && (
              <Pill color="red" icon={<AlertTriangle size={14} />}>
                {summary.errorRows} error{summary.errorRows !== 1 ? "s" : ""}
              </Pill>
            )}
          </div>

          {/* Mode toggle + recap */}
          {!result && (
            <div className="px-6 py-4 border-b border-gray-100 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ModeCard
                  active={mode === "ADD"}
                  onClick={() => setMode("ADD")}
                  icon={<Plus size={16} />}
                  title="Add"
                  desc="Upsert: matching rows updated, new rows added, others kept."
                />
                <ModeCard
                  active={mode === "REPLACE"}
                  onClick={() => setMode("REPLACE")}
                  icon={<Replace size={16} />}
                  title="Replace"
                  desc="Overwrite each target's section with these rows."
                />
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="font-semibold">{summary.diff.added}</span> added
                </span>
                <span className="flex items-center gap-1.5 text-blue-700">
                  <span className="font-semibold">{summary.diff.replaced}</span> replaced
                </span>
                <span
                  className={`flex items-center gap-1.5 ${
                    mode === "REPLACE" && summary.diff.deleted > 0 ? "text-red-700" : "text-gray-400"
                  }`}
                >
                  <span className="font-semibold">{summary.diff.deleted}</span> deleted
                </span>
              </div>
            </div>
          )}

          {/* Scrollable body — errors / ignored / result */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {result ? (
              <ResultView result={result} />
            ) : (
              <>
                {summary.errors.length > 0 && (
                  <Section title="Errors — these rows are skipped">
                    {summary.errors.map((e, i) => (
                      <ErrorRow key={i} axis={e.axisId} rowNumber={e.rowNumber} message={e.message} tone="red" />
                    ))}
                  </Section>
                )}
                {summary.ignored.length > 0 && (
                  <Section title="Ignored — computed rows">
                    {summary.ignored.map((e, i) => (
                      <ErrorRow key={i} axis={e.axisId} rowNumber={e.rowNumber} message={e.message} tone="amber" />
                    ))}
                  </Section>
                )}
                {summary.errors.length === 0 && summary.ignored.length === 0 && (
                  <div className="flex flex-col items-center text-center py-6">
                    <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
                    <p className="text-sm font-medium text-gray-900">All rows are valid</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {summary.readyRows} rows ready across {summary.affectedTargets} targets.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

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
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                onClick={handleConfirm}
                disabled={!canCommit}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                {importing
                  ? "Importing…"
                  : `${mode === "ADD" ? "Add" : "Replace"} ${summary.readyRows} row${
                      summary.readyRows !== 1 ? "s" : ""
                    }`}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function Pill({
  color,
  icon,
  children,
}: {
  color: "emerald" | "red" | "amber" | "gray";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const map = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-600",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  } as const;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium ${map[color]}`}>
      {icon}
      {children}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border transition-colors ${
        active
          ? "bg-yellow-50 border-yellow-400 ring-1 ring-yellow-400"
          : "bg-white border-gray-200 hover:bg-gray-50"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        {title}
      </span>
      <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{desc}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function ErrorRow({
  axis,
  rowNumber,
  message,
  tone,
}: {
  axis: string;
  rowNumber: number;
  message: string;
  tone: "red" | "amber";
}) {
  const cls =
    tone === "red"
      ? "bg-red-50 border-red-100 text-red-700"
      : "bg-amber-50 border-amber-100 text-amber-800";
  return (
    <div className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 ${cls}`}>
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 opacity-70" />
      <p className="text-xs leading-relaxed">
        <span className="font-semibold capitalize">{axis}</span> · row {rowNumber} — {message}
      </p>
    </div>
  );
}

function ResultView({ result }: { result: CommitResult }) {
  const ok = result.errors.length === 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center text-center py-4">
        {ok ? (
          <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
        ) : (
          <AlertTriangle size={32} className="text-amber-500 mb-3" />
        )}
        <p className="text-sm font-medium text-gray-900">
          {result.blWrites} BL writes · {result.actualsWrites} actuals writes ·{" "}
          {result.commissionsRecalculated} commission re-syncs
        </p>
        {ok ? (
          <p className="text-xs text-gray-400 mt-1">Import complete.</p>
        ) : (
          <p className="text-xs text-amber-700 mt-1">
            Completed with {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}.
          </p>
        )}
      </div>
      {result.errors.map((e, i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-700"
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">{e}</p>
        </div>
      ))}
    </div>
  );
}
