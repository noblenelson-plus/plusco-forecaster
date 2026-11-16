// filepath: components/finance-toolkit/targets-calculator-tab.tsx
"use client";

/**
 * Finance Toolkit · Tab 3 — New Business Targets Calculator. For a prospective
 * client's expected annual gross revenue, recommends a 12-month staffing plan
 * (hours and FTEs by role, month by month) scaled from 1–3 comparable existing
 * accounts: their hours per revenue dollar, their role mix, the agency's cost
 * per hour by role, and the onboarding ramp observed on new clients.
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Briefcase, CalendarRange, Calculator, DollarSign, Percent, Plus, Sparkles, Table2, Users, X } from "lucide-react";
import StatCard from "../dashboard/charts/stat-card";
import ChartCard from "../dashboard/charts/chart-card";
import { CATEGORICAL_COLORS, NEUTRAL_FILL } from "../dashboard/charts/colors";
import { Card } from "../ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart";
import {
  FTE_HOURS_PER_MONTH,
  MODEL,
  REVENUE_WINDOW,
  ROLE_MIN_SHARE,
  comparableCandidates,
  staffingPlan,
  suggestComparables,
  type Comparable,
} from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Chip, DataTable, Field, Formula, GhostButton, HowCalculated, Notice, Segmented, selectClass, type Column } from "./ft-ui";
import { downloadCsv, formatCompactMoney, fte, hours, money, pct, rate } from "./ft-format";

const AGENCIES = [
  { id: "cossette", label: "Cossette Media" },
  { id: "jungle", label: "Jungle Media" },
  { id: "mek", label: "MEK US" },
] as const;
type AgencyId = (typeof AGENCIES)[number]["id"];

const PRESET_REVENUE = [250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
const SLIDER_MIN = Math.log10(50_000);
const SLIDER_MAX = Math.log10(10_000_000);
const MAX_COMPARABLES = 3;

type Unit = "hours" | "fte";

export default function TargetsCalculatorTab({ basis, initialAgency }: { basis: CostBasis; initialAgency: string }) {
  const [agency, setAgency] = useState<AgencyId>(
    (AGENCIES.some((a) => a.id === initialAgency) ? initialAgency : "cossette") as AgencyId
  );
  const [revenue, setRevenue] = useState(1_000_000);
  const [revenueText, setRevenueText] = useState("1,000,000");
  const [auto, setAuto] = useState(true);
  const [manual, setManual] = useState<number[]>([]);
  const [unit, setUnit] = useState<Unit>("hours");
  const [adding, setAdding] = useState("");

  const currency = MODEL.agencies.find((a) => a.id === agency)!.currency;
  const candidates = useMemo(() => comparableCandidates(agency, basis), [agency, basis]);
  const suggested = useMemo(() => suggestComparables(candidates, revenue, MAX_COMPARABLES), [candidates, revenue]);
  const chosen: Comparable[] = useMemo(
    () => (auto ? suggested : manual.map((id) => candidates.find((c) => c.client.index === id)).filter((c): c is Comparable => !!c)),
    [auto, suggested, manual, candidates]
  );
  const plan = useMemo(() => staffingPlan(agency, revenue, chosen, basis), [agency, revenue, chosen, basis]);

  // A new agency means new comparables.
  const changeAgency = (a: AgencyId) => {
    setAgency(a);
    setManual([]);
    setAuto(true);
  };

  const setRevenueValue = (v: number) => {
    const clamped = Math.max(10_000, Math.min(50_000_000, Math.round(v)));
    setRevenue(clamped);
    setRevenueText(clamped.toLocaleString("en-CA"));
  };

  const editComparables = () => {
    if (auto) setManual(suggested.map((c) => c.client.index));
    setAuto(false);
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

  const roleColors = useMemo(() => {
    const map = new Map<string, string>();
    plan?.roles.forEach((r, i) => map.set(r.key, r.key === "other" ? NEUTRAL_FILL : CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]));
    return map;
  }, [plan]);

  const chart = useMemo(() => {
    if (!plan) return null;
    const config: ChartConfig = {};
    plan.roles.forEach((r) => (config[`r${r.key}`] = { label: r.label, color: roleColors.get(r.key)! }));
    const data = plan.monthlyHours.map((_, m) => {
      const row: Record<string, number | string> = { month: `M${m + 1}` };
      plan.roles.forEach((r) => (row[`r${r.key}`] = unit === "fte" ? r.monthlyHours[m] / FTE_HOURS_PER_MONTH : r.monthlyHours[m]));
      return row;
    });
    return { config, data };
  }, [plan, roleColors, unit]);

  const fmtCell = (h: number) => (unit === "fte" ? fte(h / FTE_HOURS_PER_MONTH) : hours(h));

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
        { id: "share", label: "Mix", align: "right", render: (r) => pct(r.share, 0), total: "100%" },
        { id: "rate", label: "Cost / h", align: "right", render: (r) => rate(r.rate), total: rate(plan.yearHours ? plan.yearCost / plan.yearHours : null) },
        ...plan.monthlyHours.map(
          (_, m): Column<PlanRow> => ({
            id: `m${m}`,
            label: `M${m + 1}`,
            align: "right",
            className: "text-gray-600",
            render: (r) => fmtCell(r.monthlyHours[m]),
            total: fmtCell(plan.monthlyHours[m]),
          })
        ),
        { id: "year", label: unit === "fte" ? "Avg FTE" : "Year 1 h", align: "right", render: (r) => (unit === "fte" ? fte(r.yearHours / 12 / FTE_HOURS_PER_MONTH) : hours(r.yearHours)), total: unit === "fte" ? fte(plan.yearHours / 12 / FTE_HOURS_PER_MONTH) : hours(plan.yearHours) },
        { id: "fte", label: "Run-rate FTE", align: "right", render: (r) => fte(r.runRateFte), total: fte(plan.runRateFte) },
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
          <div className="text-[11px] text-gray-500">#{c.client.number} · active {c.activeMonths} of {REVENUE_WINDOW.months} months</div>
        </div>
      ),
    },
    { id: "rev", label: "Revenue (annualized)", align: "right", render: (c) => money(c.annualizedRevenue) },
    { id: "hpk", label: "Hours per $1K", align: "right", render: (c) => c.hoursPerThousand.toFixed(1) },
    { id: "fte", label: "Avg FTE", align: "right", render: (c) => fte(c.hours / REVENUE_WINDOW.months / FTE_HOURS_PER_MONTH) },
    { id: "margin", label: "Actual margin", align: "right", render: (c) => pct(c.marginPct) },
  ];

  const exportCsv = () => {
    if (!plan) return;
    downloadCsv(
      `finance-toolkit-staffing-plan-${agency}-${Math.round(revenue / 1000)}k.csv`,
      ["Role", "Mix", `Cost per hour (${currency})`, ...plan.monthlyHours.map((_, m) => `M${m + 1} hours`), "Year 1 hours", "Run-rate FTE", `Year 1 cost (${currency})`],
      [
        ...plan.roles.map((r) => [r.label, r.share, r.rate, ...r.monthlyHours, r.yearHours, r.runRateFte, r.yearCost]),
        ["Total", 1, plan.yearHours ? plan.yearCost / plan.yearHours : null, ...plan.monthlyHours, plan.yearHours, plan.runRateFte, plan.yearCost],
        [],
        ["Expected annual gross revenue", revenue],
        ["Comparables", chosen.map((c) => c.client.name).join(" | ")],
        ["Cost basis", basis === "base1" ? "Base1" : "Enterprise"],
        [`1 FTE = ${FTE_HOURS_PER_MONTH} client hours / month`],
      ]
    );
  };

  const available = candidates.filter((c) => !chosen.some((x) => x.client.index === c.client.index));
  const sliderValue = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.log10(revenue)));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
      {/* ── Inputs ── */}
      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Calculator size={16} className="text-primary" /> Prospective client
          </div>
          <Field label="Agency">
            <Segmented options={AGENCIES} value={agency} onChange={changeAgency} size="sm" ariaLabel="Agency" />
          </Field>
          <Field label={`Expected annual gross revenue (${currency})`}>
            <div className="flex items-center border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-yellow-400">
              <span className="pl-3 text-sm text-gray-400">$</span>
              <input
                inputMode="numeric"
                value={revenueText}
                onChange={(e) => {
                  setRevenueText(e.target.value);
                  const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (n > 0) setRevenue(Math.min(50_000_000, n));
                }}
                onBlur={() => setRevenueValue(revenue)}
                className="w-full bg-transparent px-2 py-2 text-lg font-bold tabular-nums text-gray-900 focus:outline-none"
                aria-label="Expected annual gross revenue"
              />
            </div>
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={0.01}
              value={sliderValue}
              onChange={(e) => {
                const v = Math.pow(10, Number(e.target.value));
                const step = v >= 1_000_000 ? 50_000 : v >= 200_000 ? 10_000 : 5_000;
                setRevenueValue(Math.round(v / step) * step);
              }}
              className="mt-2 w-full accent-gray-900"
              aria-label="Revenue slider"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {PRESET_REVENUE.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRevenueValue(v)}
                  className={`px-2 py-0.5 text-[11px] font-semibold ${revenue === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {formatCompactMoney(v)}
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Briefcase size={16} className="text-primary" /> Comparable accounts
            </div>
            {auto ? (
              <Chip tone="dark">
                <Sparkles size={10} className="mr-1" /> Auto
              </Chip>
            ) : (
              <button type="button" onClick={() => setAuto(true)} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900">
                Reset to auto
              </button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-gray-500">
            {auto
              ? `The ${MAX_COMPARABLES} ${AGENCIES.find((a) => a.id === agency)!.label} accounts closest in annualized revenue.`
              : "Your selection. Pick 1 to 3 accounts that look like the prospect."}
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-200">
            {chosen.length === 0 && <li className="px-3 py-3 text-xs text-gray-500">No comparable selected.</li>}
            {chosen.map((c) => (
              <li key={c.client.index} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-gray-900" title={c.client.name}>
                    {c.client.name}
                  </div>
                  <div className="text-[11px] tabular-nums text-gray-500">
                    {formatCompactMoney(c.annualizedRevenue)}/yr · {c.hoursPerThousand.toFixed(1)} h per $1K
                  </div>
                </div>
                <button type="button" onClick={() => removeComparable(c.client.index)} aria-label={`Remove ${c.client.name}`} className="p-1 text-gray-400 hover:text-gray-900">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          {chosen.length < MAX_COMPARABLES && (
            <div className="flex items-center gap-2">
              <select
                value={adding}
                onChange={(e) => e.target.value && addComparable(Number(e.target.value))}
                className={`${selectClass} w-full text-xs`}
                aria-label="Add a comparable account"
              >
                <option value="">Add an account…</option>
                {available.map((c) => (
                  <option key={c.client.index} value={c.client.index}>
                    {c.client.name} — {formatCompactMoney(c.annualizedRevenue)}/yr
                  </option>
                ))}
              </select>
              <Plus size={14} className="shrink-0 text-gray-400" />
            </div>
          )}
          {auto && (
            <button type="button" onClick={editComparables} className="self-start text-[11px] font-semibold text-gray-500 hover:text-gray-900">
              Edit selection
            </button>
          )}
          <p className="text-[11px] text-gray-400">
            {candidates.length} eligible accounts: revenue and client hours in {REVENUE_WINDOW.label}, active ≥ 4 months.
          </p>
        </Card>
      </div>

      {/* ── Output ── */}
      <div className="min-w-0 space-y-5">
        {!plan ? (
          <Card className="items-center justify-center p-16 text-sm text-gray-500">Pick at least one comparable account to build a plan.</Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <StatCard icon={Users} label="Recommended team" value={`${fte(plan.runRateFte)} FTE`} sub={`At run rate · peak ${fte(plan.peakFte)} FTE · ${hours(plan.steadyMonthlyHours)} h/month`} />
              <StatCard icon={DollarSign} label={`Year 1 staffing cost (${currency})`} value={formatCompactMoney(plan.yearCost)} sub={`${hours(plan.yearHours)} client hours incl. onboarding ramp`} />
              <StatCard
                icon={Percent}
                label="Projected year 1 margin"
                value={pct(plan.yearMarginPct)}
                sub={`${formatCompactMoney(plan.yearMargin)} on ${formatCompactMoney(revenue)} revenue`}
                accent={plan.yearMarginPct < 0 ? "text-red-500" : "text-green-500"}
              />
              <StatCard
                icon={CalendarRange}
                label="Run-rate margin"
                value={pct(plan.runRateMarginPct)}
                sub={`Once fully staffed · comparables earn ${pct(plan.comparablesMarginPct)}`}
                accent={plan.runRateMarginPct < 0 ? "text-red-500" : "text-green-500"}
              />
            </div>

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
                    MEK US data is thin ({candidates.length} eligible accounts) and part of its hours carry no cost on file — treat this plan as directional.
                  </p>
                )}
              </Notice>
            )}

            {chart && (
              <ChartCard
                title="Recommended staffing — first 12 months"
                subtitle={`${unit === "fte" ? "FTE" : "Hours"} by role per month · onboarding ramp from ${plan.ramp.basis === "flat" ? "none (flat)" : `${plan.ramp.clients} new clients (${plan.ramp.basis})`}`}
                icon={Users}
                action={<Segmented size="sm" value={unit} onChange={setUnit} options={[{ id: "hours", label: "Hours" }, { id: "fte", label: "FTE" }]} ariaLabel="Unit" />}
              >
                <ChartContainer config={chart.config} className="aspect-auto w-full" style={{ height: 300 }}>
                  <BarChart data={chart.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => (unit === "fte" ? Number(v).toFixed(1) : hours(Number(v)))} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11 }} />
                    <ChartTooltip
                      cursor={{ fillOpacity: 0.4 }}
                      content={
                        <ChartTooltipContent
                          formatter={(v, name) => (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="text-muted-foreground">{chart.config[name as string]?.label}</span>
                              <span className="font-medium tabular-nums text-foreground">{unit === "fte" ? `${fte(Number(v))} FTE` : `${hours(Number(v))} h`}</span>
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
              subtitle={`${unit === "fte" ? `FTE (1 FTE = ${FTE_HOURS_PER_MONTH} h/month)` : "Client hours"} · cost per hour = agency average by role, ${plan.ratesWindow}`}
              icon={Table2}
              action={<GhostButton onClick={exportCsv}>Download CSV</GhostButton>}
            >
              <DataTable columns={planColumns} rows={plan.roles} rowKey={(r) => r.key} footerLabel="Total" />
            </ChartCard>

            <ChartCard title="Comparables used" subtitle={`Actuals, ${REVENUE_WINDOW.label}`} icon={Briefcase}>
              <DataTable columns={compColumns} rows={chosen} rowKey={(c) => String(c.client.index)} />
            </ChartCard>

            <HowCalculated>
              <Formula
                name="Hours per revenue $"
                formula="Σ comparables’ client hours ÷ Σ comparables’ gross revenue"
                worked={`${hours(chosen.reduce((a, c) => a + c.hours, 0))} h ÷ ${money(chosen.reduce((a, c) => a + c.revenue, 0))} = ${(plan.hoursPerDollar * 1000).toFixed(2)} h per $1K (${REVENUE_WINDOW.label})`}
              />
              <Formula
                name="Run-rate hours / month"
                formula="annual revenue × hours per $ ÷ 12"
                worked={`${money(revenue)} × ${(plan.hoursPerDollar * 1000).toFixed(2)} ÷ 1,000 ÷ 12 = ${hours(plan.steadyMonthlyHours)} h`}
              />
              <Formula name="Role mix" formula={`comparables’ client hours by role ÷ their total; roles under ${ROLE_MIN_SHARE * 100}% grouped as “Other roles”`} />
              <Formula
                name="Onboarding ramp"
                formula="month m hours ÷ average of months 7–12, median across new clients"
                worked={`${plan.ramp.factors.slice(0, 6).map((f, i) => `M${i + 1} ${pct(f, 0)}`).join(" · ")} · M7–12 100%`}
              />
              <Formula name="Plan hours" formula="run-rate hours × role mix × ramp factor (month m)" />
              <Formula name="Cost per hour (role)" formula={`Σ agency cost ÷ Σ hours with a cost on file, by role, ${plan.ratesWindow}`} worked={`${basis === "base1" ? "Base1" : "Enterprise"} cost basis`} />
              <Formula name="Staffing cost" formula="Σ plan hours × role cost per hour" worked={`Year 1 ${money(plan.yearCost)} · run rate ${money(plan.runRateCost)} / year`} />
              <Formula name="Margin" formula="(annual revenue − staffing cost) ÷ annual revenue" worked={`Year 1: (${money(revenue)} − ${money(plan.yearCost)}) ÷ ${money(revenue)} = ${pct(plan.yearMarginPct)}`} />
              <Formula name="FTE" formula={`hours ÷ ${FTE_HOURS_PER_MONTH} per month`} worked={`Run rate ${hours(plan.steadyMonthlyHours)} ÷ ${FTE_HOURS_PER_MONTH} = ${fte(plan.runRateFte)} FTE`} />
              <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                <p>
                  <strong>Assumptions.</strong> 1 FTE = {FTE_HOURS_PER_MONTH} client hours a month — the data agrees: a full employee-month logs a median of{" "}
                  {MODEL.source.fteMedianClientHours} client hours ({MODEL.source.fteMedianTotalHours} h including time off and internal work). Revenue is assumed
                  to arrive evenly over the year, so the onboarding months (lighter staffing) lift year-1 margin above the run rate. Comparable revenue is
                  annualized from {REVENUE_WINDOW.label} (× 12 ÷ {REVENUE_WINDOW.months}).
                </p>
                <p>
                  <strong>The ramp.</strong> Measured on clients whose first client hour falls between Mar 2025 and Dec 2025 (so at least 9 months are observed)
                  and that settle at 40+ hours a month. Month 1 is usually a partial month. The agency’s own new clients are used when there are at least 5;
                  otherwise all agencies (the ratios are unitless).
                </p>
                <p>
                  <strong>Not included:</strong> overhead (time off, internal work), non-staff costs, and pass-through media. Staffing cost is direct labour at
                  Maconomy cost rates.
                </p>
              </div>
            </HowCalculated>
          </>
        )}
      </div>
    </div>
  );
}
