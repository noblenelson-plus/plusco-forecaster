// components/forecaster/sections/use-booked-exec-kpis.ts
"use client";

/**
 * The booked-to-date (MIR) Exec KPIs over a client scope: the four scorecard
 * pillars (Media Labs, Billups, Meta, Digital) and the scoped
 * `mo_kpi_by_client` rows behind them. Shared by the Exec KPI Dashboard's
 * Media & Labs KPIs page (which adds a Forecaster view) and the Media
 * Investments page's Investment KPIs section (booked only), so both show the
 * same numbers.
 *
 * MIR data only — `mo_kpi_by_client` is agency-partitioned by the security
 * rules, so each user gets their own agencies' rows. Goal lines come from the
 * admin Labs Targets tab (`partner_targets/{year}`).
 */

import { useEffect, useMemo, useState } from "react";
import { PieChart, DollarSign, AlertTriangle } from "lucide-react";
import {
  useMoKpiByClient,
  metaShareTrendBreakdown,
  computeInvestmentKpis,
  type KpiByClientRow,
} from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import {
  useBillupsMirRows,
  computeBillupsKpis,
} from "../../../lib/dashboard/data/use-billups-by-client";
import {
  subscribeToPartnerTargets,
  getPartnerTargetsForYear,
} from "../../../lib/services/partner-targets-service";
import {
  EMPTY_EXEC_GOALS,
  type PartnerTargetsYear,
} from "../../../lib/types/partner-targets.types";
import type { ExecPillar } from "./exec-summary-kpi-band";
import { ragStatus } from "./exec-rag";
import { useLastSync } from "../../../lib/dashboard/data/use-last-sync";

// --- Formatting -------------------------------------------------------------

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
/** Compact money, e.g. "$116.5M" / "$805.8K". */
export function moneyCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
/** Full money, e.g. "$27,546,111". */
export function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
export function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
export const ratioTo = (actual: number | null, goal: number | null): number | null =>
  actual != null && goal != null && goal !== 0 ? actual / goal : null;

// The MIR data is pulled roughly once a month; this fallback "as of" date is
// shown only when the last-sync record is unavailable.
const MIR_AS_OF_LABEL = "Jul 27, 2026";

