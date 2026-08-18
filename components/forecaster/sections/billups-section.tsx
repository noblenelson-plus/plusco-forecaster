// filepath: components/forecaster/sections/billups-section.tsx
"use client";

/**
 * Billups — the Executive KPIs page. One page, two sources behind a toggle:
 *
 *   • MIR      — booked-to-date actuals, read from `mo_kpi_by_client` and
 *                narrowed to the dashboard scope (useBillupsMirRows).
 *   • Forecast — the MediaBox Forecaster (BL submission) basis, built from the
 *                page's forecast scope via computeClientTable and mapped with
 *                mapForecastRowsToBillups.
 *
 * Scope + filtering come from the page's dashboard filter bar (the props below),
 * so this section does NOT carry its own filter bar — the top-of-page filters
 * (Agency / GM Pod / Region / Status / Business Lead / Client) drive both
 * sources through `scopedClientIds`. Currency is already resolved upstream in
 * `forecastData`. The Looker layout is scorecards + table (no charts).
 *
 * Layout matches the shipped sections: an icon + title header with the source
 * toggle, then the KPI scorecard tiles floating over the page (as on the other
 * tabs), with only the client-detail table wrapped in a ChartCard panel.
 * Both sources feed the SAME roll-up (computeBillupsKpis) and the SAME table
 * (BillupsTable); only the card arrangement differs per source, mirroring the
 * two Looker screens.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Gauge, Loader2 } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import BillupsTable from "./billups-table";
import { computeClientTable } from "./client-table-data";
import {
  useBillupsMirRows,
  mapForecastRowsToBillups,
  computeBillupsKpis,
  type BillupsSource,
  type BillupsEligibility,
  type BillupsKpis,
} from "../../../lib/dashboard/data/use-billups-by-client";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import { isEligibleForPartner } from "../../../lib/format/client";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Client } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

// Eligibility is defined against the 2026 LABS partners, matching the Investment
// KPIs detail view.
const ELIGIBILITY_YEAR = 2026;

// ─── Formatting helpers (match the MediaOcean sections + the Billups table) ───

/** 24189234 → "$24,189,234" (en-CA, full precision). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.88 → "88%" ; null → "—". `digits` lets the combined share show 90.62%. */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

// ─── Small layout pieces ──────────────────────────────────────────────────────

