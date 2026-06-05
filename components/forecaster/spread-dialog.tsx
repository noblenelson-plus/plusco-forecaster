// components/forecaster/spread-dialog.tsx
"use client";

/**
 * Spread dialog — distributes a single amount across the months of one row.
 *
 * The user types a total, ticks the target months, and picks how it is split:
 *   — mode: equal parts, or weighted by the months' existing values
 *   — when the row already holds values, a behaviour choice appears:
 *       · line total      → ticked months get a share, others reset to 0
 *       · replace ticked   → only ticked months change, others kept
 *       · add to ticked    → the share is added on top of the existing values
 * An empty row always behaves as "line total".
 *
 * Rounding is to the cent, with the remainder absorbed by the last ticked
 * month so the parts sum back exactly to the entered total.
 */

import { useState } from "react";
import { X, Lock } from "lucide-react";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import { parseMoney } from "../../lib/format/money";
import { distribute } from "../../lib/format/distribute";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Stable empty set so the default prop value doesn't change identity each render.
const EMPTY_LOCKED: Set<number> = new Set();

type Mode = "equal" | "weighted";
type Behavior = "lineTotal" | "replace" | "add";

interface SpreadDialogProps {
  rowLabel: string;
  months: MonthlyMap;
  /** Months (1–12) closed for the current RFQ — greyed out and not selectable. */
  lockedMonths?: Set<number>;
  onApply: (updates: { month: number; value: number }[]) => void;
  onClose: () => void;
}

export default function SpreadDialog({
  rowLabel,
  months,
  lockedMonths,
  onApply,
  onClose,
}: SpreadDialogProps) {
  const locked = lockedMonths ?? EMPTY_LOCKED;
  const hasExisting = MONTHS.some((m) => (months[m] ?? 0) !== 0);

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("equal");
  const [behavior, setBehavior] = useState<Behavior>("lineTotal");
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(MONTHS.filter((m) => (months[m] ?? 0) !== 0 && !locked.has(m)))
  );

  const checkedArr = MONTHS.filter((m) => checked.has(m));
  const total = parseMoney(amount);
  // An empty row can only behave as "line total".
  const effectiveBehavior: Behavior = hasExisting ? behavior : "lineTotal";
  const canApply = checkedArr.length > 0;

  function toggle(m: number) {
    if (locked.has(m)) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function setAll(on: boolean) {
    setChecked(on ? new Set(MONTHS.filter((m) => !locked.has(m))) : new Set());
  }

  function apply() {
    if (!canApply) return;

    const weights =
      mode === "weighted"
        ? checkedArr.map((m) => months[m] ?? 0)
        : checkedArr.map(() => 1);
    const shares = distribute(total, weights);

    const shareOf = new Map<number, number>();
    checkedArr.forEach((m, i) => shareOf.set(m, shares[i]));

    const updates: { month: number; value: number }[] = [];
    if (effectiveBehavior === "lineTotal") {
      for (const m of MONTHS) {
        // Never touch a locked month — leave its existing value untouched
        // rather than resetting it to 0.
        if (locked.has(m)) continue;
        updates.push({ month: m, value: shareOf.get(m) ?? 0 });
      }
    } else if (effectiveBehavior === "replace") {
      for (const m of checkedArr) updates.push({ month: m, value: shareOf.get(m)! });
    } else {
      // add
      for (const m of checkedArr) {
        updates.push({ month: m, value: (months[m] ?? 0) + shareOf.get(m)! });
      }
    }

    onApply(updates);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
      // The dialog renders inside the grid container, which listens for
      // keyboard / clipboard events. Stop them here so typing or pasting in
      // the dialog never leaks into the spreadsheet cell behind it.
      onKeyDown={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Distribute amount</h3>
            <p className="text-xs text-gray-500 mt-0.5">{rowLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Total amount
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
          </div>

          {/* Months */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">Months</label>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setAll(true)} className="text-gray-500 hover:text-gray-900">
                  All
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setAll(false)} className="text-gray-500 hover:text-gray-900">
                  None
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTHS.map((m, i) => {
                const isLocked = locked.has(m);
                const on = checked.has(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggle(m)}
                    disabled={isLocked}
                    title={isLocked ? "Closed period — locked" : undefined}
                    className={`py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center justify-center gap-1 ${
                      isLocked
                        ? "bg-gray-100/80 border-gray-200 text-gray-300 cursor-not-allowed"
                        : on
                        ? "bg-yellow-400 border-yellow-400 text-gray-900"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {isLocked && <Lock size={9} />}
                    {MONTH_LABELS[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Split</label>
            <div className="flex gap-1.5">
              <ModeButton active={mode === "equal"} onClick={() => setMode("equal")}>
                Equal parts
              </ModeButton>
              <ModeButton active={mode === "weighted"} onClick={() => setMode("weighted")}>
                Weighted by existing
              </ModeButton>
            </div>
          </div>

          {/* Behavior — only relevant when the row already holds values */}
          {hasExisting && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Existing values
              </label>
              <div className="space-y-1.5">
                <RadioRow
                  checked={behavior === "lineTotal"}
                  onClick={() => setBehavior("lineTotal")}
                  title="Line total"
                  desc="Unticked months reset to 0"
                />
                <RadioRow
                  checked={behavior === "replace"}
                  onClick={() => setBehavior("replace")}
                  title="Replace ticked"
                  desc="Unticked months kept as-is"
                />
                <RadioRow
                  checked={behavior === "add"}
                  onClick={() => setBehavior("add")}
                  title="Add to ticked"
                  desc="Share added on top of existing"
                />
              </div>
            </div>
          )}
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
            Distribute over {checkedArr.length || "—"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
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

function RadioRow({
  checked,
  onClick,
  title,
  desc,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left rounded-lg border transition-colors ${
        checked ? "border-yellow-400 bg-yellow-50/60" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <span
        className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
          checked ? "border-yellow-500 bg-yellow-400" : "border-gray-300"
        }`}
      />
      <span>
        <span className="block text-xs font-medium text-gray-900">{title}</span>
        <span className="block text-[11px] text-gray-500">{desc}</span>
      </span>
    </button>
  );
}
