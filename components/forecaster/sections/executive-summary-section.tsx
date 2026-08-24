// filepath: components/forecaster/sections/executive-summary-section.tsx
"use client";

/**
 * Executive Summary — the portfolio "at a glance" band at the top of the
 * Executive KPIs tab (above Billups). Three columns (Media Labs, Billups, Meta;
 * Local Media is out of scope for now), each with a goal line and a Booked /
 * Forecaster split, mirroring the Looker Executive Summary.
 *
 * Actuals are computed live over the dashboard scope:
 *   - Media Labs booked + Meta (all) — from `mo_kpi_by_client` via
 *     computeInvestmentKpis (plus a raw Total LABS Spend sum).
 *   - Media Labs forecast — from the page's forecast scope (`data.labs`).
 *   - Billups booked + forecast — the same path as the Billups section
 *     (computeBillupsKpis over MIR rows and mapped forecast rows).
 *
 * Goal lines come from the admin Labs Targets tab (`partner_targets/{year}`):
 * the Labs share target + the Exec goals (Labs spend, Meta spend + share,
 * Billups share). "% of Target" is the actual spend / the goal.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar, PieChart, DollarSign, AlertTriangle } from "lucide-react";
import { computeClientTable } from "./client-table-data";
import {
  useMoKpiByClient,
  computeInvestmentKpis,
} from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import {
  useBillupsMirRows,
  mapForecastRowsToBillups,
  computeBillupsKpis,
  type BillupsEligibility,
} from "../../../lib/dashboard/data/use-billups-by-client";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import {
  subscribeToPartnerTargets,
  getPartnerTargetsForYear,
} from "../../../lib/services/partner-targets-service";
import { isEligibleForPartner } from "../../../lib/format/client";
import {
  EMPTY_EXEC_GOALS,
  type PartnerTargetsYear,
} from "../../../lib/types/partner-targets.types";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Client } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import ExecSummaryKpiBand, { RagLegend, type ExecPillar } from "./exec-summary-kpi-band";
import ExecKpisByGmTable from "./exec-kpis-by-gm-table";
import ExecKpisByClientTable from "./exec-kpis-by-client-table";
import { ragStatus } from "./exec-rag";

const ELIGIBILITY_YEAR = 2026;

// --- Formatting helpers -------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
/** Compact money, e.g. "$116.5M" / "$805.8K". */
function moneyCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
/** Full money, e.g. "$27,546,111". */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

// --- MIR "as of" date --------------------------------------------------------
// The MIR data is pulled roughly once a month; this is the pull date shown in
// the source column of the latest MIR. Update it whenever a new MIR is synced.
const MIR_AS_OF_LABEL = "Jul 27, 2026";

// --- Section ------------------------------------------------------------------

