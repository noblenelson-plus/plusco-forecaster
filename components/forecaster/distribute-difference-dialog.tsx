// components/forecaster/distribute-difference-dialog.tsx
"use client";

/**
 * Distribute-difference dialog — opened from a media-type row in the comparison
 * panel. It pushes a single amount (defaulting to the gap toward the reference,
 * i.e. reference − current) into one or several projects, spread across the
 * ticked months. The amount is always *added* on top of what each project
 * already holds for this type ("add to ticked").
 *
 * Two destination modes:
 *   — single  → 100% of the amount goes to one project
 *   — split   → a percentage per project (must sum to 100%)
 *
 * Within each project the project's slice is spread across the ticked months,
 * either equally or weighted by that project's existing month profile.
 *
 * Projects that don't yet hold this media type are still selectable — the row
 * is created when the distribution is applied (handled by grid.addToCells).
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, SplitSquareHorizontal, Target } from "lucide-react";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import { parseMoney, formatMoney, formatSigned } from "../../lib/format/money";
import { distribute } from "../../lib/format/distribute";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type MonthMode = "equal" | "weighted";
type AllocMode = "single" | "split";

/** One candidate destination project for the difference. */
export interface ProjectTarget {
  bucketId: string;
  name: string;
  /** This media type's existing months in that project (zeros if absent). */
  existing: MonthlyMap;
  /** Whether the project already holds a row of this media type. */
  hasType: boolean;
}

interface DistributeDifferenceDialogProps {
  typeLabel: string;
  bucketLabel: string;
  current: number;
  reference: number;
  /** Label of the base operand — e.g. "BL Input". */
  currentLabel: string;
  /** Label of the reference operand — e.g. "RFQ1 — MediaOcean". */
  referenceLabel: string;
  projects: ProjectTarget[];
  /** Aggregate month profile of this type (all projects) — for the month grid. */
  monthProfile: MonthlyMap;
  /** Emits per-project, per-month deltas to add. rowType is added by the caller. */
  onApply: (updates: { bucketId: string; month: number; delta: number }[]) => void;
  onClose: () => void;
}

function sumMap(map: MonthlyMap): number {
  return MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);
}

