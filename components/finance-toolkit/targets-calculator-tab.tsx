// filepath: components/finance-toolkit/targets-calculator-tab.tsx
"use client";

/**
 * Finance Toolkit · Tab 3 — New Business Calculator. Three plain questions
 * (agency, expected annual gross revenue, which current clients it is most
 * like), then the answer in one sentence: the team needed, year-1 cost and
 * margin. The plan (hours and FTEs by role, month by month) is scaled from 1–3
 * comparable accounts: their hours per revenue dollar, their role mix, the
 * agency's cost per hour by role, and the onboarding ramp seen on new clients.
 *
 * Below the answer: a visible what-if card (team size, seniority, target
 * margin via calculator-target), then the staffing chart and table, and
 * folded away: every setting (calculator-levers), saved scenarios
 * (calculator-scenarios), the comparables, and the formulas. Each headline
 * figure and role opens a step-by-step "Why?" (calculator-why).
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Bookmark,
  Briefcase,
  CalendarRange,
  DollarSign,
  HelpCircle,
  Percent,
  SlidersHorizontal,
  Table2,
  Users,
  X,
} from "lucide-react";
import StatCard, { type StatVariance } from "../dashboard/charts/stat-card";
import ChartCard from "../dashboard/charts/chart-card";
import { NEUTRAL_FILL, PLUS } from "../dashboard/charts/colors";
import { Card } from "../ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart";
import {
  DEFAULT_LEVERS,
  MODEL,
  RAMP_SETTINGS,
  REVENUE_WINDOW,
  ROLE_MIN_SHARE,
  changedLevers,
  comparableCandidates,
  staffingPlan,
  suggestComparables,
  type Comparable,
  type PlanLevers,
  type TargetSolution,
} from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Disclosure, DataTable, Formula, HowCalculated, Notice, Segmented, selectClass, type Column } from "./ft-ui";
import { sheetMatrix, formatCompactMoney, fte, hours, money, pct, rate } from "./ft-format";
import SheetExportButton from "../dashboard/sheet-export-button";
import LeversCard, { SliderRow } from "./calculator-levers";
import TargetCard from "./calculator-target";
import ScenariosCard, { type CalculatorInputs, type Scenario } from "./calculator-scenarios";
import WhyPanel, { type KpiId, type WhyTopic } from "./calculator-why";

const AGENCIES = [
  { id: "cossette", label: "Cossette Media" },
  { id: "jungle", label: "Jungle Media" },
  { id: "mek", label: "MEK US" },
] as const;
type AgencyId = (typeof AGENCIES)[number]["id"];

/** Plus palette plus darker shades of the same hues, so up to 12 roles stay distinct. */
const ROLE_COLORS = [
  PLUS.purple,
  PLUS.yellow,
  PLUS.green,
  PLUS.blue,
  PLUS.pink,
  PLUS.red,
  "#2f2659",
  "#b38600",
  "#2e7d31",
  "#2a9aa6",
  PLUS.lightPink,
  PLUS.lightBlue,
];

