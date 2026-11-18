// filepath: components/finance-toolkit/calculator-why.tsx
"use client";

/**
 * Finance Toolkit · Targets Calculator — "Why this number?". For a headline
 * figure or a role, lists every step that produces it, with the real numbers
 * and where each input comes from: the data (Maconomy / gross revenue
 * reports), a setting the user changed, or a calculation. Everything is
 * computed from the plan, never written freehand, so it always ties out.
 */

import { HelpCircle, X } from "lucide-react";
import { Card } from "../ui/card";
import { FTE_HOURS_PER_MONTH, MODEL, RAMP_SETTINGS, REVENUE_WINDOW, ROLE_MIN_SHARE, type StaffingPlan } from "../../lib/finance-toolkit/model";
import { Chip } from "./ft-ui";
import { fte, hours, money, pct, rate } from "./ft-format";

export type KpiId = "team" | "cost" | "yearMargin" | "runRate";
export type WhyTopic = { kind: "kpi"; id: KpiId } | { kind: "role"; key: string };

type Source = "data" | "you" | "calc";
interface Step {
  label: string;
  value: string;
  detail?: string;
  source: Source;
}

const SOURCE_CHIP = {
  data: { tone: "dark", text: "Data" },
  you: { tone: "over", text: "Your setting" },
  calc: { tone: "neutral", text: "Calculated" },
} as const;

const perK = (hpd: number) => `${(hpd * 1000).toFixed(2)} h per $1K`;

function comparablesStep(plan: StaffingPlan): Step {
  return {
    label: "Hours a revenue dollar needs",
    value: perK(plan.dataHoursPerDollar),
    detail: `${hours(plan.compHours)} client hours ÷ ${money(plan.compRevenue)} gross revenue across ${plan.comparables
      .map((c) => c.client.name)
      .join(", ")} (${REVENUE_WINDOW.label}).`,
    source: "data",
  };
}

function fteStep(plan: StaffingPlan): Step {
  const changed = plan.levers.fteHours !== FTE_HOURS_PER_MONTH;
  return {
    label: "Client hours per FTE",
    value: `${plan.levers.fteHours} h / month`,
    detail: changed
      ? `You changed it from ${FTE_HOURS_PER_MONTH} (the data median is ${MODEL.source.fteMedianClientHours}).`
      : `The data agrees: a full employee-month logs a median of ${MODEL.source.fteMedianClientHours} client hours.`,
    source: changed ? "you" : "data",
  };
}

function intensitySteps(plan: StaffingPlan): Step[] {
  const L = plan.levers;
  if (L.fixedFte !== null) {
    return [
      { label: "Team size", value: `${fte(L.fixedFte)} FTE`, detail: "Held at a size you set; it no longer scales with revenue.", source: "you" },
      { label: "Run-rate hours per month", value: `${hours(plan.steadyMonthlyHours)} h`, detail: `${fte(L.fixedFte)} FTE × ${L.fteHours} h`, source: "calc" },
      {
        label: "Implied hours per revenue $",
        value: perK(plan.hoursPerDollar),
        detail: `The comparables need ${perK(plan.dataHoursPerDollar)}.`,
        source: "calc",
      },
    ];
  }
  const steps: Step[] = [comparablesStep(plan)];
  if (L.hoursAdj !== 1) {
    steps.push({
      label: "Your team-intensity setting",
      value: `${pct(L.hoursAdj, 0)} of the comparables`,
      detail: `${perK(plan.dataHoursPerDollar)} → ${perK(plan.hoursPerDollar)}`,
      source: "you",
    });
  }
  steps.push({
    label: "Run-rate hours per month",
    value: `${hours(plan.steadyMonthlyHours)} h`,
    detail: `${money(plan.annualRevenue)} × ${perK(plan.hoursPerDollar)} ÷ 12 months`,
    source: "calc",
  });
  return steps;
}

function rampStep(plan: StaffingPlan): Step {
  const changed = plan.levers.ramp !== "data";
  const curve = plan.rampFactors
    .slice(0, 6)
    .map((f, i) => `M${i + 1} ${pct(f, 0)}`)
    .join(" · ");
  return {
    label: "Onboarding ramp",
    value: `${curve} · then 100%`,
    detail: changed
      ? `You chose “${RAMP_SETTINGS.find((r) => r.id === plan.levers.ramp)?.label}”.`
      : plan.ramp.basis === "flat"
        ? "Too few new clients to measure a ramp, so the plan is flat."
        : `Median staffing of ${plan.ramp.clients} real new clients (${plan.ramp.basis}) in each of their first months, against their months 7–12.`,
    source: changed ? "you" : "data",
  };
}

