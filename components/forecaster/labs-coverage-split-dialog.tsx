// components/forecaster/labs-coverage-split-dialog.tsx
"use client";

/**
 * Labs coverage split dialog — opened when a partner appears in several projects
 * and the user sets a desired coverage % for it. The % resolves to a target
 * spend (that share of the planned media); this dialog lets the user choose how
 * that target is split across the projects the partner is in. Within each
 * project the monthly shape still follows the media curve (handled by the
 * caller); here we only collect the per-project percentages.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, SplitSquareHorizontal } from "lucide-react";
import { formatMoney } from "../../lib/format/money";

export interface ProjectShareTarget {
  bucketId: string;
  rowId: string;
  /** Project (bucket) name. */
  name: string;
  /** Partner's current annual spend in this project. */
  currentAnnual: number;
}

interface DialogProps {
  partnerName: string;
  mediaTypeLabel: string;
  /** Desired coverage % of the media type. */
  pct: number;
  /** Resulting annual target spend (pct% of the planned media). */
  targetAnnual: number;
  projects: ProjectShareTarget[];
  /** Emits per-project percentages (sum 100). */
  onApply: (shares: Record<string, number>) => void;
  onClose: () => void;
}

function evenShares(projects: ProjectShareTarget[]): Record<string, number> {
  const each = Math.floor(100 / projects.length);
  const map: Record<string, number> = {};
  projects.forEach((p, i) => {
    // First project absorbs the rounding remainder.
    map[p.bucketId] = i === 0 ? 100 - each * (projects.length - 1) : each;
  });
  return map;
}

export default function LabsCoverageSplitDialog({
  partnerName,
  mediaTypeLabel,
  pct,
  targetAnnual,
  projects,
  onApply,
  onClose,
}: DialogProps) {
  // Default split — proportional to current spend, else even.
  const [percents, setPercents] = useState<Record<string, string>>(() => {
    const total = projects.reduce((acc, p) => acc + p.currentAnnual, 0);
    if (total <= 0) {
      const even = evenShares(projects);
      return Object.fromEntries(
        Object.entries(even).map(([k, v]) => [k, String(v)])
      );
    }
    const raw = projects.map((p) => Math.round((p.currentAnnual / total) * 100));
    // Push the rounding remainder onto the first project so it sums to 100.
    const drift = 100 - raw.reduce((a, b) => a + b, 0);
    const map: Record<string, string> = {};
    projects.forEach((p, i) => {
      map[p.bucketId] = String(raw[i] + (i === 0 ? drift : 0));
    });
    return map;
  });

  const splitTotal = useMemo(
    () =>
      projects.reduce(
        (acc, p) => acc + (parseFloat(percents[p.bucketId] ?? "") || 0),
        0
      ),
    [percents, projects]
  );
  const splitValid = Math.abs(splitTotal - 100) < 0.01;

  function setPercent(bucketId: string, value: string) {
    setPercents((prev) => ({ ...prev, [bucketId]: value }));
  }

  function setEven() {
    const even = evenShares(projects);
    setPercents(
      Object.fromEntries(Object.entries(even).map(([k, v]) => [k, String(v)]))
    );
  }

  function apply() {
    if (!splitValid) return;
    const shares: Record<string, number> = {};
    for (const p of projects) {
      shares[p.bucketId] = parseFloat(percents[p.bucketId] ?? "") || 0;
    }
    onApply(shares);
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <SplitSquareHorizontal size={15} className="text-gray-400" />
              Split across projects
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {partnerName} · {mediaTypeLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Target context */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs">
            <span className="text-gray-500">
              {pct}% of {mediaTypeLabel} planned
            </span>
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatMoney(targetAnnual)}
            </span>
          </div>

          {/* Per-project split */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] mb-0.5">
              <button
                onClick={setEven}
                className="text-gray-500 hover:text-gray-900"
              >
                Even split
              </button>
              <span
                className={`tabular-nums font-medium ${
                  splitValid ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {Math.round(splitTotal)}% / 100%
              </span>
            </div>
            {projects.map((p) => (
              <div
                key={p.bucketId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-gray-800 truncate">{p.name}</span>
                  <span className="block text-[10px] text-gray-400 tabular-nums">
                    now {formatMoney(p.currentAnnual)}
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={percents[p.bucketId] ?? ""}
                  onChange={(e) => setPercent(p.bucketId, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && splitValid) apply();
                  }}
                  placeholder="0"
                  className="w-14 px-2 py-1 text-xs text-right tabular-nums border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!splitValid}
            className="px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