const PRESET_REVENUE = [250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
const MAX_COMPARABLES = 3;

type Unit = "hours" | "fte";

/** Variance pill vs the data-based plan, in percentage points or %. */
function vsData(now: number, data: number, kind: "pts" | "pct", higherIsBetter: boolean): StatVariance | null {
  const d = kind === "pts" ? (now - data) * 100 : data !== 0 ? (now - data) / Math.abs(data) : 0;
  if (Math.abs(d) < (kind === "pts" ? 0.05 : 0.0005)) return null;
  const label = kind === "pts" ? `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts` : `${d >= 0 ? "+" : "−"}${(Math.abs(d) * 100).toFixed(0)}%`;
  return { pillLabel: label, isFavorable: higherIsBetter ? d >= 0 : d <= 0 };
}

/** One numbered question in "Plan a new account". */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-gray-900 text-sm font-bold text-yellow-400">{n}</span>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** A KPI tile that opens its "Why this number?" explanation. */
function KpiButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative block w-full text-left outline-none ${active ? "ring-2 ring-yellow-400" : "hover:ring-2 hover:ring-gray-200"}`}
    >
      {children}
      <span
        className={`absolute right-3 top-3 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold ${
          active ? "bg-yellow-400 text-gray-900" : "bg-gray-100 text-gray-500 group-hover:bg-gray-900 group-hover:text-white"
        }`}
      >
        <HelpCircle size={10} /> Why?
      </span>
    </button>
  );
}

export default function TargetsCalculatorTab({ basis, initialAgency }: { basis: CostBasis; initialAgency: string }) {
  const [agency, setAgency] = useState<AgencyId>((AGENCIES.some((a) => a.id === initialAgency) ? initialAgency : "cossette") as AgencyId);
  const [revenue, setRevenue] = useState(1_000_000);
  const [revenueText, setRevenueText] = useState("1,000,000");
  const [auto, setAuto] = useState(true);
  const [manual, setManual] = useState<number[]>([]);
  const [unit, setUnit] = useState<Unit>("hours");
  const [adding, setAdding] = useState("");
  const [rawLevers, setLevers] = useState<PlanLevers>(DEFAULT_LEVERS);
  const [why, setWhy] = useState<WhyTopic | null>(null);

  const currency = MODEL.agencies.find((a) => a.id === agency)!.currency;
  const candidates = useMemo(() => comparableCandidates(agency, basis), [agency, basis]);
  const suggested = useMemo(() => suggestComparables(candidates, revenue, MAX_COMPARABLES), [candidates, revenue]);
  const chosen: Comparable[] = useMemo(
    () => (auto ? suggested : manual.map((id) => candidates.find((c) => c.client.index === id)).filter((c): c is Comparable => !!c)),
    [auto, suggested, manual, candidates],
  );
  const dataPlan = useMemo(() => staffingPlan(agency, revenue, chosen, basis), [agency, revenue, chosen, basis]);

  // Role-level settings only apply to roles in the current plan (comparables can change the role set).
  const levers = useMemo<PlanLevers>(() => {
    if (!dataPlan) return rawLevers;
    const keys = new Set(dataPlan.roles.map((r) => r.key));
    const keep = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([k]) => keys.has(k)));
    return { ...rawLevers, mix: keep(rawLevers.mix), rates: keep(rawLevers.rates) };
  }, [rawLevers, dataPlan]);
  const plan = useMemo(() => staffingPlan(agency, revenue, chosen, basis, levers), [agency, revenue, chosen, basis, levers]);
  const nChanged = changedLevers(levers);

  // A new agency means new comparables and a new role set.
  const changeAgency = (a: AgencyId) => {
    setAgency(a);
    setManual([]);
    setAuto(true);
    setLevers((l) => ({ ...l, mix: {}, rates: {} }));
  };

  const setRevenueValue = (v: number) => {
    const clamped = Math.max(10_000, Math.min(50_000_000, Math.round(v)));
    setRevenue(clamped);
    setRevenueText(clamped.toLocaleString("en-CA"));
  };

  const removeComparable = (id: number) => {
    const base = auto ? suggested.map((c) => c.client.index) : manual;
    setManual(base.filter((x) => x !== id));
    setAuto(false);
  };
  const addComparable = (id: number) => {
    const base = auto ? suggested.map((c) => c.client.index) : manual;
    if (base.includes(id) || base.length >= MAX_COMPARABLES) return;
    setManual([...base, id]);
    setAuto(false);
    setAdding("");
  };

  const applyTarget = (kind: "team" | "rate" | "revenue", s: TargetSolution) => {
    if (!plan) return;
    if (kind === "team") {
      setLevers(levers.fixedFte !== null ? { ...levers, fixedFte: s.maxFte } : { ...levers, hoursAdj: s.hoursAdj });
    } else if (kind === "rate") {
      const rates = Object.fromEntries(Object.entries(levers.rates).map(([k, v]) => [k, v * s.rateFactor]));
      setLevers({ ...levers, rateAdj: levers.rateAdj * s.rateFactor, rates });
    } else {
      setLevers({ ...levers, fixedFte: plan.runRateFte });
      setRevenueValue(s.revenueNeeded);
    }
  };

  const inputs: CalculatorInputs = {
    agency,
    revenue,
    comparables: auto ? null : chosen.map((c) => c.client.number),
    levers,
  };

  const loadScenario = (s: Scenario) => {
    const a = (AGENCIES.some((x) => x.id === s.agency) ? s.agency : "cossette") as AgencyId;
    setAgency(a);
    setRevenueValue(s.revenue);
    setLevers({ ...DEFAULT_LEVERS, ...s.levers });
    if (s.comparables) {
      const pool = comparableCandidates(a, basis);
      setManual(s.comparables.map((n) => pool.find((c) => c.client.number === n)?.client.index).filter((x): x is number => x !== undefined));
      setAuto(false);
    } else {
      setManual([]);
      setAuto(true);
    }
    setWhy(null);
  };

  const toggleWhy = (t: WhyTopic) =>
    setWhy((cur) =>
      cur && cur.kind === t.kind && (t.kind === "kpi" ? cur.kind === "kpi" && cur.id === t.id : cur.kind === "role" && cur.key === t.key) ? null : t,
    );
  const kpiActive = (id: KpiId) => why?.kind === "kpi" && why.id === id;

  const roleColors = useMemo(() => {
    const map = new Map<string, string>();
    plan?.roles.forEach((r, i) => map.set(r.key, r.key === "other" ? NEUTRAL_FILL : ROLE_COLORS[i % ROLE_COLORS.length]));
    return map;
  }, [plan]);

  const fteHours = levers.fteHours;
  const chart = useMemo(() => {
    if (!plan) return null;
    const config: ChartConfig = {};
    plan.roles.forEach((r) => (config[`r${r.key}`] = { label: r.label, color: roleColors.get(r.key)! }));
    const data = plan.monthlyHours.map((_, m) => {
      const row: Record<string, number | string> = { month: `M${m + 1}` };
      plan.roles.forEach((r) => (row[`r${r.key}`] = unit === "fte" ? r.monthlyHours[m] / fteHours : r.monthlyHours[m]));
      return row;
    });
    return { config, data };
  }, [plan, roleColors, unit, fteHours]);

  const fmtCell = (h: number) => (unit === "fte" ? fte(h / fteHours) : hours(h));
  const mark = (changed: boolean, text: string) => (changed ? <span className="bg-yellow-400 px-1 text-gray-900">{text}</span> : text);

  type PlanRow = NonNullable<typeof plan>["roles"][number];
  const planColumns: Column<PlanRow>[] = plan
    ? [
        {
          id: "role",
          label: "Role",
          render: (r) => (
            <div className="flex items-center gap-2" title={r.members?.join(", ")}>
              <span className="h-2.5 w-2.5 shrink-0" style={{ background: roleColors.get(r.key) }} />
              <span className="font-medium text-gray-900">{r.label}</span>
              {r.members && <span className="text-[11px] text-gray-400">({r.members.length})</span>}
            </div>
          ),
        },
        { id: "share", label: "Mix", align: "right", render: (r) => mark(Math.abs(r.share - r.dataShare) > 0.0005, pct(r.share, 0)), total: "100%" },
        {
          id: "rate",
          label: "Cost / h",
          align: "right",
          render: (r) => mark(Math.abs(r.rate - r.dataRate) > 0.005, rate(r.rate)),
          total: rate(plan.blendedRate),
        },
        ...plan.monthlyHours.map((_, m): Column<PlanRow> => ({
          id: `m${m}`,
          label: `M${m + 1}`,
          align: "right",
          className: "text-gray-600",
          render: (r) => fmtCell(r.monthlyHours[m]),
          total: fmtCell(plan.monthlyHours[m]),
        })),
        {
          id: "year",
          label: unit === "fte" ? "Avg FTE" : "Year 1 h",
          align: "right",
          render: (r) => (unit === "fte" ? fte(r.yearHours / 12 / fteHours) : hours(r.yearHours)),
          total: unit === "fte" ? fte(plan.yearHours / 12 / fteHours) : hours(plan.yearHours),
        },
        { id: "fte", label: "FTE fully staffed", align: "right", render: (r) => fte(r.runRateFte), total: fte(plan.runRateFte) },
        { id: "cost", label: "Year 1 cost", align: "right", render: (r) => money(r.yearCost), total: money(plan.yearCost) },
      ]
    : [];

  const compColumns: Column<Comparable>[] = [
    {
      id: "name",
      label: "Comparable account",
      render: (c) => (
        <div className="max-w-[280px]">
          <div className="truncate font-medium text-gray-900">{c.client.name}</div>
          <div className="text-[11px] text-gray-500">
            #{c.client.number} · active {c.activeMonths} of {REVENUE_WINDOW.months} months
          </div>
        </div>
      ),
    },
    { id: "rev", label: "Revenue (annualized)", align: "right", render: (c) => money(c.annualizedRevenue) },
    { id: "hpk", label: "Hours per $1K", align: "right", render: (c) => c.hoursPerThousand.toFixed(1) },
    { id: "fte", label: "Avg FTE", align: "right", render: (c) => fte(c.hours / REVENUE_WINDOW.months / DEFAULT_LEVERS.fteHours) },
    { id: "margin", label: "Actual margin", align: "right", render: (c) => pct(c.marginPct) },
  ];

  const buildSheet = () => {
    if (!plan) return [];
    const settings: (string | number | null)[][] = [
      ["Settings", nChanged === 0 ? "Data-based (no changes)" : `${nChanged} changed from the data`],
      ["Team size", levers.fixedFte === null ? "Scales with revenue" : `Fixed at ${fte(levers.fixedFte)} FTE`],
      ["Team intensity (× comparables' hours per $)", levers.hoursAdj],
      ["Seniority (× data cost rates)", levers.rateAdj],
      ["Client hours per FTE per month", levers.fteHours],
      ["Onboarding ramp", RAMP_SETTINGS.find((r) => r.id === levers.ramp)?.label ?? levers.ramp],
      ["Year-1 revenue timing", levers.revenueTiming === "even" ? "Even from month 1" : "Ramps with the team"],
    ];
    return sheetMatrix(
      [
        "Role",
        "Mix",
        "Data mix",
        `Cost per hour (${currency})`,
        `Data cost per hour (${currency})`,
        ...plan.monthlyHours.map((_, m) => `M${m + 1} hours`),
        "Year 1 hours",
        "Run-rate FTE",
        `Year 1 cost (${currency})`,
      ],
      [
        ...plan.roles.map((r) => [r.label, r.share, r.dataShare, r.rate, r.dataRate, ...r.monthlyHours, r.yearHours, r.runRateFte, r.yearCost]),
        ["Total", 1, 1, plan.blendedRate, null, ...plan.monthlyHours, plan.yearHours, plan.runRateFte, plan.yearCost],
        [],
        ["Expected annual gross revenue", revenue],
        ["Year-1 revenue", plan.yearRevenue],
        ["Year-1 margin %", plan.yearMarginPct],
        ["Run-rate margin %", plan.runRateMarginPct],
        ["Comparables", chosen.map((c) => c.client.name).join(" | ")],
        ["Cost basis", basis === "base1" ? "Base1" : "Enterprise"],
        ...settings,
      ],
    );
  };

  const available = candidates.filter((c) => !chosen.some((x) => x.client.index === c.client.index));
  const changedNote = (now: string, data: string) => (nChanged > 0 && now !== data ? ` · data-based ${data}` : "");

  return (
    <div className="space-y-5">
      {/* ── The three questions ── */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="plus-pattern h-1" aria-hidden />
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900">Plan a new account</h2>
          <p className="mt-1 text-sm text-gray-600">
            Answer three questions. We build the plan from how we staff similar clients today, using real hours and costs.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Step n={1} title="Which agency will run it?">
              <Segmented options={AGENCIES} value={agency} onChange={changeAgency} ariaLabel="Agency" />
            </Step>

            <Step n={2} title="How much will the client pay us a year?">
              <label className="flex items-center border-2 border-gray-900 bg-white focus-within:ring-2 focus-within:ring-yellow-400">
                <span className="pl-3 text-lg font-semibold text-gray-500">$</span>
                <input
                  inputMode="numeric"
                  value={revenueText}
                  onChange={(e) => {
                    setRevenueText(e.target.value);
                    const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                    if (n > 0) setRevenue(Math.min(50_000_000, n));
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => setRevenueValue(revenue)}
                  placeholder="Type an amount"
                  className="w-full min-w-0 bg-transparent px-2 py-2.5 text-xl font-bold tabular-nums text-gray-900 focus:outline-none"
                  aria-label="Expected annual gross revenue"
                />
                <span className="whitespace-nowrap pr-3 text-sm font-semibold text-gray-500">{currency} / year</span>
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Or pick:</span>
                {PRESET_REVENUE.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRevenueValue(v)}
                    className={`px-2.5 py-1 text-xs font-semibold ${revenue === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    {formatCompactMoney(v)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">Gross revenue: the fees and commissions we earn, not the client’s media budget.</p>
            </Step>

            <Step n={3} title="Which current clients is it most like?">
              <p className="mb-2 text-xs leading-snug text-gray-500">
                {auto
                  ? `We picked the ${chosen.length} closest in size. Swap any of them for a client that works more like the new one.`
                  : "Your picks (1 to 3). The new account is staffed the way these are staffed today."}
              </p>
              <ul className="divide-y divide-gray-100 border border-gray-200">
                {chosen.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">Add at least one client below.</li>}
                {chosen.map((c) => (
                  <li key={c.client.index} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900" title={c.client.name}>
                        {c.client.name}
                      </div>
                      <div className="text-xs tabular-nums text-gray-500">about {formatCompactMoney(c.annualizedRevenue)} a year</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeComparable(c.client.index)}
                      aria-label={`Remove ${c.client.name}`}
                      title="Remove"
                      className="p-1 text-gray-400 hover:text-gray-900"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {chosen.length < MAX_COMPARABLES && (
                  <select
                    value={adding}
                    onChange={(e) => e.target.value && addComparable(Number(e.target.value))}
                    className={`${selectClass} min-w-0 flex-1 text-sm`}
                    aria-label="Add a similar client"
                  >
                    <option value="">+ Add a client…</option>
                    {available.map((c) => (
                      <option key={c.client.index} value={c.client.index}>
                        {c.client.name} — {formatCompactMoney(c.annualizedRevenue)}/yr
                      </option>
                    ))}
                  </select>
                )}
                {chosen.length >= MAX_COMPARABLES && <span className="text-xs text-gray-500">Remove one to pick a different client.</span>}
                {!auto && (
                  <button type="button" onClick={() => setAuto(true)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
                    Use our suggestions
                  </button>
                )}
              </div>
            </Step>
          </div>
        </div>
      </Card>

      {/* ── The answer ── */}
      {!plan || !dataPlan ? (
        <Card className="items-center justify-center p-16 text-sm text-gray-500">Add at least one similar client in step 3 to build a plan.</Card>
      ) : (
        <>
          {nChanged > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-yellow-400 px-4 py-2.5 text-sm text-gray-900">
              <span>
                <strong>What-if plan:</strong> {nChanged} setting{nChanged > 1 ? "s" : ""} changed from the data. Changed values are highlighted.
              </span>
              <button type="button" onClick={() => setLevers({ ...DEFAULT_LEVERS })} className="font-semibold underline underline-offset-2">
                Back to the data-based plan
              </button>
            </div>
          )}

          <Card className="gap-0 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">The answer</div>
            <p className="mt-2 text-2xl font-bold leading-snug text-gray-900">
              You’ll need about <span className="bg-yellow-400 px-1">{fte(plan.runRateFte)} people</span> on the account. In year one they’ll cost{" "}
              {formatCompactMoney(plan.yearCost)}, leaving a{" "}
              <span className={plan.yearMarginPct < 0 ? "bg-red-500 px-1 text-white" : "bg-yellow-400 px-1"}>{pct(plan.yearMarginPct, 0)} margin</span>.
            </p>
            <p className="mt-2 text-base leading-relaxed text-gray-600">
              Once the team is fully in place the margin settles at <strong className="text-gray-900">{pct(plan.runRateMarginPct, 0)}</strong>; the
              similar clients earn {pct(plan.comparablesMarginPct, 0)} today.
              {plan.yearMarginPct > plan.runRateMarginPct + 0.005 && levers.revenueTiming === "even"
                ? " Year one looks better only because the team is still being built up while the full revenue is assumed from month one."
                : plan.rampFactors[0] < 0.95
                  ? " The team is built up over the first months, as it was on our recent new clients."
                  : ""}{" "}
              Margin here is after team cost only, before overhead.
            </p>
          </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <KpiButton active={kpiActive("team")} onClick={() => toggleWhy({ kind: "kpi", id: "team" })}>
                <StatCard
                  icon={Users}
                  label="Team needed"
                  value={`${fte(plan.runRateFte)} FTE`}
                  sub={`Full-time people once fully staffed · peak ${fte(plan.peakFte)}${changedNote(fte(plan.runRateFte), fte(dataPlan.runRateFte))}`}
                />
              </KpiButton>
              <KpiButton active={kpiActive("cost")} onClick={() => toggleWhy({ kind: "kpi", id: "cost" })}>
                <StatCard
                  icon={DollarSign}
                  label={`Year 1 staffing cost (${currency})`}
                  value={formatCompactMoney(plan.yearCost)}
                  sub={`${hours(plan.yearHours)} client hours${changedNote(formatCompactMoney(plan.yearCost), formatCompactMoney(dataPlan.yearCost))}`}
                  variance={nChanged > 0 ? vsData(plan.yearCost, dataPlan.yearCost, "pct", false) : null}
                />
              </KpiButton>
              <KpiButton active={kpiActive("yearMargin")} onClick={() => toggleWhy({ kind: "kpi", id: "yearMargin" })}>
                <StatCard
                  icon={Percent}
                  label="First-year margin"
                  value={pct(plan.yearMarginPct)}
                  sub={`${formatCompactMoney(plan.yearMargin)} on ${formatCompactMoney(plan.yearRevenue)} year-1 revenue`}
                  accent={plan.yearMarginPct < 0 ? "text-red-500" : "text-green-500"}
                  variance={nChanged > 0 ? vsData(plan.yearMarginPct, dataPlan.yearMarginPct, "pts", true) : null}
                />
              </KpiButton>
              <KpiButton active={kpiActive("runRate")} onClick={() => toggleWhy({ kind: "kpi", id: "runRate" })}>
                <StatCard
                  icon={CalendarRange}
                  label="Margin once fully staffed"
                  value={pct(plan.runRateMarginPct)}
                  sub={`The similar accounts earn ${pct(plan.comparablesMarginPct)} today`}
                  accent={plan.runRateMarginPct < 0 ? "text-red-500" : "text-green-500"}
                  variance={nChanged > 0 ? vsData(plan.runRateMarginPct, dataPlan.runRateMarginPct, "pts", true) : null}
                />
              </KpiButton>
            </div>

            {!why && (
              <p className="-mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <HelpCircle size={13} /> Click any figure above, or any role in the plan below, to see exactly how it is worked out.
              </p>
            )}
            {why && <WhyPanel plan={plan} topic={why} currency={currency} onClose={() => setWhy(null)} />}

            {(plan.fallbackRoles.length > 0 || currency === "USD") && (
              <Notice tone="warn">
                {plan.fallbackRoles.length > 0 && (
                  <p>
                    <strong>No cost on file in Maconomy for {plan.fallbackRoles.join(", ")}</strong> — priced at the agency average of{" "}
                    {rate(plan.agencyRate)}/h.
                  </p>
                )}
                {currency === "USD" && (
                  <p>
                    MEK US data is thin ({candidates.length} eligible accounts) and part of its hours carry no cost on file — treat this plan as
                    directional.
                  </p>
                )}
              </Notice>
            )}

            {/* ── What-if: the three controls most people want ── */}
            <Card className="gap-5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <SlidersHorizontal size={18} className="text-primary" /> Try a what-if
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500">Move a slider and every number above updates.</p>
                </div>
                {nChanged > 0 && (
                  <button type="button" onClick={() => setLevers({ ...DEFAULT_LEVERS })} className="text-sm font-semibold text-gray-500 hover:text-gray-900">
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <SliderRow
                  label="Team size"
                  value={levers.hoursAdj}
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  onChange={(v) => setLevers({ ...levers, fixedFte: null, hoursAdj: Math.round(v * 100) / 100 })}
                  left="Smaller team"
                  right="Bigger team"
                  display={levers.hoursAdj === 1 ? "Same as similar clients" : `${pct(levers.hoursAdj, 0)} of similar clients`}
                  changed={levers.hoursAdj !== 1}
                  onReset={() => setLevers({ ...levers, hoursAdj: 1 })}
                />
                <SliderRow
                  label="Seniority"
                  value={levers.rateAdj}
                  min={0.7}
                  max={1.3}
                  step={0.01}
                  onChange={(v) => setLevers({ ...levers, rateAdj: Math.round(v * 100) / 100 })}
                  left="More junior"
                  right="More senior"
                  display={levers.rateAdj === 1 ? "Same as similar clients" : `${pct(levers.rateAdj, 0)} of today’s cost per hour`}
                  changed={levers.rateAdj !== 1}
                  onReset={() => setLevers({ ...levers, rateAdj: 1 })}
                />
              </div>
              <div className="border-t border-gray-100 pt-5">
                <TargetCard plan={plan} onApply={applyTarget} bare />
              </div>
            </Card>

            {chart && (
              <ChartCard
                title="Recommended staffing — first 12 months"
                subtitle={`${unit === "fte" ? "FTE" : "Hours"} by role per month · onboarding ramp ${
                  levers.ramp !== "data"
                    ? `“${RAMP_SETTINGS.find((r) => r.id === levers.ramp)?.label}” (your setting)`
                    : plan.ramp.basis === "flat"
                      ? "none (flat)"
                      : `from ${plan.ramp.clients} new clients (${plan.ramp.basis})`
                }`}
                icon={Users}
                action={
                  <Segmented
                    size="sm"
                    value={unit}
                    onChange={setUnit}
                    options={[
                      { id: "hours", label: "Hours" },
                      { id: "fte", label: "FTE" },
                    ]}
                    ariaLabel="Unit"
                  />
                }
              >
                <ChartContainer config={chart.config} className="aspect-auto w-full" style={{ height: 300 }}>
                  <BarChart data={chart.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => (unit === "fte" ? Number(v).toFixed(1) : hours(Number(v)))}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip
                      cursor={{ fillOpacity: 0.4 }}
                      content={
                        <ChartTooltipContent
                          formatter={(v, name) => (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="text-muted-foreground">{chart.config[name as string]?.label}</span>
                              <span className="font-medium tabular-nums text-foreground">
                                {unit === "fte" ? `${fte(Number(v))} FTE` : `${hours(Number(v))} h`}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {plan.roles.map((r) => (
                      <Bar key={r.key} dataKey={`r${r.key}`} stackId="plan" fill={`var(--color-r${r.key})`} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ChartContainer>
              </ChartCard>
            )}

            <ChartCard
              title="Staffing plan by role"
              subtitle={`${unit === "fte" ? `FTE (1 FTE = ${fteHours} h/month)` : "Client hours"} · click a role to see how it is staffed and priced`}
              icon={Table2}
              action={
                <SheetExportButton
                  title={`Staffing plan · ${AGENCIES.find((a) => a.id === agency)!.label} · ${formatCompactMoney(revenue)} a year`}
                  sheetTitle="Staffing plan"
                  buildMatrix={buildSheet}
                />
              }
            >
              <DataTable
                columns={planColumns}
                rows={plan.roles}
                rowKey={(r) => r.key}
                footerLabel="Total"
                onRowClick={(r) => toggleWhy({ kind: "role", key: r.key })}
                activeKey={why?.kind === "role" ? why.key : null}
              />
            </ChartCard>

            <Disclosure title="All settings" subtitle="Fixed team size, onboarding ramp, role-by-role mix and cost per hour" icon={SlidersHorizontal}>
              <LeversCard plan={plan} levers={levers} onChange={setLevers} bare />
            </Disclosure>

            <Disclosure title="Save and compare scenarios" subtitle="Keep versions of the plan side by side" icon={Bookmark}>
              <ScenariosCard current={inputs} currentPlan={plan} basis={basis} maxComparables={MAX_COMPARABLES} onLoad={loadScenario} bare />
            </Disclosure>

            <Disclosure
              title="The similar accounts behind this plan"
              subtitle={`What they earned and used, ${REVENUE_WINDOW.label}`}
              icon={Briefcase}
            >
              <DataTable columns={compColumns} rows={chosen} rowKey={(c) => String(c.client.index)} />
            </Disclosure>

            <HowCalculated>
              <Formula
                name="Hours per revenue $"
                formula="Σ comparables’ client hours ÷ Σ comparables’ gross revenue"
                worked={`${hours(plan.compHours)} h ÷ ${money(plan.compRevenue)} = ${(plan.dataHoursPerDollar * 1000).toFixed(2)} h per $1K (${REVENUE_WINDOW.label})${
                  levers.fixedFte === null && levers.hoursAdj !== 1
                    ? ` × ${pct(levers.hoursAdj, 0)} team intensity = ${(plan.hoursPerDollar * 1000).toFixed(2)}`
                    : ""
                }`}
              />
              <Formula
                name="Run-rate hours / month"
                formula={levers.fixedFte === null ? "annual revenue × hours per $ ÷ 12" : "fixed team FTE × hours per FTE"}
                worked={
                  levers.fixedFte === null
                    ? `${money(revenue)} × ${(plan.hoursPerDollar * 1000).toFixed(2)} ÷ 1,000 ÷ 12 = ${hours(plan.steadyMonthlyHours)} h`
                    : `${fte(levers.fixedFte)} × ${fteHours} = ${hours(plan.steadyMonthlyHours)} h`
                }
              />
              <Formula
                name="Role mix"
                formula={`comparables’ client hours by role ÷ their total; roles under ${ROLE_MIN_SHARE * 100}% grouped as “Other roles”; any mix you enter is rescaled to 100%`}
              />
              <Formula
                name="Onboarding ramp"
                formula="month m hours ÷ average of months 7–12, median across new clients, smoothed so the ramp never steps back"
                worked={`Plan: ${plan.rampFactors
                  .slice(0, 6)
                  .map((f, i) => `M${i + 1} ${pct(f, 0)}`)
                  .join(
                    " · ",
                  )} · M7–12 100%${plan.ramp.observed.length ? ` (observed medians: ${plan.ramp.observed.map((f) => pct(f, 0)).join(" · ")})` : ""}`}
              />
              <Formula name="Plan hours" formula="run-rate hours × role mix × ramp factor (month m)" />
              <Formula
                name="Cost per hour (role)"
                formula={`Σ agency cost ÷ Σ hours with a cost on file, by role, ${plan.ratesWindow}; × seniority setting; or your override`}
                worked={`${basis === "base1" ? "Base1" : "Enterprise"} cost basis · blended ${rate(plan.blendedRate)} / h`}
              />
              <Formula
                name="Staffing cost"
                formula="Σ plan hours × role cost per hour"
                worked={`Year 1 ${money(plan.yearCost)} · run rate ${money(plan.runRateCost)} / year`}
              />
              <Formula
                name="Margin"
                formula="(revenue − staffing cost) ÷ revenue"
                worked={`Year 1: (${money(plan.yearRevenue)} − ${money(plan.yearCost)}) ÷ ${money(plan.yearRevenue)} = ${pct(plan.yearMarginPct)} · run rate = 1 − hours per $ × blended cost per hour = ${pct(plan.runRateMarginPct)}`}
              />
              <Formula
                name="FTE"
                formula="hours ÷ hours per FTE per month"
                worked={`Run rate ${hours(plan.steadyMonthlyHours)} ÷ ${fteHours} = ${fte(plan.runRateFte)} FTE`}
              />
              <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                <p>
                  <strong>Assumptions.</strong> 1 FTE = {DEFAULT_LEVERS.fteHours} client hours a month by default — the data agrees: a full
                  employee-month logs a median of {MODEL.source.fteMedianClientHours} client hours ({MODEL.source.fteMedianTotalHours} h including
                  time off and internal work). Year-1 revenue is even from month 1 by default, so the onboarding months (lighter staffing) lift year-1
                  margin above the run rate; choose “Ramps with the team” for the conservative view. Comparable revenue is annualized from{" "}
                  {REVENUE_WINDOW.label} (× 12 ÷ {REVENUE_WINDOW.months}).
                </p>
                <p>
                  <strong>The ramp.</strong> Measured on clients that started inside the data (first client hour at least one month after their
                  agency’s export begins, and early enough for 9+ months to be observed) and that settle at 40+ hours a month. Month 1 is usually a
                  partial month. The agency’s own new clients are used when there are at least 5; otherwise all agencies (the ratios are unitless).
                </p>
                <p>
                  <strong>Not included:</strong> overhead (time off, internal work), non-staff costs, and pass-through media. Staffing cost is direct
                  labour at Maconomy cost rates.
                </p>
              </div>
            </HowCalculated>
        </>
      )}
    </div>
  );
}
