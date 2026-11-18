// filepath: components/finance-toolkit/finance-toolkit.tsx
"use client";

/**
 * Finance Toolkit — the page body: a context bar (agency + cost rates, shared
 * by every tab, plus where the numbers come from), a short "how to use this
 * page" guide for first-time readers, and three sub-tabs. Opens on Account
 * Profitability, the question leadership asks first.
 */

import { useState } from "react";
import { BookOpen, Calculator, Clock, PieChart, ShieldCheck, X } from "lucide-react";
import SubTabBar from "../forecaster/sub-tab-bar";
import { MODEL, REVENUE_WINDOW, SCOPES, type Scope } from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Field, Segmented } from "./ft-ui";
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
    question: "Which accounts make money once we pay the people who serve them?",
    how: "Revenue minus staffing cost for every account. Accounts that cost more than they earn are listed first. Click one to see its month-by-month trend.",
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
    how: "Hours and their cost by client, role, month or type of work, with a download for any view.",
  },
];

const BASES: { id: CostBasis; label: string }[] = [
  { id: "base1", label: "Standard (Base1)" },
  { id: "enterprise", label: "Enterprise" },
];

const GUIDE_KEY = "ft-guide-dismissed-v1";

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
};
const dataDate = new Date(MODEL.generatedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });

export default function FinanceToolkit() {
  const [tab, setTab] = useState<TabId>("profitability");
  const [scopeId, setScopeId] = useState(SCOPES[0].id);
  const [basis, setBasis] = useState<CostBasis>("base1");
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return window.localStorage.getItem(GUIDE_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const scope: Scope = SCOPES.find((s) => s.id === scopeId)!;

  const closeGuide = () => {
    setShowGuide(false);
    try {
      window.localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // Storage unavailable: the guide simply shows again next visit.
    }
  };

  return (
    <div className="space-y-5 p-6">
      {showGuide ? (
        <div className="border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 bg-gray-900 px-5 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen size={16} className="text-yellow-400" /> How to use this page
            </div>
            <button type="button" onClick={closeGuide} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300 hover:text-white">
              Got it <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            {GUIDE.map((g) => (
              <button key={g.id} type="button" onClick={() => setTab(g.id)} className="px-5 py-4 text-left hover:bg-gray-50">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <g.icon size={15} className="text-primary" /> {g.title}
                </div>
                <p className="mt-1.5 text-sm font-medium leading-snug text-gray-800">{g.question}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{g.how}</p>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 px-5 py-3 text-xs leading-relaxed text-gray-600">
            <strong className="text-gray-900">Can I trust these numbers?</strong> Hours and revenue come straight from Finance’s systems and add up to Finance’s
            own reports to the dollar. Every figure can be traced: open <em>How this is calculated</em> on any tab, or click <em>Why?</em> on a calculator
            figure to see each step with the real numbers.
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowGuide(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900">
          <BookOpen size={13} /> How to use this page
        </button>
      )}

      {/* Context bar */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border border-gray-200 bg-white px-5 py-4">
        {tab !== "calculator" && (
          <Field label="Agency" hint="Canadian agencies report in CAD and MEK US in USD. The two currencies are never added together.">
            <Segmented
              ariaLabel="Agency"
              value={scopeId}
              onChange={setScopeId}
              options={SCOPES.map((s) => ({ id: s.id, label: `${s.label}${s.id === "canada" || s.id === "mek" ? ` (${s.currency})` : ""}` }))}
            />
          </Field>
        )}
        <Field
          label="Cost rates"
          hint="Maconomy, Finance’s timesheet and costing system, holds two cost rates per person. Standard (Base1) is the default. They are identical for Cossette and Jungle and differ only for MEK US."
        >
          <Segmented ariaLabel="Cost rates" value={basis} onChange={setBasis} options={BASES} size="sm" />
        </Field>
        <div className="ml-auto flex max-w-md flex-col items-end gap-1 text-right text-[11px] leading-snug text-gray-500">
          <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
            <ShieldCheck size={13} className="text-green-500" /> Ties to Finance’s reports to the dollar
          </span>
          <span>
            Timesheets {fmtMonth(MODEL.months[0])} – {fmtMonth(MODEL.months[MODEL.months.length - 1])} ({MODEL.source.hoursRows.toLocaleString("en-CA")}{" "}
            entries) · gross revenue {REVENUE_WINDOW.label} · loaded {dataDate}
          </span>
        </div>
      </div>

      <SubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === "hours" && <HoursPortalTab scope={scope} basis={basis} />}
      {tab === "profitability" && <ProfitabilityTab scope={scope} basis={basis} />}
      {tab === "calculator" && <TargetsCalculatorTab basis={basis} initialAgency={scope.agencyIds.length === 1 ? scope.agencyIds[0] : "cossette"} />}

      <p className="pt-2 text-[11px] text-gray-400">
        Built from Finance’s Maconomy timesheets and gross revenue reports. Staffing cost is the cost of the hours people logged to each account; it does not
        include overhead, non-staff costs or pass-through media.
      </p>
    </div>
  );
}
