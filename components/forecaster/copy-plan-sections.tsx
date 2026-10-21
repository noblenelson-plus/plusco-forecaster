// components/forecaster/copy-plan-sections.tsx
"use client";

/**
 * Sections shared by the structured copy dialogs ("Copy to my submission" from
 * the reference strips, "Copy to Labs" from Media Spend): the month picker and
 * the "what happens to your existing data" overwrite preview of a CopyPlan.
 */

import { AlertTriangle, Lock } from "lucide-react";
import { MONTHS } from "../../lib/types/common.types";
import type { CopyPlan } from "../../lib/format/reference-copy";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function money(v: number): string {
  return Math.round(v).toLocaleString("en-CA");
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "Which months?" — a 12-month toggle grid with Months with data / All / None
 * shortcuts. Closed months are shown locked and can't be ticked.
 */
export function CopyMonthPicker({
  step,
  months,
  onChange,
  dataMonths,
  isMonthOpen,
  emptyHint,
}: {
  /** Step number shown in the heading. */
  step: number;
  months: Set<number>;
  onChange: (months: Set<number>) => void;
  /** Months where the source carries a non-zero value. */
  dataMonths: number[];
  isMonthOpen: (m: number) => boolean;
  /** Tooltip of an open month without data. */
  emptyHint: string;
}) {
  const toggle = (m: number) => {
    const next = new Set(months);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    onChange(next);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {step} · Which months?
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onChange(new Set(dataMonths.filter(isMonthOpen)))}
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Months with data
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set(MONTHS.filter(isMonthOpen)))}
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            None
          </button>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {MONTHS.map((m) => {
          const open = isMonthOpen(m);
          const on = open && months.has(m);
          const hasData = dataMonths.includes(m);
          return (
            <button
              key={m}
              type="button"
              disabled={!open}
              onClick={() => toggle(m)}
              aria-pressed={on}
              title={!open ? "Closed period — read only" : hasData ? undefined : emptyHint}
              className={`flex items-center justify-center gap-1 border px-1 py-1.5 text-xs font-medium transition-colors ${
                !open
                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                  : on
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              } ${hasData || !open ? "" : "italic"}`}
            >
              {!open && <Lock size={10} />}
              {MONTH_LABELS[m - 1]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The overwrite preview of a plan: a yellow table of every filled cell that
 * will be replaced (now → after), or a green "nothing replaced" note.
 * Renders nothing while no month is chosen or nothing would be written.
 */
export function CopyOverwritePreview({
  plan,
  hasMonths,
  bucketLabel,
  rowTypeLabel,
}: {
  plan: CopyPlan;
  hasMonths: boolean;
  bucketLabel: string;
  rowTypeLabel: string;
}) {
  if (!hasMonths) return null;
  if (plan.overwrittenCells > 0) {
    return (
      <div className="space-y-1.5 bg-yellow-400 px-3 py-2 text-gray-900">
        <div className="flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <strong>
            {plural(plan.overwrittenCells, "filled cell")} across{" "}
            {plural(plan.overwrittenRows, "row")} will be replaced:
          </strong>
        </div>
        <div className="max-h-36 overflow-y-auto bg-white">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-100 text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left font-medium">{bucketLabel}</th>
                <th className="px-2 py-1 text-left font-medium">{rowTypeLabel}</th>
                <th className="px-2 py-1 text-left font-medium">Month</th>
                <th className="px-2 py-1 text-right font-medium">Now</th>
                <th className="px-2 py-1 text-right font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.overwrites.map((o) => (
                <tr key={`${o.project}|${o.label}|${o.month}`}>
                  <td className="max-w-[8rem] truncate px-2 py-1" title={o.project}>{o.project}</td>
                  <td className="max-w-[8rem] truncate px-2 py-1" title={o.label}>{o.label}</td>
                  <td className="px-2 py-1">{MONTH_LABELS[o.month - 1]}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-500 line-through">
                    {money(o.current)}
                  </td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">
                    {money(o.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (plan.cellCount > 0) {
    return (
      <p className="bg-green-500 px-3 py-2 font-medium text-white">
        Nothing already in your submission will be replaced — these cells are
        empty today.
      </p>
    );
  }
  return null;
}
