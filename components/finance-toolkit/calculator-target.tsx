// filepath: components/finance-toolkit/calculator-target.tsx
"use client";

/**
 * Finance Toolkit · Targets Calculator — "Hit a target margin". Works
 * backwards from a run-rate margin goal: the team size, the average cost per
 * hour, or the revenue (team held fixed) that lands exactly on it, each with
 * an Apply button that writes the answer into the plan's settings.
 */

import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { solveForMargin, type StaffingPlan, type TargetSolution } from "../../lib/finance-toolkit/model";
import { NumInput } from "./calculator-levers";
import { CardShell } from "./ft-ui";
import { formatCompactMoney, fte, pct, rate } from "./ft-format";

function Option({
  title,
  now,
  needed,
  delta,
  explain,
  onApply,
  disabled,
}: {
  title: string;
  now: string;
  needed: string;
  delta: string;
  explain: string;
  onApply: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 border border-gray-200 bg-white p-4">
      <div>
        <div className="text-xs font-semibold text-gray-900">{title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-gray-900">{needed}</span>
          <span className="text-xs tabular-nums text-gray-500">now {now}</span>
        </div>
        <div className="text-xs font-semibold tabular-nums text-gray-700">{delta}</div>
        <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{explain}</p>
      </div>
      <button
        type="button"
        onClick={onApply}
        disabled={disabled}
        className="self-start bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Apply to plan
      </button>
    </div>
  );
}

const signed = (v: number, fmt: (x: number) => string) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

export default function TargetCard({
  plan,
  onApply,
  bare,
}: {
  plan: StaffingPlan;
  onApply: (kind: "team" | "rate" | "revenue", solution: TargetSolution) => void;
  /** Inside a Disclosure that already carries the title. */
  bare?: boolean;
}) {
  const [targetPct, setTargetPct] = useState<number | null>(55);
  const solution = useMemo(() => (targetPct === null ? null : solveForMargin(plan, targetPct / 100)), [plan, targetPct]);
  const gap = targetPct === null ? null : plan.runRateMarginPct - targetPct / 100;

  return (
    <CardShell bare={bare}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!bare && (
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Crosshair size={16} className="text-primary" /> Hit a target margin
            </div>
          )}
          <p className="mt-0.5 text-xs text-gray-500">
            Pick the margin you want once the team is fully staffed. Here are three ways to get there; each keeps the rest of the plan as it is.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Target</span>
          <NumInput ariaLabel="Target run-rate margin" value={targetPct} min={-50} max={95} suffix="%" className="w-24" onChange={setTargetPct} />
          {gap !== null && (
            <span className={`px-2 py-1 text-xs font-semibold ${gap >= 0 ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
              Plan {pct(plan.runRateMarginPct)} · {gap >= 0 ? "meets it" : `${(Math.abs(gap) * 100).toFixed(1)} pts short`}
            </span>
          )}
        </div>
      </div>

      {solution && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Option
            title="Right-size the team"
            needed={`${fte(solution.maxFte)} FTE`}
            now={`${fte(plan.runRateFte)} FTE`}
            delta={`${signed(solution.maxFte - plan.runRateFte, fte)} FTE at run rate`}
            explain="The largest team the revenue pays for at this margin, same role mix and rates."
            onApply={() => onApply("team", solution)}
          />
          <Option
            title="Change the seniority mix"
            needed={`${rate(solution.maxBlendedRate)} / h`}
            now={`${rate(plan.blendedRate)} / h`}
            delta={`${signed(solution.rateFactor - 1, (x) => pct(x, 0))} on every role’s cost per hour`}
            explain="The average cost of an hour that makes the target, same team size. Apply scales the seniority setting."
            onApply={() => onApply("rate", solution)}
            disabled={!(solution.rateFactor > 0)}
          />
          <Option
            title="Grow the revenue, same team"
            needed={formatCompactMoney(solution.revenueNeeded)}
            now={formatCompactMoney(plan.annualRevenue)}
            delta={`${signed(solution.revenueNeeded - plan.annualRevenue, formatCompactMoney)} a year`}
            explain="The annual revenue that pays for today’s team at this margin. Apply fixes the team at its current size and sets the revenue."
            onApply={() => onApply("revenue", solution)}
          />
        </div>
      )}
    </CardShell>
  );
}
