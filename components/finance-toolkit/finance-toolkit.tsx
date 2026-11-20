// filepath: components/finance-toolkit/finance-toolkit.tsx
"use client";

/**
 * Finance Toolkit — the page body: one slim context bar (agency, how fresh the
 * data is, and a "How to read this page" guide that opens on demand), then
 * three sub-tabs. Opens on Account Profitability, the question leadership asks
 * first; each tab leads with its own answer, so the guide starts closed.
 */

import { useState } from "react";
import { BookOpen, Calculator, ChevronDown, Clock, PieChart, ShieldCheck } from "lucide-react";
import SubTabBar from "../forecaster/sub-tab-bar";
import { MODEL, REVENUE_WINDOW, SCOPES, monthLabel, type Scope } from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Field, InfoTip, Segmented } from "./ft-ui";
import HoursPortalTab from "./hours-portal-tab";
import ProfitabilityTab from "./profitability-tab";
import TargetsCalculatorTab from "./targets-calculator-tab";

type TabId = "hours" | "profitability" | "calculator";
const TABS: { id: TabId; label: string }[] = [
  { id: "profitability", label: "Account Profitability" },
  { id: "calculator", label: "New Business Targets Calculator" },
  { id: "hours", label: "Hours Report Portal" },
];

const GUIDE: { id: TabId; icon: typeof PieChart; title: string; question: string; how: string }[] = [
  {
    id: "profitability",
    icon: PieChart,
    title: "Account Profitability",
    question: "How much do we keep once we pay the people who serve each account?",
    how: "The answer is at the top. Below it: the monthly trend, how accounts spread by margin, the biggest contributors, and the few accounts worth a conversation, grouped by the likely reason. Click any account for its trend.",
  },
  {
    id: "calculator",
    icon: Calculator,
    title: "New Business Targets Calculator",
    question: "If we win an account worth $X a year, what team does it need and what margin will we make?",
    how: "Type the expected revenue. The plan is based on similar accounts we already run. Change any setting to test a what-if, or set a target margin.",
  },
  {
    id: "hours",
    icon: Clock,
    title: "Hours Report Portal",
    question: "Where does our people’s time go?",
    how: "Hours and their cost by client, role, month or type of work. Any view exports to Google Sheets.",
  },
];

const BASES: { id: CostBasis; label: string }[] = [
  { id: "base1", label: "Standard (Base1)" },
  { id: "enterprise", label: "Enterprise" },
];

const dataDate = new Date(MODEL.generatedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });

export default function FinanceToolkit() {
  const [tab, setTab] = useState<TabId>("profitability");
  const [scopeId, setScopeId] = useState(SCOPES[0].id);
  const [basis, setBasis] = useState<CostBasis>("base1");
  const [showGuide, setShowGuide] = useState(false);
  const scope: Scope = SCOPES.find((s) => s.id === scopeId)!;

  return (
    <div className="space-y-5 p-6">
      {/* Context bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {tab !== "calculator" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Agency</span>
            <InfoTip text="Canadian agencies report in CAD and MEK US in USD. The two currencies are never added together." align="left" />
            <Segmented
              ariaLabel="Agency"
              value={scopeId}
              onChange={setScopeId}
              options={SCOPES.map((s) => ({ id: s.id, label: `${s.id === "canada" ? "All Canada" : s.label}${s.id === "mek" ? " (USD)" : ""}` }))}
            />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
          <span
            className="inline-flex items-center gap-1.5"
            title={`Timesheets ${monthLabel(0)} – ${monthLabel(MODEL.months.length - 1)} (${MODEL.source.hoursRows.toLocaleString("en-CA")} entries) · gross revenue ${REVENUE_WINDOW.label} · loaded ${dataDate}`}
          >
            <ShieldCheck size={15} className="text-green-500" />
            Finance data through <strong className="text-gray-900">{monthLabel(REVENUE_WINDOW.to)}</strong>
          </span>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
            className="inline-flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <BookOpen size={14} /> How to read this page
            <ChevronDown size={14} className={`transition-transform ${showGuide ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {showGuide && (
        <div className="border border-gray-200 bg-white">
          <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            {GUIDE.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setTab(g.id);
                  setShowGuide(false);
                }}
                className="px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <g.icon size={15} className="text-primary" /> {g.title}
                </div>
                <p className="mt-1.5 text-sm font-medium leading-snug text-gray-800">{g.question}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">{g.how}</p>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 px-5 py-3 text-sm leading-relaxed text-gray-600">
            <strong className="text-gray-900">Can I trust these numbers?</strong> Hours and revenue come straight from Finance’s systems and add up to
            Finance’s own reports to the dollar. Every figure can be traced: open <em>How this is calculated</em> at the bottom of any tab, or click{" "}
            <em>Why?</em> on a calculator figure to see each step with the real numbers.
          </div>
        </div>
      )}

      <SubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === "hours" && <HoursPortalTab scope={scope} basis={basis} />}
      {tab === "profitability" && <ProfitabilityTab scope={scope} basis={basis} />}
      {tab === "calculator" && <TargetsCalculatorTab basis={basis} initialAgency={scope.agencyIds.length === 1 ? scope.agencyIds[0] : "cossette"} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <p className="max-w-3xl text-xs text-gray-500">
          Built from Finance’s Maconomy timesheets and gross revenue reports, loaded {dataDate}. Staffing cost is the cost of the hours people logged
          to each account; it does not include overhead, non-staff costs or pass-through media.
        </p>
        <Field
          label="Cost rates (for Finance)"
          hint="Maconomy, Finance’s timesheet and costing system, holds two cost rates per person. Standard (Base1) is the default. They are identical for Cossette and Jungle and differ only for MEK US."
        >
          <Segmented ariaLabel="Cost rates" value={basis} onChange={setBasis} options={BASES} size="sm" />
        </Field>
      </div>
    </div>
  );
}