export function useBookedExecKpis(scopedClientIds: string[], year: number) {
  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const lastSync = useLastSync();

  // -- Targets / goals (from the admin Labs Targets tab) ----------------------
  const [targetYears, setTargetYears] = useState<PartnerTargetsYear[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToPartnerTargets(setTargetYears);
    return () => unsubscribe();
  }, []);
  const targets = getPartnerTargetsForYear(targetYears, year) ?? null;
  const goals = targets?.execGoals ?? EMPTY_EXEC_GOALS;
  const labsShareGoal = targets?.totalLabsShareOfMediaTarget ?? null;

  // -- mo_kpi_by_client: Meta (all) + Labs booked -----------------------------
  const kpi = useMoKpiByClient();
  const scopedKpiRows: KpiByClientRow[] = useMemo(
    () => kpi.rows.filter((r) => scopeSet.has(r.PLUSCO_CLIENT_ID)),
    [kpi.rows, scopeSet]
  );
  const inv = useMemo(() => computeInvestmentKpis(scopedKpiRows), [scopedKpiRows]);
  const bookedLabsSpend = useMemo(
    () => scopedKpiRows.reduce((acc, r) => acc + num(r.labs_spend_2026), 0),
    [scopedKpiRows]
  );

  // -- Digital media-mix scorecards (booked; MIR-only). Aggregated from the
  // same mo_kpi_by_client rows and computed identically to the by-GM Digital
  // section (safeDiv semantics), so the totals tie out. ------------------------
  const digital = useMemo(() => {
    let dig = 0,
      dig25 = 0,
      dd = 0,
      dd25 = 0,
      ddNd = 0,
      prog = 0,
      prog25 = 0,
      progNd = 0;
    for (const r of scopedKpiRows) {
      dig += num(r.digital_spend_2026);
      dig25 += num(r.digital_spend_2025);
      dd += num(r.digital_direct_spend_2026);
      dd25 += num(r.digital_direct_spend_2025);
      ddNd += num(r.dd_nondeal_spend_2026);
      prog += num(r.prog_spend_2026);
      prog25 += num(r.prog_spend_2025);
      progNd += num(r.prog_nondeal_spend_2026);
    }
    const div = (n: number, d: number): number | null => (d !== 0 ? n / d : null);
    const ddShare = div(dd, dig);
    const ddShare25 = div(dd25, dig25);
    const progShare = div(prog, dig);
    const progShare25 = div(prog25, dig25);
    return {
      ddShare,
      progShare,
      ddNonDeal: ddNd,
      progNonDeal: progNd,
      ddYoyPpt: ddShare != null && ddShare25 != null ? ddShare - ddShare25 : null,
      progYoyPpt:
        progShare != null && progShare25 != null ? progShare - progShare25 : null,
    };
  }, [scopedKpiRows]);

  const metaTrend = useMemo(() => metaShareTrendBreakdown(scopedKpiRows), [scopedKpiRows]);

  // MIQ-Social Labs deal target (Deal Targets page) — the MIR-toggle goal.
  const miqSocialTarget = useMemo(
    () =>
      targets?.partners.find((p) => p.partner === "MIQ-Social")?.mediaSpendTarget ?? null,
    [targets]
  );

  // -- Billups booked (MIR), same path as the Billups section -----------------
  const mir = useBillupsMirRows();
  const mirRows = useMemo(
    () => mir.rows.filter((r) => scopeSet.has(r.clientId)),
    [mir.rows, scopeSet]
  );
  const billupsBooked = useMemo(() => computeBillupsKpis(mirRows), [mirRows]);

  const metaYoyPpt = inv.meta.metaShareOfSocial.yoyPpt;

  const pillars = useMemo<ExecPillar[]>(
    () => [
      {
        title: "Media Labs",
        subtitle: "Booked to date (MIR)",
        metrics: [
          {
            icon: PieChart,
            label: "Labs Share of Total Media",
            value: pct(inv.labs.labsShareOfTotalMedia),
            pctOfTarget: ratioTo(inv.labs.labsShareOfTotalMedia, labsShareGoal),
            goalLabel: labsShareGoal != null ? `Goal ${pct(labsShareGoal)}` : undefined,
          },
          {
            icon: DollarSign,
            label: "Total LABS Spend",
            value: money(bookedLabsSpend),
            pctOfTarget: ratioTo(bookedLabsSpend, goals.labsSpend),
            goalLabel:
              goals.labsSpend != null ? `Goal ${moneyCompact(goals.labsSpend)}` : undefined,
          },
        ],
      },
      {
        title: "Billups",
        subtitle: "Booked to date (MIR)",
        metrics: [
          {
            icon: PieChart,
            label: "Billups Share of OOH",
            value: pct(billupsBooked.ooh.eligibleShare),
            pctOfTarget: ratioTo(billupsBooked.ooh.eligibleShare, goals.billupsShare),
            goalLabel:
              goals.billupsShare != null ? `Goal ${pct(goals.billupsShare)}` : undefined,
          },
          {
            icon: PieChart,
            label: "Billups Share of PRINT",
            value: pct(billupsBooked.print.eligibleShare),
            pctOfTarget: ratioTo(billupsBooked.print.eligibleShare, goals.billupsShare),
            goalLabel:
              goals.billupsShare != null ? `Goal ${pct(goals.billupsShare)}` : undefined,
          },
          {
            icon: AlertTriangle,
            label: "Missed Opportunity",
            value: money(billupsBooked.combined.missed),
            // OOH + Print split of the missed $ (small caption). The two
            // eligibleMissed values sum to combined.missed.
            sub: `OOH ${moneyCompact(
              billupsBooked.ooh.eligibleMissed
            )} · Print ${moneyCompact(billupsBooked.print.eligibleMissed)}`,
          },
        ],
      },
      {
        title: "Meta",
        subtitle: "Booked to date (MIR)",
        metrics: [
          {
            icon: DollarSign,
            label: "Meta Spend 2026",
            value: money(inv.meta.metaSpend2026),
            pctOfTarget: ratioTo(inv.meta.metaSpend2026, inv.meta.targetMetaSpend2026),
            status: ragStatus(inv.meta.metaSpend2026, inv.meta.targetMetaSpend2026, {
              lowerIsBetter: true,
            }),
            goalLabel: `Target ${moneyCompact(inv.meta.targetMetaSpend2026)}`,
          },
          {
            icon: PieChart,
            label: "Meta Share of Social 2026",
            value: pct(inv.meta.metaShareOfSocial.value),
            status: ragStatus(
              inv.meta.metaShareOfSocial.value,
              inv.meta.targetMetaShareOfSocial,
              { lowerIsBetter: true }
            ),
            sub: `Target ${pct(inv.meta.targetMetaShareOfSocial)}`,
            yoy:
              metaYoyPpt != null
                ? {
                    label: `${(metaYoyPpt * 100).toFixed(1)}pt YoY`,
                    favorable: metaYoyPpt <= 0,
                  }
                : null,
          },
          {
            icon: DollarSign,
            label: "MIQ-Social Spend",
            value: money(inv.meta.miqSocialSpend2026),
            // % booked vs the MIQ-Social Labs deal target (Deal Targets page).
            pctOfTarget: ratioTo(inv.meta.miqSocialSpend2026, miqSocialTarget),
            goalLabel:
              miqSocialTarget != null ? `Target ${moneyCompact(miqSocialTarget)}` : undefined,
          },
        ],
      },
      {
        title: "Digital",
        subtitle: "Booked to date (MIR)",
        metrics: [
          {
            icon: PieChart,
            label: "Digital Direct Share of Digital",
            value: pct(digital.ddShare),
            yoy:
              digital.ddYoyPpt != null
                ? {
                    label: `${digital.ddYoyPpt >= 0 ? "+" : ""}${(
                      digital.ddYoyPpt * 100
                    ).toFixed(0)}pt`,
                    favorable: digital.ddYoyPpt < 0,
                  }
                : null,
          },
          {
            icon: DollarSign,
            label: "Digital Direct $ Non-Deal",
            value: money(digital.ddNonDeal),
          },
          {
            icon: PieChart,
            label: "Prog Share of Digital",
            value: pct(digital.progShare),
            yoy:
              digital.progYoyPpt != null
                ? {
                    label: `${digital.progYoyPpt >= 0 ? "+" : ""}${(
                      digital.progYoyPpt * 100
                    ).toFixed(0)}pt`,
                    favorable: digital.progYoyPpt > 0,
                  }
                : null,
          },
          {
            icon: DollarSign,
            label: "Prog $ Non-Deal",
            value: money(digital.progNonDeal),
          },
        ],
      },
    ],
    [inv, bookedLabsSpend, billupsBooked, goals, labsShareGoal, metaYoyPpt, digital, miqSocialTarget]
  );

  const mirSourceLabel = `Booked to date (MIR) · as of ${lastSync.labelShort ?? MIR_AS_OF_LABEL}`;

  return {
    /** The four booked (MIR) scorecard pillars. */
    pillars,
    scopedKpiRows,
    inv,
    metaTrend,
    goals,
    labsShareGoal,
    mirSourceLabel,
    loading: kpi.loading || mir.loading,
    error: kpi.error || mir.error,
  };
}