/** A labelled band: a left-hand caption beside a grid of scorecards. */
function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
      <div className="w-40 shrink-0 pt-2 text-sm font-semibold text-foreground">
        {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Standard responsive card grid used inside every band. */
function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

// ─── Card sets (one per source, same underlying kpis) ─────────────────────────

/** MIR "Billups Booked to Date" card set. */
function MirCards({ k }: { k: BillupsKpis }) {
  return (
    <div className="space-y-6">
      <Band label="Eligible Clients Only">
        <CardGrid>
          <StatCard label="Billups Share of OOH" value={pct(k.ooh.eligibleShare)} accent="text-indigo-500" />
          <StatCard label="Billups-OOH" value={money(k.ooh.eligibleBillups)} />
          <StatCard label="OOH Channel" value={money(k.ooh.eligibleChannel)} />
          <StatCard label="Missed Opportunity (OOH)" value={money(k.ooh.eligibleMissed)} accent="text-red-500" />

          <StatCard label="Billups Share of PRINT" value={pct(k.print.eligibleShare)} accent="text-indigo-500" />
          <StatCard label="Billups-Print" value={money(k.print.eligibleBillups)} />
          <StatCard label="Print Channel" value={money(k.print.eligibleChannel)} />
          <StatCard label="Missed Opportunity (Print)" value={money(k.print.eligibleMissed)} accent="text-red-500" />

          <StatCard label="Billups Share of OOH+PRINT" value={pct(k.combined.share)} accent="text-indigo-500" />
          <StatCard label="Billups (OOH+Print)" value={money(k.combined.billups)} />
          <StatCard label="OOH+PRINT" value={money(k.combined.channel)} />
          <StatCard label="Missed Opportunity (Eligible $)" value={money(k.combined.missed)} accent="text-red-500" />
        </CardGrid>
      </Band>

      <Band label="Non Eligible Clients">
        <CardGrid>
          <StatCard label="OOH Channel" value={money(k.ooh.nonEligibleChannel)} />
          <StatCard label="Print Channel" value={money(k.print.nonEligibleChannel)} />
        </CardGrid>
      </Band>
    </div>
  );
}

/** Forecast "Billups Forecast" card set. */
function ForecastCards({ k }: { k: BillupsKpis }) {
  return (
    <div className="space-y-6">
      <Band label="Eligible Clients Only">
        <CardGrid>
          <StatCard label="Billups-OOH" value={money(k.ooh.eligibleBillups)} />
          <StatCard label="% Billups-OOH Share OOH" value={pct(k.ooh.eligibleShare)} accent="text-indigo-500" />
          <StatCard label="Billups-Print" value={money(k.print.eligibleBillups)} />
          <StatCard label="% Billups-PRINT Share PRINT" value={pct(k.print.eligibleShare)} accent="text-indigo-500" />
          <StatCard label="Billups" value={money(k.combined.billups)} />
          <StatCard label="OOH Channel" value={money(k.ooh.eligibleChannel)} />
          <StatCard label="Print Channel" value={money(k.print.eligibleChannel)} />
          <StatCard label="% Billups Share OOH+PRINT" value={pct(k.combined.share, 2)} accent="text-indigo-500" />
          <StatCard label="OOH+PRINT" value={money(k.combined.channel)} />
        </CardGrid>
      </Band>

      <Band label="Non Eligible Clients">
        <CardGrid>
          <StatCard label="OOH Channel" value={money(k.ooh.nonEligibleChannel)} />
          <StatCard label="Print Channel" value={money(k.print.nonEligibleChannel)} />
        </CardGrid>
      </Band>

      <Band label="Print Spends with no Billups">
        <CardGrid>
          <StatCard label="Print Spends with no Billups" value={money(k.printSpendsWithNoBillups)} />
        </CardGrid>
      </Band>
    </div>
  );
}

// ─── Source toggle ────────────────────────────────────────────────────────────

function SourceToggle({
  source,
  onChange,
}: {
  source: BillupsSource;
  onChange: (s: BillupsSource) => void;
}) {
  const opt = (value: BillupsSource, label: string) => {
    const active = source === value;
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className={`px-3 py-1.5 text-sm font-medium ${
          active
            ? "bg-gray-900 text-white"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="inline-flex border border-border">
      {opt("mir", "MIR — Booked to date")}
      {opt("forecast", "Forecast")}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export default function BillupsSection({
  forecastData,
  comparisonData,
  clients,
  usersMap,
  scopedClientIds,
  year,
  rfqLabel,
}: {
  /** The page's forecast scope data (dashboard scope, currency already applied). */
  forecastData: ScopeForecastData;
  /** Comparison scope — only needed to satisfy computeClientTable; variances unused. */
  comparisonData: ScopeForecastData;
  /** Test-filtered accessible clients (for GM Pod + eligibility resolution). */
  clients: Client[];
  /** UID → display name, for the forecast Business Lead column. */
  usersMap: Map<string, string>;
  /** The dashboard's current client scope (drives both sources). */
  scopedClientIds: string[];
  /** Selected year (non-null; the page passes a fallback). */
  year: number;
  /** Optional RFQ label for the Forecast caption (e.g. "RFQ2"). */
  rfqLabel?: string;
}) {
  const [source, setSource] = useState<BillupsSource>("mir");

  // ── MIR source: fetch + narrow to the dashboard scope ──────────────────────
  const mir = useBillupsMirRows();
  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const mirRows = useMemo(
    () => mir.rows.filter((r) => scopeSet.has(r.clientId)),
    [mir.rows, scopeSet]
  );

  // ── Forecast source: LABS partner eligibility + GM Pod, then map ───────────
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

  const forecastClientRows = useMemo(
    () =>
      computeClientTable(
        forecastData,
        comparisonData,
        clients,
        usersMap,
        year,
        scopedClientIds
      ),
    [forecastData, comparisonData, clients, usersMap, year, scopedClientIds]
  );

  const forecastRows = useMemo(
    () => mapForecastRowsToBillups(forecastClientRows, eligibilityById, gmPodById),
    [forecastClientRows, eligibilityById, gmPodById]
  );

  // ── Active source ──────────────────────────────────────────────────────────
  const rows = source === "mir" ? mirRows : forecastRows;
  const kpis = useMemo(() => computeBillupsKpis(rows), [rows]);

  const busy = source === "mir" ? mir.loading : forecastData.loading;
  const err = source === "mir" ? mir.error : forecastData.error;

  const title = source === "mir" ? "Billups — Booked to Date" : "Billups — Forecast";
  const caption =
    source === "mir"
      ? "MediaOcean MIR — booked to date"
      : `MediaBox Forecaster — BL submission${rfqLabel ? `, ${rfqLabel}` : ""}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Gauge size={18} className="text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {caption} · {rows.length} clients
            </p>
          </div>
        </div>
        <SourceToggle source={source} onChange={setSource} />
      </div>

      {source === "forecast" && !forecastData.hasContext ? (
        <div className="flex h-40 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
          Select a Year and RFQ to see the forecast.
        </div>
      ) : busy ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : err ? (
        <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          {err}
        </div>
      ) : (
        <>
          <div data-scroll-section data-scroll-label="Billups KPIs">
            {source === "mir" ? <MirCards k={kpis} /> : <ForecastCards k={kpis} />}
          </div>

          <div data-scroll-section data-scroll-label="Client detail">
            <ChartCard title="Client detail" subtitle={`${rows.length} clients`}>
              <BillupsTable rows={rows} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
