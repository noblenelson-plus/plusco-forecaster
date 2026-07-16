// components/bulk-edit/review-modal.tsx
"use client";

/**
 * QA + confirmation step for a bulk import. Imports are always REPLACE: each
 * targeted client × submission × section is overwritten by the sheet's rows.
 * The modal shows the validation outcome, preview chips of exactly which
 * targets get replaced, and the per-row error list — nothing is written until
 * the user confirms.
 */

import { useMemo, useState } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Replace,
} from "lucide-react";
import {
  type PreparedImport,
  type CommitResult,
  summarizeImport,
  commitImport,
  replaceTargets,
} from "../../lib/services/bulk-import-service";
import TargetChips from "./target-chips";

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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  const summary = useMemo(() => summarizeImport(prepared, "REPLACE"), [prepared]);
  const targets = useMemo(() => replaceTargets(prepared), [prepared]);

  const canCommit = !importing && summary.readyRows > 0;

  async function handleConfirm() {
    setImporting(true);
    setError("");
    try {
      const res = await commitImport(prepared, "REPLACE", userUid);
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

          {/* Summary pills — hover any pill for its definition */}
          <div className="flex flex-wrap items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <Pill
              color="emerald"
              icon={<CheckCircle2 size={14} />}
              title="Sheet rows that passed validation — these are the rows that will be written."
            >
              {summary.readyRows} valid row{summary.readyRows !== 1 ? "s" : ""}
            </Pill>
            {summary.ignoredRows > 0 && (
              <Pill
                color="amber"
                icon={<Info size={14} />}
                title="Rows skipped on purpose: the BL Commission line is always computed from Media Spend, so importing it makes no sense."
              >
                {summary.ignoredRows} skipped (computed)
              </Pill>
            )}
            {summary.errorRows > 0 && (
              <Pill
                color="red"
                icon={<AlertTriangle size={14} />}
                title="Rows with a problem (unknown client, locked RFQ, bad value…) — they will NOT be written. Details below."
              >
                {summary.errorRows} error{summary.errorRows !== 1 ? "s" : ""}
              </Pill>
            )}
          </div>

          {/* Replace recap + preview chips of every target. Scrolls itself if
              a small viewport forces it to shrink. */}
          {!result && (
            <div className="px-6 py-4 border-b border-gray-100 space-y-3 overflow-y-auto">
              <div className="flex items-start gap-2.5 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
                <Replace size={16} className="mt-0.5 flex-shrink-0 text-yellow-700" />
                <p className="text-sm text-gray-800 leading-relaxed">
                  <span className="font-semibold">Replace</span> — each section
                  below is overwritten by the sheet&apos;s rows. Anything in
                  those sections that isn&apos;t in the sheet is removed.
                </p>
              </div>
              {/* Line-level impact vs the live data, spelled out */}
              <div className="grid grid-cols-3 gap-3">
                <DiffStat
                  value={summary.diff.added}
                  tone="emerald"
                  label="New lines"
                  desc="In the sheet but not in the app yet — they get created."
                />
                <DiffStat
                  value={summary.diff.replaced}
                  tone="blue"
                  label="Overwritten"
                  desc="Already in the app — their values are replaced by the sheet's."
                />
                <DiffStat
                  value={summary.diff.deleted}
                  tone={summary.diff.deleted > 0 ? "red" : "gray"}
                  label="Removed"
                  desc="In the app but missing from the sheet — deleted by the replace."
                />
              </div>
              {targets.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Sections being replaced
                  </p>
                  {/* Capped + scrollable so a large import can't squeeze the
                      error list below out of the modal. */}
                  <div className="max-h-52 overflow-y-auto">
                    <TargetChips targets={targets} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scrollable body — errors / ignored / result. min-h keeps it
              visible even when the recap above is at its cap. */}
          <div className="flex-1 min-h-32 overflow-y-auto px-6 py-4 space-y-4">
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
                      {summary.readyRows} rows ready to write.
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
                  : `Replace ${summary.readyRows} row${
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
  title,
  children,
}: {
  color: "emerald" | "red" | "amber" | "gray";
  icon: React.ReactNode;
  /** Plain-language definition, shown on hover. */
  title?: string;
  children: React.ReactNode;
}) {
  const map = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-600",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  } as const;
  return (
    <div
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium ${map[color]} ${title ? "cursor-help" : ""}`}
    >
      {icon}
      {children}
    </div>
  );
}

/** One line-level impact stat (new / overwritten / removed), definition inline. */
function DiffStat({
  value,
  tone,
  label,
  desc,
}: {
  value: number;
  tone: "emerald" | "blue" | "red" | "gray";
  label: string;
  desc: string;
}) {
  const map = {
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    red: "text-red-700",
    gray: "text-gray-400",
  } as const;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <p className={`text-sm font-semibold ${map[tone]}`}>
        {value} <span className="font-medium">{label.toLowerCase()}</span>
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{desc}</p>
    </div>
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
          {result.blWrites} BL writes · {result.actualsWrites} admin writes ·{" "}
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
