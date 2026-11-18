// filepath: components/finance-toolkit/calculator-scenarios.tsx
"use client";

/**
 * Finance Toolkit · Targets Calculator — saved scenarios, compared side by
 * side with the current plan. A scenario is the calculator's inputs (agency,
 * revenue, comparables, settings); its figures are recomputed live with the
 * current cost basis. Kept in this browser only (localStorage), per viewer.
 */

import { useMemo, useState } from "react";
import { Bookmark, Trash2, Upload } from "lucide-react";
import ChartCard from "../dashboard/charts/chart-card";
import {
  changedLevers,
  comparableCandidates,
  MODEL,
  staffingPlan,
  suggestComparables,
  type Comparable,
  type PlanLevers,
  type StaffingPlan,
} from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { formatCompactMoney, fte, money, pct } from "./ft-format";

export interface CalculatorInputs {
  agency: string;
  revenue: number;
  /** Maconomy client numbers of hand-picked comparables; null = auto. */
  comparables: string[] | null;
  levers: PlanLevers;
}

export interface Scenario extends CalculatorInputs {
  id: string;
  name: string;
  savedAt: string;
}

const STORAGE_KEY = "ft-calculator-scenarios-v1";
export const MAX_SCENARIOS = 5;

export function loadScenarios(): Scenario[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Scenario[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeScenarios(list: Scenario[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private window): scenarios last for this visit only.
  }
}

/** The comparables an inputs set resolves to, against this dataset. */
export function resolveComparables(inputs: CalculatorInputs, candidates: Comparable[], max: number): Comparable[] {
  if (!inputs.comparables) return suggestComparables(candidates, inputs.revenue, max);
  return inputs.comparables.map((n) => candidates.find((c) => c.client.number === n)).filter((c): c is Comparable => !!c);
}

interface Column {
  key: string;
  name: string;
  current: boolean;
  scenario?: Scenario;
  plan: StaffingPlan | null;
  agency: string;
  currency: string;
}

export default function ScenariosCard({
  current,
  currentPlan,
  basis,
  maxComparables,
  onLoad,
}: {
  current: CalculatorInputs;
  currentPlan: StaffingPlan | null;
  basis: CostBasis;
  maxComparables: number;
  onLoad: (s: Scenario) => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => (typeof window === "undefined" ? [] : loadScenarios()));
  const [name, setName] = useState("");

  const update = (list: Scenario[]) => {
    setScenarios(list);
    storeScenarios(list);
  };

  const save = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const s: Scenario = {
      ...current,
      levers: JSON.parse(JSON.stringify(current.levers)) as PlanLevers,
      id: `${Date.now()}`,
      name: name.trim() || `Scenario ${scenarios.length + 1}`,
      savedAt: new Date().toISOString(),
    };
    update([...scenarios, s]);
    setName("");
  };

  const columns: Column[] = useMemo(() => {
    const candidatesByAgency = new Map<string, Comparable[]>();
    const candidatesFor = (agency: string) => {
      if (!candidatesByAgency.has(agency)) candidatesByAgency.set(agency, comparableCandidates(agency, basis));
      return candidatesByAgency.get(agency)!;
    };
    const currencyOf = (agency: string) => MODEL.agencies.find((a) => a.id === agency)?.currency ?? "CAD";
    return [
      { key: "current", name: "Current plan", current: true, plan: currentPlan, agency: current.agency, currency: currencyOf(current.agency) },
      ...scenarios.map((s) => ({
        key: s.id,
        name: s.name,
        current: false,
        scenario: s,
        agency: s.agency,
        currency: currencyOf(s.agency),
        plan: staffingPlan(s.agency, s.revenue, resolveComparables(s, candidatesFor(s.agency), maxComparables), basis, s.levers),
      })),
    ];
  }, [scenarios, current.agency, currentPlan, basis, maxComparables]);

  const best = Math.max(...columns.map((c) => c.plan?.runRateMarginPct ?? -Infinity));
  const agencyName = (id: string) => MODEL.agencies.find((a) => a.id === id)?.name ?? id;

  const rows: { label: string; render: (c: Column) => React.ReactNode }[] = [
    { label: "Agency", render: (c) => agencyName(c.agency) },
    { label: "Annual revenue", render: (c) => (c.plan ? `${formatCompactMoney(c.plan.annualRevenue)} ${c.currency}` : "—") },
    { label: "Team at run rate", render: (c) => (c.plan ? `${fte(c.plan.runRateFte)} FTE` : "—") },
    { label: "Year-1 staffing cost", render: (c) => (c.plan ? money(c.plan.yearCost) : "—") },
    { label: "Year-1 margin", render: (c) => (c.plan ? pct(c.plan.yearMarginPct) : "—") },
    {
      label: "Run-rate margin",
      render: (c) =>
        c.plan ? (
          <span className={c.plan.runRateMarginPct === best && columns.length > 1 ? "bg-green-500 px-1.5 py-0.5 text-white" : ""}>{pct(c.plan.runRateMarginPct)}</span>
        ) : (
          "—"
        ),
    },
    {
      label: "vs current (run-rate)",
      render: (c) => {
        const base = columns[0].plan;
        if (c.current || !c.plan || !base) return "—";
        const d = (c.plan.runRateMarginPct - base.runRateMarginPct) * 100;
        return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`;
      },
    },
    {
      label: "Settings changed",
      render: (c) => {
        const l = c.current ? current.levers : c.scenario!.levers;
        const n = changedLevers(l);
        return n === 0 ? "Data-based" : `${n}`;
      },
    },
  ];

  return (
    <ChartCard
      title="Scenarios"
      subtitle={`Save versions of the plan and compare them side by side (up to ${MAX_SCENARIOS}, kept in this browser)`}
      icon={Bookmark}
      action={
        <div className="flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={`Scenario ${scenarios.length + 1}`}
            aria-label="Scenario name"
            maxLength={40}
            className="w-36 border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            type="button"
            onClick={save}
            disabled={scenarios.length >= MAX_SCENARIOS || !currentPlan}
            className="bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Save current
          </button>
        </div>
      }
    >
      {scenarios.length === 0 ? (
        <p className="border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500">
          Try a few versions — e.g. “Base”, “Lean team”, “Senior-heavy” — and save each to compare them here.
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold" />
                {columns.map((c) => (
                  <th key={c.key} className={`min-w-[140px] px-3 py-2.5 text-right font-semibold ${c.current ? "bg-gray-900 text-yellow-400" : ""}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="truncate normal-case tracking-normal" title={c.name}>
                        {c.name}
                      </span>
                      {c.scenario && (
                        <>
                          <button type="button" onClick={() => onLoad(c.scenario!)} title="Load into the calculator" aria-label={`Load ${c.name}`} className="text-gray-400 hover:text-gray-900">
                            <Upload size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => update(scenarios.filter((s) => s.id !== c.key))}
                            title="Delete scenario"
                            aria-label={`Delete ${c.name}`}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-gray-600">{r.label}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">
                      {r.render(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