export default function DistributeDifferenceDialog({
  typeLabel,
  bucketLabel,
  current,
  reference,
  currentLabel,
  referenceLabel,
  projects,
  monthProfile,
  onApply,
  onClose,
}: DistributeDifferenceDialogProps) {
  // Default amount = the gap to close toward the reference.
  const gap = Math.round((reference - current) * 100) / 100;
  const [amount, setAmount] = useState(() => (gap !== 0 ? String(gap) : ""));

  const [monthMode, setMonthMode] = useState<MonthMode>("equal");
  const [allocMode, setAllocMode] = useState<AllocMode>("single");

  // Month selection — default to the months where this type already has volume,
  // or all months when the type is empty so far.
  const [checked, setChecked] = useState<Set<number>>(() => {
    const withVolume = MONTHS.filter((m) => (monthProfile[m] ?? 0) !== 0);
    return new Set(withVolume.length ? withVolume : MONTHS);
  });

  // Single-project destination — default to the project holding the most of
  // this type today, else the first project.
  const defaultSingle = useMemo(() => {
    const withType = projects.filter((p) => p.hasType);
    const pool = withType.length ? withType : projects;
    if (pool.length === 0) return "";
    return pool.reduce((best, p) =>
      sumMap(p.existing) > sumMap(best.existing) ? p : best
    ).bucketId;
  }, [projects]);
  const [single, setSingle] = useState(defaultSingle);

  // Split percentages — default an even split across projects already holding
  // the type (else across all projects).
  const [percents, setPercents] = useState<Record<string, string>>(() => {
    const pool = projects.filter((p) => p.hasType);
    const targets = (pool.length ? pool : projects).map((p) => p.bucketId);
    const each = targets.length ? Math.floor(100 / targets.length) : 0;
    const map: Record<string, string> = {};
    targets.forEach((id, i) => {
      // Push the rounding remainder onto the first project.
      map[id] = String(i === 0 ? 100 - each * (targets.length - 1) : each);
    });
    return map;
  });

  const checkedArr = MONTHS.filter((m) => checked.has(m));
  const total = parseMoney(amount);

  const splitTotal = useMemo(
    () =>
      projects.reduce(
        (acc, p) => acc + (parseFloat(percents[p.bucketId] ?? "") || 0),
        0
      ),
    [percents, projects]
  );
  const splitValid = Math.abs(splitTotal - 100) < 0.01;

  const canApply =
    total !== 0 &&
    checkedArr.length > 0 &&
    (allocMode === "single" ? !!single : splitValid);

  function toggleMonth(m: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function setAllMonths(on: boolean) {
    setChecked(on ? new Set(MONTHS) : new Set());
  }

  function setPercent(bucketId: string, value: string) {
    setPercents((prev) => ({ ...prev, [bucketId]: value }));
  }

  function evenSplit() {
    const targets = projects.map((p) => p.bucketId);
    const each = Math.floor(100 / targets.length);
    const map: Record<string, string> = {};
    targets.forEach((id, i) => {
      map[id] = String(i === 0 ? 100 - each * (targets.length - 1) : each);
    });
    setPercents(map);
  }

  function apply() {
    if (!canApply) return;

    // Per-project amount of the (annual) total.
    const allocations: { project: ProjectTarget; amount: number }[] =
      allocMode === "single"
        ? projects
            .filter((p) => p.bucketId === single)
            .map((p) => ({ project: p, amount: total }))
        : projects
            .map((p) => ({
              project: p,
              amount:
                (total * (parseFloat(percents[p.bucketId] ?? "") || 0)) / 100,
            }))
            .filter((a) => a.amount !== 0);

    const updates: { bucketId: string; month: number; delta: number }[] = [];
    for (const { project, amount: projectAmount } of allocations) {
      const weights =
        monthMode === "weighted"
          ? checkedArr.map((m) => project.existing[m] ?? 0)
          : checkedArr.map(() => 1);
      const shares = distribute(projectAmount, weights);
      checkedArr.forEach((m, i) => {
        if (shares[i] !== 0)
          updates.push({ bucketId: project.bucketId, month: m, delta: shares[i] });
      });
    }

    onApply(updates);
    onClose();
  }

  const noProjects = projects.length === 0;

  // Render through a portal on <body> so the overlay escapes the comparison
  // panel's stacking context (its `sticky` wrapper creates one). Otherwise the
  // grid's `sticky left-0 z-10` first column would paint above the veil.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Distribute difference
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{typeLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {noProjects ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            No {bucketLabel.toLowerCase()} to receive the difference yet.
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Context — current vs reference + the gap */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs">
                <span className="text-gray-500">
                  {currentLabel}{" "}
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {formatMoney(current)}
                  </span>{" "}
                  · vs {referenceLabel}{" "}
                  <span className="font-medium text-gray-700 tabular-nums">
                    {formatMoney(reference)}
                  </span>
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  gap {formatSigned(gap)}
                </span>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Amount to distribute
                </label>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canApply) apply();
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm text-right tabular-nums border border-gray-200 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Added on top of existing values (add to ticked).
                </p>
              </div>

              {/* Months */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    Months
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => setAllMonths(true)}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      All
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      onClick={() => setAllMonths(false)}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {MONTHS.map((m, i) => {
                    const on = checked.has(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMonth(m)}
                        className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          on
                            ? "bg-yellow-400 border-yellow-400 text-gray-900"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {MONTH_LABELS[i]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Month split mode */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Spread across months
                </label>
                <div className="flex gap-1.5">
                  <ToggleButton
                    active={monthMode === "equal"}
                    onClick={() => setMonthMode("equal")}
                  >
                    Equal parts
                  </ToggleButton>
                  <ToggleButton
                    active={monthMode === "weighted"}
                    onClick={() => setMonthMode("weighted")}
                  >
                    Weighted by existing
                  </ToggleButton>
                </div>
              </div>

              {/* Destination mode */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Destination {bucketLabel.toLowerCase()}
                </label>
                <div className="flex gap-1.5 mb-2">
                  <ToggleButton
                    active={allocMode === "single"}
                    onClick={() => setAllocMode("single")}
                  >
                    <Target size={12} className="inline mr-1 -mt-0.5" />
                    Single
                  </ToggleButton>
                  <ToggleButton
                    active={allocMode === "split"}
                    onClick={() => setAllocMode("split")}
                  >
                    <SplitSquareHorizontal size={12} className="inline mr-1 -mt-0.5" />
                    Split %
                  </ToggleButton>
                </div>

                {allocMode === "single" ? (
                  <div className="space-y-1.5">
                    {projects.map((p) => (
                      <button
                        key={p.bucketId}
                        onClick={() => setSingle(p.bucketId)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg border transition-colors ${
                          single === p.bucketId
                            ? "border-yellow-400 bg-yellow-50/60"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                            single === p.bucketId
                              ? "border-yellow-500 bg-yellow-400"
                              : "border-gray-300"
                          }`}
                        />
                        <span className="flex-1 min-w-0 text-xs font-medium text-gray-900 truncate">
                          {p.name}
                        </span>
                        {!p.hasType && (
                          <span className="text-[10px] text-gray-400 shrink-0">
                            new row
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <button
                        onClick={evenSplit}
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
                        <span className="flex-1 min-w-0 text-xs text-gray-800 truncate">
                          {p.name}
                          {!p.hasType && (
                            <span className="ml-1 text-[10px] text-gray-400">
                              new row
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={percents[p.bucketId] ?? ""}
                          onChange={(e) =>
                            setPercent(p.bucketId, e.target.value)
                          }
                          placeholder="0"
                          className="w-14 px-2 py-1 text-xs text-right tabular-nums border border-gray-200 rounded-md
                            focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    ))}
                  </div>
                )}
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
                disabled={!canApply}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
              >
                Distribute
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors ${
        active
          ? "bg-gray-900 border-gray-900 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
