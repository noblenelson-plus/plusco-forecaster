// filepath: components/finance-toolkit/finance-toolkit.tsx
"use client";

/**
 * Finance Toolkit — the page body: one slim context bar (agency, how fresh the
 * data is, and a "How to read this page" guide that opens on demand), a
 * Client / BU-region / GM filter row (accounts linked to Forecaster clients by
 * GAIA number, client-links.ts), then four sub-tabs. Opens on Account Profitability, the question leadership asks
 * first; each tab leads with its own answer, so the guide starts closed.
 */

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Calculator, ChevronDown, Clock, PieChart, ShieldCheck, Users } from "lucide-react";
import SubTabBar from "../forecaster/sub-tab-bar";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import { fetchAccessibleClients } from "../../lib/services/assignment-service";
import { CLIENT_GM_PODS, CLIENT_REGIONS } from "../../lib/constants/client.constants";
import { NOT_LINKED, buildClientLinks, type ClientLink } from "../../lib/finance-toolkit/client-links";
import { MODEL, REVENUE_WINDOW, SCOPES, inScope, monthLabel, type Scope } from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Field, InfoTip, Segmented } from "./ft-ui";
import HoursPortalTab from "./hours-portal-tab";
import ProfitabilityTab from "./profitability-tab";
import StaffingTab from "./staffing-tab";
import InvestmentCalculator from "./investment-calculator";
import TargetsCalculatorTab from "./targets-calculator-tab";

type TabId = "hours" | "profitability" | "staffing" | "calculator";
// Present first (profitability, time, staffing), then the future (new business).
const TABS: { id: TabId; label: string }[] = [
  { id: "profitability", label: "Account Profitability" },
  { id: "hours", label: "Hours Report Portal" },
  { id: "staffing", label: "Staffing" },
  { id: "calculator", label: "New Business Calculator" },
];

