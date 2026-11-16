// filepath: components/finance-toolkit/finance-toolkit.tsx
"use client";

/**
 * Finance Toolkit — the admin page body: a context bar (agency scope + cost
 * basis, shared by every tab) over three sub-tabs. Loaded only for admins
 * (the route imports it dynamically after the admin check), so the dataset
 * chunk is never requested by anyone else's browser.
 */

import { useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import SubTabBar from "../forecaster/sub-tab-bar";
import { MODEL, REVENUE_WINDOW, SCOPES, type Scope } from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Field, Segmented } from "./ft-ui";
import HoursPortalTab from "./hours-portal-tab";
import ProfitabilityTab from "./profitability-tab";
import TargetsCalculatorTab from "./targets-calculator-tab";

type TabId = "hours" | "profitability" | "calculator";
const TABS: { id: TabId; label: string }[] = [
  { id: "hours", label: "Hours Report Portal" },
  { id: "profitability", label: "Account Profitability" },
  { id: "calculator", label: "New Business Targets Calculator" },
];

const BASES: { id: CostBasis; label: string; hint: string }[] = [
  { id: "base1", label: "Base1 cost", hint: "Maconomy CostPriceReg_Base1" },
  { id: "enterprise", label: "Enterprise cost", hint: "Maconomy CostPriceReg_Enterprise" },
];

const firstMonth = MODEL.months[0];
const lastMonth = MODEL.months[MODEL.months.length - 1];
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
};

export default function FinanceToolkit() {
  const [tab, setTab] = useState<TabId>("hours");
  const [scopeId, setScopeId] = useState(SCOPES[0].id);
  const [basis, setBasis] = useState<CostBasis>("base1");
  const scope: Scope = SCOPES.find((s) => s.id === scopeId)!;

  return (
    <div className="space-y-5 p-6">
      {/* Context bar */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border border-gray-200 bg-white px-5 py-4">
        {tab !== "calculator" && (
          <Field label="Scope">
            <Segmented
              ariaLabel="Agency scope"
              value={scopeId}
              onChange={setScopeId}
              options={SCOPES.map((s) => ({ id: s.id, label: `${s.label}${s.id === "canada" || s.id === "mek" ? ` (${s.currency})` : ""}` }))}
            />
          </Field>
        )}
        <Field label="Cost basis">
          <Segmented ariaLabel="Cost basis" value={basis} onChange={setBasis} options={BASES} />
        </Field>
        <div className="ml-auto flex flex-col items-end gap-1 text-right text-[11px] leading-snug text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Database size={12} /> Maconomy hours {fmtMonth(firstMonth)} – {fmtMonth(lastMonth)} · gross revenue {REVENUE_WINDOW.label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-green-600" /> Reconciled to {MODEL.source.hoursRows.toLocaleString("en-CA")} time entries ·{" "}
            {MODEL.source.employees} employees
          </span>
        </div>
      </div>

      <SubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === "hours" && <HoursPortalTab scope={scope} basis={basis} />}
      {tab === "profitability" && <ProfitabilityTab scope={scope} basis={basis} />}
      {tab === "calculator" && <TargetsCalculatorTab basis={basis} initialAgency={scope.agencyIds.length === 1 ? scope.agencyIds[0] : "cossette"} />}

      <p className="pt-2 text-[11px] text-gray-400">
        Sample built from Finance’s Maconomy exports (hours detail and gross revenue reports). Cost basis applies to every tab. Base1 and Enterprise
        costs are identical for Cossette Media and Jungle Media; they differ for MEK US.
      </p>
    </div>
  );
}
