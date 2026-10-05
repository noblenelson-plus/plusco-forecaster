// components/forecaster/sections/investment-kpis-booked-section.tsx
"use client";

/**
 * INVESTMENT KPIS section — the bottom of Media Investments Report → Media
 * Investments. The same booked-to-date (MIR) content as the Exec KPI
 * Dashboard's Media & Labs KPIs page, with no Forecaster data: the four
 * scorecards (Media Labs, Billups, Meta, Digital) and the KPIs by Client
 * table. Numbers come from useBookedExecKpis, so the two pages always agree.
 *
 * Unlike the Exec page, the portfolio-wide dollar goals (Total LABS Spend,
 * MIQ-Social Spend) are hidden here: they aren't tied to clients, so they
 * mislead once the client filter narrows the scope. Share goals stay.
 *
 * Scope: the dashboard's global client filter (scopedClientIds). The MIR rows
 * are agency-partitioned by the security rules, so each user sees their own
 * agencies only — this page is open to every role.
 */

import { Loader2, Calendar } from "lucide-react";
import ExecSummaryKpiBand from "./exec-summary-kpi-band";
import ExecKpisByClientTable from "./exec-kpis-by-client-table";
import { useBookedExecKpis } from "./use-booked-exec-kpis";

export default function InvestmentKpisBookedSection({
  scopedClientIds,
  year,
}: {
  scopedClientIds: string[];
  year: number;
}) {
  const booked = useBookedExecKpis(scopedClientIds, year, { dollarTargets: false });

  return (
    <div data-scroll-section data-scroll-label="Investment KPIs" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Investment KPIs</h2>
        <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Calendar size={12} className="flex-shrink-0" />
          {year} · {booked.mirSourceLabel}
        </div>
      </div>

      {booked.loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : booked.error ? (
        <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          {booked.error}
        </div>
      ) : (
        <>
          <ExecSummaryKpiBand pillars={booked.pillars} />
          <ExecKpisByClientTable
            rows={booked.scopedKpiRows}
            scenarioById={booked.miqScenarioById}
            labsShareGoal={booked.labsShareGoal}
            billupsShareGoal={booked.goals.billupsShare}
            sourceLabel={booked.mirSourceLabel}
          />
        </>
      )}
    </div>
  );
}