const GUIDE: { id: TabId; icon: typeof PieChart; title: string; question: string; how: string }[] = [
  {
    id: "profitability",
    icon: PieChart,
    title: "Account Profitability",
    question: "Once we pay for our teams’ time, how much is left, and which accounts don’t pay their way?",
    how: "The answer is at the top. Below it: the monthly trend, the biggest contributors, and the few accounts that need review, grouped by the likely reason. Click any account for its trend. Margins are before overhead.",
  },
  {
    id: "hours",
    icon: Clock,
    title: "Hours Report Portal",
    question: "How much of our people’s time goes to clients, and where does the rest go?",
    how: "The share of hours spent on clients, month by month and by role. Below, the raw hours by client, role, month or type of work, with a Google Sheets export.",
  },
  {
    id: "staffing",
    icon: Users,
    title: "Staffing",
    question: "How much media does each person manage, and which GM pods are stretched?",
    how: "Media spend from MediaOcean against the hours logged on each client over the same 12 months, by GM pod and client, with each client’s campaign complexity from MediaBox. Role groups are provisional.",
  },
  {
    id: "calculator",
    icon: Calculator,
    title: "New Business Calculator",
    question: "If we win an account, what team does it need, and what margin will we make?",
    how: "Start from the client fee (agency, fee, similar clients, then what-if sliders) or from the media investment (investment, digital share, campaigns): either way the team comes from what similar current clients actually use.",
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
  const [calcMode, setCalcMode] = useState<"revenue" | "investment">("revenue");
  const scope: Scope = SCOPES.find((s) => s.id === scopeId)!;

  // Forecaster clients → BU-region / GM pod for each Maconomy account (GAIA number).
  const { profile, isAdmin } = useUserProfile();
  const [links, setLinks] = useState<Map<string, ClientLink> | null>(null);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    fetchAccessibleClients(profile, isAdmin)
      .then((clients) => !cancelled && setLinks(buildClientLinks(clients)))
      .catch(() => !cancelled && setLinks(new Map()));
    return () => {
      cancelled = true;
    };
  }, [profile, isAdmin]);

  const [clientSel, setClientSel] = useState<string[]>([]);
  const [regionSel, setRegionSel] = useState<string[]>([]);
  const [gmSel, setGmSel] = useState<string[]>([]);
  // Staffing has its own agency switch and counts every agency, so its client list does too.
  const allAgencies = tab === "staffing";
  const accounts = useMemo(
    () => MODEL.clients.filter((c) => !c.internal && (allAgencies || inScope(scope, c)) && (c.firstMonth >= 0 || c.match === "revenue-only")),
    [scope, allAgencies],
  );
  const clientOptions = useMemo(
    () =>
      accounts
        .map((c) => ({ value: String(c.index), label: `${c.name}${allAgencies || scope.agencyIds.length > 1 ? ` · ${c.agencyName}` : ""}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [accounts, scope, allAgencies],
  );
  const regionOptions = [
    ...CLIENT_REGIONS.map((r) => ({ value: r.value as string, label: r.label as string })),
    { value: NOT_LINKED, label: "Not in Forecaster" },
  ];
  const gmOptions = [
    ...CLIENT_GM_PODS.map((g) => ({ value: g.value as string, label: g.label as string })),
    { value: NOT_LINKED, label: "Not in Forecaster" },
  ];
  const validClients = clientSel.filter((v) => clientOptions.some((o) => o.value === v));
  const filterOn = validClients.length + regionSel.length + gmSel.length > 0;
  /** The accounts passing every filter, or null when no filter is set. */
  const clientFilter = useMemo(() => {
    if (!filterOn) return null;
    const picked = new Set(validClients.map(Number));
    const set = new Set<number>();
    for (const c of accounts) {
      if (picked.size && !picked.has(c.index)) continue;
      const link = links?.get(c.number);
      if (regionSel.length && !regionSel.includes(link?.region || NOT_LINKED)) continue;
      if (gmSel.length && !gmSel.includes(link?.gmPod || NOT_LINKED)) continue;
      set.add(c.index);
    }
    return set;
  }, [filterOn, validClients, regionSel, gmSel, accounts, links]);
  /** Accounts picked in the Clients dropdown (Staffing filters by client, so region / GM apply to its own rows). */
  const pickedAccounts = useMemo(() => (validClients.length ? new Set(validClients.map(Number)) : null), [validClients]);
  const linkedCount = links ? accounts.filter((c) => links.has(c.number)).length : null;
  const clearFilters = () => {
    setClientSel([]);
    setRegionSel([]);
    setGmSel([]);
  };

  return (
    <div className="space-y-5 p-6">
      {/* Context bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {tab !== "calculator" && tab !== "staffing" && (
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

      {tab !== "calculator" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filter</span>
          <MultiSelectDropdown label="Clients" options={clientOptions} selectedValues={validClients} onChange={setClientSel} searchable />
          <MultiSelectDropdown label="BU-region" options={regionOptions} selectedValues={regionSel} onChange={setRegionSel} />
          <MultiSelectDropdown label="GM" options={gmOptions} selectedValues={gmSel} onChange={setGmSel} />
          {filterOn && (
            <>
              <span className="text-sm text-gray-600">
                <strong className="text-gray-900">{clientFilter?.size ?? 0}</strong> account{clientFilter?.size === 1 ? "" : "s"} selected
              </span>
              <button type="button" onClick={clearFilters} className="text-sm font-semibold text-gray-500 hover:text-gray-900">
                Clear
              </button>
            </>
          )}
          {linkedCount !== null && (
            <InfoTip
              text={`BU-region and GM come from the Forecaster client that lists the account’s Maconomy number as a GAIA number (${linkedCount} of ${accounts.length} accounts here). Accounts with no Forecaster client show as “Not in Forecaster”.`}
              align="left"
            />
          )}
        </div>
      )}

      {showGuide && (
        <div className="border border-gray-200 bg-white">
          <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
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

      {tab === "hours" && <HoursPortalTab scope={scope} basis={basis} clientFilter={clientFilter} />}
      {tab === "profitability" && <ProfitabilityTab scope={scope} basis={basis} clientFilter={clientFilter} />}
      {tab === "staffing" && <StaffingTab picked={pickedAccounts} regions={regionSel} gms={gmSel} />}
      {tab === "calculator" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Start from</span>
            <Segmented
              ariaLabel="Start from"
              value={calcMode}
              onChange={setCalcMode}
              options={[
                { id: "revenue", label: "The client fee (revenue)" },
                { id: "investment", label: "The media investment" },
              ]}
            />
          </div>
          {calcMode === "revenue" ? (
            <TargetsCalculatorTab basis={basis} initialAgency={scope.agencyIds.length === 1 ? scope.agencyIds[0] : "cossette"} />
          ) : (
            <InvestmentCalculator />
          )}
        </div>
      )}

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
