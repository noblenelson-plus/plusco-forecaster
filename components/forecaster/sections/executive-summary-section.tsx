// filepath: components/forecaster/sections/executive-summary-section.tsx
"use client";

/**
 * Executive Summary — the portfolio "at a glance" band at the top of the
 * Executive KPIs tab (above Billups). Three columns (Media Labs, Billups, Meta;
 * Local Media is out of scope for now), each with a goal line and a Booked /
 * Forecaster split, mirroring the Looker Executive Summary.
 *
 * Actuals are computed live over the dashboard scope:
 *   • Media Labs booked + Meta (all) — from `mo_kpi_by_client` via
 *     computeInvestmentKpis (plus a raw Total LABS Spend sum).
 *   • Media Labs forecast — from the page's forecast scope (`data.labs`).
 *   • Billups booked + forecast — the same path as the Billups section
 *     (computeBillupsKpis over MIR rows and mapped forecast rows).
 *
 * Goal lines come from the admin Labs Targets tab (`partner_targets/{year}`):
 * the Labs share target + the Exec goals (Labs spend, Meta spend + share,
 * Billups share). "% of Target" is the actual spend ÷ the goal.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
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

const ELIGIBILITY_YEAR = 2026;

// ─── Formatting helpers ───────────────────────────────────────────────────────

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
function safeDiv(a: number, b: number | null): number | null {
  return b && b !== 0 ? a / b : null;
}

// ─── Layout pieces ────────────────────────────────────────────────────────────

function Column({
  title,
  goal,
  children,
}: {
  title: string;
  goal?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {goal && <p className="mt-0.5 text-xs text-muted-foreground">{goal}</p>}
      </div>
      {children}
    </div>
  );
}

function Block({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {note && (
          <p className="text-[11px] italic text-muted-foreground/80">{note}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

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

  // ── Targets / goals (from the admin Labs Targets tab) ──────────────────────
  const [targetYears, setTargetYears] = useState<PartnerTargetsYear[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToPartnerTargets(setTargetYears);
    return () => unsubscribe();
  }, []);
  const targets = getPartnerTargetsForYear(targetYears, year) ?? null;
  const goals = targets?.execGoals ?? EMPTY_EXEC_GOALS;
  const labsShareGoal = targets?.totalLabsShareOfMediaTarget ?? null;

  // ── mo_kpi_by_client: Meta (all) + Labs booked ─────────────────────────────
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

  // ── Billups: booked (MIR) + forecast, same path as the Billups section ─────
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

  // ── Media Labs forecast (from the page's forecast scope) ───────────────────
  const fcLabsShare = forecastData.labs.ratio;
  const fcLabsTotal = forecastData.labs.totalLabs;
  const fcLabsDelta = comparisonData.hasContext
    ? fcLabsTotal - comparisonData.labs.totalLabs
    : null;

  // ── Derived % of target ────────────────────────────────────────────────────
  const bookedLabsPctOfTarget = safeDiv(bookedLabsSpend, goals.labsSpend);
  const fcLabsPctOfTarget = safeDiv(fcLabsTotal, goals.labsSpend);

  const metaYoyPpt = inv.meta.metaShareOfSocial.yoyPpt;

  // ── Loading / error ────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div data-scroll-section data-scroll-label="Executive Summary" className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Plusco Exec KPIs
        </p>
        <h2 className="text-xl font-bold text-foreground">Executive Summary</h2>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* ── Media Labs ── */}
        <Column
          title="Media Labs"
          goal={
            goals.labsSpend != null || labsShareGoal != null ? (
              <>
                Spend: {goals.labsSpend != null ? money(goals.labsSpend) : "—"}
                {labsShareGoal != null && <> ({pct(labsShareGoal)} Share of Total Media)</>}
              </>
            ) : undefined
          }
        >
          <Block label="Booked To Date" note="Note: SSP & PBB excluded">
            <StatCard label="Labs Share of Total Media" value={pct(inv.labs.labsShareOfTotalMedia)} accent="text-violet-500" />
            <StatCard label="Total LABS Spend" value={money(bookedLabsSpend)} />
            <StatCard label="% of Target" value={pct(bookedLabsPctOfTarget)} accent="text-indigo-500" />
          </Block>
          <Block label="Forecaster" note="Note: Top 5 Labs partners only">
            <StatCard label="Labs Share of Total Media" value={pct(fcLabsShare)} accent="text-violet-500" />
            <StatCard
              label="Total Labs Forecast"
              value={money(fcLabsTotal)}
              sub={fcLabsDelta != null ? `${fcLabsDelta >= 0 ? "+" : ""}${moneyCompact(fcLabsDelta)} vs comparison` : undefined}
            />
            <StatCard label="% of Target" value={pct(fcLabsPctOfTarget)} accent="text-indigo-500" />
          </Block>
        </Column>

        {/* ── Billups ── */}
        <Column
          title="Billups"
          goal={
            goals.billupsShare != null ? (
              <>Share of OOH/Print: {pct(goals.billupsShare)} for eligible clients</>
            ) : undefined
          }
        >
          <Block label="Booked To Date" note="Note: Eligible clients only, excludes client losses/inactive">
            <StatCard label="Billups Share of OOH" value={pct(billupsBooked.ooh.eligibleShare)} accent="text-indigo-500" />
            <StatCard label="Billups Share of PRINT" value={pct(billupsBooked.print.eligibleShare)} accent="text-indigo-500" />
            <StatCard label="Missed Opportunity (Eligible $)" value={money(billupsBooked.combined.missed)} accent="text-red-500" />
          </Block>
          <Block label="Forecaster" note="Note: Eligible clients only">
            <StatCard label="Billups Share of OOH" value={pct(billupsForecast.ooh.eligibleShare)} accent="text-indigo-500" />
            <StatCard label="Billups Share of PRINT" value={pct(billupsForecast.print.eligibleShare)} accent="text-indigo-500" />
          </Block>
        </Column>

        {/* ── Meta ── */}
        <Column
          title="Meta"
          goal={
            goals.metaSpend != null || goals.metaShareOfSocial != null ? (
              <>
                {goals.metaSpend != null && <>Spend &lt; {money(goals.metaSpend)}</>}
                {goals.metaShareOfSocial != null && (
                  <> · Meta Share of Social {pct(goals.metaShareOfSocial)}</>
                )}
              </>
            ) : undefined
          }
        >
          <Block label="Booked To Date">
            <StatCard label="Meta spend 2026" value={money(inv.meta.metaSpend2026)} />
            <StatCard
              label="Meta Share of Social 2026"
              value={pct(inv.meta.metaShareOfSocial.value)}
              sub={metaYoyPpt != null ? `${(metaYoyPpt * 100).toFixed(1)}pt YoY` : undefined}
              accent="text-indigo-500"
            />
            <StatCard label="MIQ-Social Spend" value={money(inv.meta.miqSocialSpend2026)} />
          </Block>
          <Block label="Forecaster" note="Note: MIQ-Social only">
            <StatCard label="MIQ-Social forecast" value={money(inv.meta.miqSocialForecast2026)} />
          </Block>
        </Column>
      </div>
    </div>
  );
}