function ratesStep(plan: StaffingPlan): Step {
  const adjusted = plan.levers.rateAdj !== 1 || plan.roles.some((r) => r.rateSource === "override");
  const top = [...plan.roles].sort((a, b) => b.share - a.share).slice(0, 4);
  return {
    label: "Average cost of a plan hour",
    value: `${rate(plan.blendedRate)} / h`,
    detail: `Σ role mix × role cost per hour. Largest roles: ${top.map((r) => `${r.label} ${pct(r.share, 0)} at ${rate(r.rate)}`).join("; ")}.${
      plan.levers.rateAdj !== 1 ? ` Includes your seniority setting (${pct(plan.levers.rateAdj, 0)} of data rates).` : ""
    }`,
    source: adjusted ? "you" : "data",
  };
}

function kpiSteps(plan: StaffingPlan, id: KpiId): { title: string; steps: Step[]; note?: string } {
  const L = plan.levers;
  switch (id) {
    case "team":
      return {
        title: `Why ${fte(plan.runRateFte)} FTE?`,
        steps: [
          ...intensitySteps(plan),
          fteStep(plan),
          { label: "Team at run rate", value: `${fte(plan.runRateFte)} FTE`, detail: `${hours(plan.steadyMonthlyHours)} h ÷ ${L.fteHours} h`, source: "calc" },
        ],
        note: `Peak in year 1 is ${fte(plan.peakFte)} FTE; the first months are lighter because of the onboarding ramp.`,
      };
    case "cost":
      return {
        title: `Why ${money(plan.yearCost)} of year-1 staffing cost?`,
        steps: [
          ...intensitySteps(plan),
          rampStep(plan),
          { label: "Year-1 client hours", value: `${hours(plan.yearHours)} h`, detail: "Σ over 12 months of run-rate hours × that month’s ramp factor", source: "calc" },
          ratesStep(plan),
          { label: "Year-1 staffing cost", value: money(plan.yearCost), detail: `${hours(plan.yearHours)} h × ${rate(plan.blendedRate)} / h`, source: "calc" },
        ],
        note: "Direct labour at Maconomy cost rates only: no overhead (time off, internal work), non-staff costs or pass-through media.",
      };
    case "yearMargin":
      return {
        title: `Why ${pct(plan.yearMarginPct)} year-1 margin?`,
        steps: [
          {
            label: "Year-1 gross revenue",
            value: money(plan.yearRevenue),
            detail:
              L.revenueTiming === "ramp"
                ? `${money(plan.annualRevenue)} a year once running, following the onboarding ramp in year 1 (Σ annual ÷ 12 × ramp factor).`
                : `${money(plan.annualRevenue)} expected annual revenue, assumed to arrive evenly from month 1.`,
            source: "you",
          },
          { label: "Year-1 staffing cost", value: money(plan.yearCost), detail: `${hours(plan.yearHours)} h × ${rate(plan.blendedRate)} / h (see staffing cost)`, source: "calc" },
          {
            label: "Year-1 margin",
            value: `${money(plan.yearMargin)} · ${pct(plan.yearMarginPct)}`,
            detail: `(${money(plan.yearRevenue)} − ${money(plan.yearCost)}) ÷ ${money(plan.yearRevenue)}`,
            source: "calc",
          },
        ],
        note:
          L.revenueTiming === "even" && plan.yearMarginPct > plan.runRateMarginPct + 0.005
            ? "Year 1 beats run rate only because the team is lighter during onboarding while revenue is assumed to arrive evenly. Set revenue timing to “Ramps with the team” for a more conservative view."
            : undefined,
      };
    case "runRate": {
      const costShare = plan.hoursPerDollar * plan.blendedRate;
      return {
        title: `Why ${pct(plan.runRateMarginPct)} run-rate margin?`,
        steps: [
          ...(L.fixedFte !== null
            ? intensitySteps(plan)
            : [
                comparablesStep(plan),
                ...(L.hoursAdj !== 1
                  ? [{ label: "Your team-intensity setting", value: perK(plan.hoursPerDollar), detail: `${pct(L.hoursAdj, 0)} of the comparables`, source: "you" as Source }]
                  : []),
              ]),
          ratesStep(plan),
          {
            label: "Staffing cost per revenue $",
            value: `${pct(costShare)} of revenue`,
            detail: `${perK(plan.hoursPerDollar)} × ${rate(plan.blendedRate)} / h`,
            source: "calc",
          },
          { label: "Run-rate margin", value: pct(plan.runRateMarginPct), detail: `100% − ${pct(costShare)}`, source: "calc" },
          {
            label: "Cross-check: the comparables’ actual margin",
            value: pct(plan.comparablesMarginPct),
            detail:
              "Their own revenue minus the cost of the people who actually staffed them, same period. A gap means the plan’s agency-average rates differ from those teams’ real seniority.",
            source: "data",
          },
        ],
        note:
          L.fixedFte === null
            ? "Revenue size alone doesn’t move this margin: a bigger account needs proportionally more hours. To move it, change the team intensity, the role mix or the cost rates — or hold the team at a fixed size."
            : undefined,
      };
    }
  }
}