export default function ExecutiveSummarySection({
  forecastData,
  comparisonData,
  clients,
  usersMap,
  scopedClientIds,
  year,
}: {
  forecastData: ScopeForecastData;
  comparisonData: ScopeForecastData;
  clients: Client[];
  usersMap: Map<string, string>;
  scopedClientIds: string[];
  year: number;
}) {
  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);

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
  const scopedKpiRows = useMemo(
    () => kpi.rows.filter((r) => scopeSet.has(r.PLUSCO_CLIENT_ID)),
    [kpi.rows, scopeSet]
  );
  const inv = useMemo(
    () => computeInvestmentKpis(scopedKpiRows),
    [scopedKpiRows]
  );
  const bookedLabsSpend = useMemo(
    () => scopedKpiRows.reduce((acc, r) => acc + num(r.labs_spend_2026), 0),
    [scopedKpiRows]
  );

  // -- Billups: booked (MIR) + forecast, same path as the Billups section -----
  const mir = useBillupsMirRows();
  const mirRows = useMemo(
    () => mir.rows.filter((r) => scopeSet.has(r.clientId)),
    [mir.rows, scopeSet]
  );

  const [partners, setPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setPartners);
    return () => unsubscribe();
  }, []);

  const eligibilityById = useMemo(() => {
    const yearPartners = getLabsPartnersForYear(partners, ELIGIBILITY_YEAR);
    const find = (name: string): LabsPartner | null =>
      yearPartners.find(
        (p) => p.name.trim().toLowerCase() === name.toLowerCase()
      ) ?? null;
    const oohPartner = find("Billups-OOH");
    const printPartner = find("Billups-Print");
    const map = new Map<string, BillupsEligibility>();
    for (const c of clients) {
      map.set(c.cl_id, {
        ooh: oohPartner ? isEligibleForPartner(c, oohPartner.partnerId) : true,
        print: printPartner
          ? isEligibleForPartner(c, printPartner.partnerId)
          : true,
      });
    }
    return map;
  }, [partners, clients]);

  const gmPodById = useMemo(
    () => new Map(clients.map((c) => [c.cl_id, c.GM_Pod ?? ""])),
    [clients]
  );

  const billupsForecastRows = useMemo(
    () =>
      mapForecastRowsToBillups(
        computeClientTable(
          forecastData,
          comparisonData,
          clients,
          usersMap,
          year,
          scopedClientIds
        ),
        eligibilityById,
        gmPodById
      ),
    [
      forecastData,
      comparisonData,
      clients,
      usersMap,
      year,
      scopedClientIds,
      eligibilityById,
      gmPodById,
    ]
  );

  const billupsBooked = useMemo(() => computeBillupsKpis(mirRows), [mirRows]);
  const billupsForecast = useMemo(
    () => computeBillupsKpis(billupsForecastRows),
    [billupsForecastRows]
  );

  // -- Media Labs forecast (from the page's forecast scope) -------------------
  const fcLabsShare = forecastData.labs.ratio;
  const fcLabsTotal = forecastData.labs.totalLabs;
  const fcLabsDelta = comparisonData.hasContext
    ? fcLabsTotal - comparisonData.labs.totalLabs
    : null;

  const metaYoyPpt = inv.meta.metaShareOfSocial.yoyPpt;

  // -- Source of truth (MIR vs Forecaster) drives the KPI band ----------------
  const [source, setSource] = useState<"mir" | "forecaster">("mir");

  const pillars = useMemo<ExecPillar[]>(() => {
    const ratioTo = (actual: number | null, goal: number | null): number | null =>
      actual != null && goal != null && goal !== 0 ? actual / goal : null;

    const mirPillars: ExecPillar[] = [
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
            sub: "Eligible $ not captured by Billups",
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
          },
        ],
      },
    ];

    const forecasterPillars: ExecPillar[] = [
      {
        title: "Media Labs",
        subtitle: "Forecaster",
        metrics: [
          {
            icon: PieChart,
            label: "Labs Share of Total Media",
            value: pct(fcLabsShare),
            pctOfTarget: ratioTo(fcLabsShare, labsShareGoal),
            goalLabel: labsShareGoal != null ? `Goal ${pct(labsShareGoal)}` : undefined,
          },
          {
            icon: DollarSign,
            label: "Total Labs Forecast",
            value: money(fcLabsTotal),
            pctOfTarget: ratioTo(fcLabsTotal, goals.labsSpend),
            goalLabel:
              goals.labsSpend != null ? `Goal ${moneyCompact(goals.labsSpend)}` : undefined,
            sub:
              fcLabsDelta != null
                ? `${fcLabsDelta >= 0 ? "+" : ""}${moneyCompact(fcLabsDelta)} vs comparison`
                : undefined,
          },
        ],
      },
      {
        title: "Billups",
        subtitle: "Forecaster",
        metrics: [
          {
            icon: PieChart,
            label: "Billups Share of OOH",
            value: pct(billupsForecast.ooh.eligibleShare),
            pctOfTarget: ratioTo(billupsForecast.ooh.eligibleShare, goals.billupsShare),
            goalLabel:
              goals.billupsShare != null ? `Goal ${pct(goals.billupsShare)}` : undefined,
          },
          {
            icon: PieChart,
            label: "Billups Share of PRINT",
            value: pct(billupsForecast.print.eligibleShare),
            pctOfTarget: ratioTo(billupsForecast.print.eligibleShare, goals.billupsShare),
            goalLabel:
              goals.billupsShare != null ? `Goal ${pct(goals.billupsShare)}` : undefined,
          },
        ],
      },
      {
        title: "Meta",
        subtitle: "Forecaster",
        metrics: [
          {
            icon: DollarSign,
            label: "MIQ-Social Forecast",
            value: money(inv.meta.miqSocialForecast2026),
          },
        ],
      },
    ];

    return source === "mir" ? mirPillars : forecasterPillars;
  }, [
    source,
    inv,
    bookedLabsSpend,
    billupsBooked,
    billupsForecast,
    fcLabsShare,
    fcLabsTotal,
    fcLabsDelta,
    goals,
    labsShareGoal,
    metaYoyPpt,
  ]);

  // -- Period / "as of" label (source-aware) ----------------------------------
  const mirSourceLabel = `Booked to date (MIR) · as of ${MIR_AS_OF_LABEL}`;
  const periodLabel =
    source === "mir"
      ? `${year} · ${mirSourceLabel}`
      : `${year} · Forecaster (live)`;

  // -- Loading / error --------------------------------------------------------
  const busy = kpi.loading || mir.loading || forecastData.loading;
  const err = kpi.error || mir.error || forecastData.error;

  if (busy) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        {err}
      </div>
    );
  }

  // -- Render --------------------------------------------------------------
  return (
    <div data-scroll-section data-scroll-label="Executive Summary" className="space-y-6">
      {/* Header — one tight row: title + as-of date (left), RAG legend (center),
          source toggle (right), so the scorecards are the first thing seen. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plusco Exec KPIs
          </p>
          <h2 className="text-xl font-bold text-foreground">Executive Summary</h2>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Calendar size={12} className="flex-shrink-0" />
            {periodLabel}
          </div>
        </div>

        <RagLegend />

        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              ["mir", "Booked to date (MIR)"],
              ["forecaster", "Forecaster"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSource(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                source === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Total Plusco KPI band (drives off the selected source) */}
      <ExecSummaryKpiBand pillars={pillars} legend={false} />

      {/* By GM */}
      <ExecKpisByGmTable
        rows={scopedKpiRows}
        labsShareGoal={labsShareGoal}
        billupsShareGoal={goals.billupsShare}
        sourceLabel={mirSourceLabel}
      />

      {/* By client */}
      <ExecKpisByClientTable
        rows={scopedKpiRows}
        labsShareGoal={labsShareGoal}
        billupsShareGoal={goals.billupsShare}
        sourceLabel={mirSourceLabel}
      />
    </div>
  );
}
