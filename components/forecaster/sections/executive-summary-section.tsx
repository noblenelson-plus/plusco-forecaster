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
 *
 * The booked (MIR) view comes from useBookedExecKpis, shared with the Media
 * Investments page's Investment KPIs section so both show the same numbers;
 * this page adds the Forecaster view, the Meta trend and the by-GM table.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar, PieChart, DollarSign } from "lucide-react";
import { computeClientTable } from "./client-table-data";
import {
  mapForecastRowsToBillups,
  computeBillupsKpis,
  type BillupsEligibility,
} from "../../../lib/dashboard/data/use-billups-by-client";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import { isEligibleForPartner } from "../../../lib/format/client";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Client } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import ExecSummaryKpiBand, { type ExecPillar } from "./exec-summary-kpi-band";
import {
  useBookedExecKpis,
  money,
  moneyCompact,
  pct,
  ratioTo,
} from "./use-booked-exec-kpis";
import MetaShareTrendStrip from "./meta-share-trend-strip";
import ExecKpisByGmTable from "./exec-kpis-by-gm-table";
import ExecKpisByClientTable from "./exec-kpis-by-client-table";

const ELIGIBILITY_YEAR = 2026;

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
  // Booked (MIR) scorecards + the scoped mo_kpi_by_client rows (shared hook).
  const booked = useBookedExecKpis(scopedClientIds, year);
  const { scopedKpiRows, inv, metaTrend, goals, labsShareGoal, mirSourceLabel } = booked;

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

  // -- Source of truth (MIR vs Forecaster) drives the KPI band ----------------
  const [source, setSource] = useState<"mir" | "forecaster">("mir");

  const forecasterPillars = useMemo<ExecPillar[]>(() => {
    return [
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
            // % of the latest RFQ forecast that's booked (MIR) to date.
            pctOfTarget: ratioTo(
              inv.meta.miqSocialSpend2026,
              inv.meta.miqSocialForecast2026
            ),
            goalLabel: `Booked ${moneyCompact(inv.meta.miqSocialSpend2026)}`,
          },
        ],
      },
    ];

  }, [
    inv,
    billupsForecast,
    fcLabsShare,
    fcLabsTotal,
    fcLabsDelta,
    goals,
    labsShareGoal,
  ]);
  const pillars = source === "mir" ? booked.pillars : forecasterPillars;

  // -- Period / "as of" label (source-aware) ----------------------------------
  const periodLabel =
    source === "mir"
      ? `${year} · ${mirSourceLabel}`
      : `${year} · Forecaster (live)`;

  // -- Loading / error --------------------------------------------------------
  const busy = booked.loading || forecastData.loading;
  const err = booked.error || forecastData.error;

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
    <div data-scroll-section data-scroll-label="Media & Labs KPIs" className="space-y-6">
      {/* Header — one tight row: title + as-of date (left), RAG legend (center),
          source toggle (right), so the scorecards are the first thing seen. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plusco Exec KPIs
          </p>
          <h2 className="text-xl font-bold text-foreground">Media &amp; Labs KPIs</h2>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Calendar size={12} className="flex-shrink-0" />
            {periodLabel}
          </div>
        </div>

      

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
            <ExecSummaryKpiBand pillars={pillars} />

      {/* Meta Share Trend — client-status snapshot, below the scorecards */}
      <div className="rounded-lg border border-border bg-card p-4">
        <MetaShareTrendStrip data={metaTrend} />
      </div>

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