function roleSteps(plan: StaffingPlan, key: string): { title: string; steps: Step[]; note?: string } | null {
  const r = plan.roles.find((x) => x.key === key);
  if (!r) return null;
  const L = plan.levers;
  const mixChanged = L.mix[key] !== undefined || Math.abs(r.share - r.dataShare) > 0.0005;
  const rateDetail =
    r.rateSource === "override"
      ? `You set it (data: ${rate(r.dataRate)}).`
      : `${
          r.rateSource === "role"
            ? `Agency cost for this role ÷ ${hours(r.rateHours)} hours with a cost on file, ${plan.ratesWindow}: ${rate(r.dataRate)}.`
            : `No cost on file for this role in Maconomy, so the agency average: ${rate(plan.agencyRate)}.`
        }${L.rateAdj !== 1 ? ` × ${pct(L.rateAdj, 0)} seniority setting.` : ""}`;
  return {
    title: `${r.label}: how the plan staffs it`,
    steps: [
      {
        label: "Share of the team’s hours",
        value: pct(r.share),
        detail: mixChanged
          ? `The comparables used ${pct(r.dataShare)}; you changed the mix, and the other roles rescale so it totals 100%.`
          : `${pct(r.dataShare)} of the comparables’ client hours went to this role.`,
        source: mixChanged ? "you" : "data",
      },
      { label: "Cost per hour", value: rate(r.rate), detail: rateDetail, source: r.rateSource === "override" || L.rateAdj !== 1 ? "you" : "data" },
      {
        label: "Run-rate hours",
        value: `${hours(r.runRateHours)} h / month · ${fte(r.runRateFte)} FTE`,
        detail: `${hours(plan.steadyMonthlyHours)} team hours × ${pct(r.share)} ÷ ${L.fteHours} h per FTE`,
        source: "calc",
      },
      {
        label: "Year 1",
        value: `${hours(r.yearHours)} h · ${money(r.yearCost)}`,
        detail: `With the onboarding ramp; ${hours(r.yearHours)} h × ${rate(r.rate)}`,
        source: "calc",
      },
    ],
    note: r.members ? `Groups roles under ${pct(ROLE_MIN_SHARE, 0)} of the comparables’ hours: ${r.members.join(", ")}.` : undefined,
  };
}

export default function WhyPanel({ plan, topic, currency, onClose }: { plan: StaffingPlan; topic: WhyTopic; currency: string; onClose: () => void }) {
  const content = topic.kind === "kpi" ? kpiSteps(plan, topic.id) : roleSteps(plan, topic.key);
  if (!content) return null;
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 bg-gray-900 px-5 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HelpCircle size={16} className="text-yellow-400" />
          {content.title}
          <span className="text-xs font-normal text-gray-400">· amounts in {currency}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close explanation" className="p-1 text-gray-300 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <ol className="divide-y divide-gray-100">
        {content.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-x-3 px-5 py-3 md:grid-cols-[28px_1fr_auto]">
            <span className="flex h-6 w-6 items-center justify-center bg-gray-100 text-[11px] font-bold text-gray-600">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{s.label}</span>
                <Chip tone={SOURCE_CHIP[s.source].tone}>{SOURCE_CHIP[s.source].text}</Chip>
              </div>
              {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{s.detail}</p>}
            </div>
            <div className="col-start-2 mt-1 text-sm font-bold tabular-nums text-gray-900 md:col-start-3 md:mt-0 md:text-right">{s.value}</div>
          </li>
        ))}
      </ol>
      {content.note && <p className="border-t border-gray-200 bg-white px-5 py-3 text-xs leading-relaxed text-gray-600">{content.note}</p>}
    </Card>
  );
}
