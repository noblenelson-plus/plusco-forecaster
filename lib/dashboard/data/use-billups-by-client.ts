// filepath: lib/dashboard/data/use-billups-by-client.ts
"use client";

/**
 * Billups data module — the single per-client contract behind the Executive
 * KPIs → Billups page, fed from EITHER of two sources the app already loads:
 *
 *   1) "mir"      — booked-to-date actuals. Reads the `mo_kpi_by_client`
 *                   Firestore collection (synced from BigQuery's
 *                   KPI_BY_CLIENT_2025_vs_2026 by scripts/sync-kpi-by-client.mjs),
 *                   which already carries per-client Billups spend, channel
 *                   totals and eligibility. Fetched here via useBillupsMirRows().
 *
 *   2) "forecast" — the MediaBox Forecaster (BL submission) basis. Comes from the
 *                   app's forecast model (use-scope-forecast-data →
 *                   computeClientTable). The section builds those rows with the
 *                   page's scope and passes them to mapForecastRowsToBillups()
 *                   together with the resolved Billups eligibility + GM Pod.
 *
 * Both sources are normalised to BillupsClientRow, then filtered and rolled up by
 * the SAME source-agnostic helpers. Following the discipline in the sibling
 * MediaOcean modules, the heavy business logic is NOT re-derived here: every
 * portfolio percentage is sum(numerator) / sum(denominator) across the rows,
 * never an average of per-client percentages.
 *
 * This file intentionally imports nothing from `components/` so the data layer
 * stays self-contained. The forecast mapper accepts a structural input type
 * (ForecastBillupsInput) that ClientTableRow already satisfies.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

// ─── Source + unified row shape ───────────────────────────────────────────────

export type BillupsSource = "mir" | "forecast";

/**
 * One client, normalised across both sources. Spend/channel figures are annual
 * dollars; eligibility is a resolved boolean per channel (the eligible /
 * non-eligible split on the cards keys off these two flags independently — a
 * client can be OOH-eligible but Print-N/A, exactly like the Looker report).
 */
export interface BillupsClientRow {
  clientId: string;
  clientName: string;
  agency: string;
  buRegion: string;
  businessLead: string;
  gmPod: string;
  clientStatus: string;

  eligibleOoh: boolean;
  eligiblePrint: boolean;

  billupsOoh: number;
  oohTotal: number;
  billupsPrint: number;
  printTotal: number;
}

// ─── Small pure helpers ───────────────────────────────────────────────────────

/** Coerce any value to a finite number (missing/null/NaN → 0). */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Ratio that returns null when the denominator is zero (renders as "—"). */
function safeDiv(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

/** Trim + read any value as a lowercase string ("" when missing). */
function textLower(v: unknown): string {
  return (v ?? "").toString().trim().toLowerCase();
}

/**
 * Normalise a roster eligibility string to a boolean.
 *
 * Mirrors the Native_Forecast_Clients build, where a BLANK value defaults to
 * eligible ('Yes'). So a client is treated as NOT eligible only when the value
 * is an explicit negative ("N/A" / "No" / "Not eligible"); anything else,
 * including blank or "Yes", is eligible.
 *
 * NOTE (confirm in QA): this single rule drives the entire eligible /
 * non-eligible split. Reconcile it against the Looker "Non Eligible Clients"
 * figures (e.g. MIR OOH Channel = $45,000) before management review.
 */
function parseEligible(v: unknown): boolean {
  const s = textLower(v);
  return !(s === "n/a" || s === "no" || s === "not eligible");
}

// ─── MIR source: read `mo_kpi_by_client` ──────────────────────────────────────

const MIR_COLLECTION = "mo_kpi_by_client";

// Candidate keys for the per-client status column on the synced MIR docs. The
// sync copies KPI_BY_CLIENT_2025_vs_2026 verbatim, so the exact header can vary;
// the first non-empty match wins, else "".
const MIR_STATUS_KEYS = [
  "CLIENT_STATUS_IN_2026",
  "CLIENT_STATUS",
  "client_status_2026",
  "Client_Status_2026",
];

/** Read the first non-empty string among the given keys of a raw doc. */
function firstText(doc: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const s = (doc[k] ?? "").toString().trim();
    if (s !== "") return s;
  }
  return "";
}

export interface BillupsRowsResult {
  rows: BillupsClientRow[];
  loading: boolean;
  error: string | null;
}

/**
 * One-shot read of the whole `mo_kpi_by_client` collection (~163 docs), mapped
 * to BillupsClientRow. Small enough to load in full and filter/roll-up in
 * memory, which keeps the page filters instant.
 */
export function useBillupsMirRows(): BillupsRowsResult {
  const [rows, setRows] = useState<BillupsClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(collection(db, MIR_COLLECTION));
        if (cancelled) return;

        const out: BillupsClientRow[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            clientId: d.id,
            clientName: (raw["CLIENT_NAME"] ?? d.id).toString(),
            agency: (raw["AGENCY"] ?? "").toString().trim(),
            buRegion: (raw["BU_REGION"] ?? "").toString().trim(),
            businessLead: (raw["BUSINESS_LEAD"] ?? "").toString().trim(),
            gmPod: (raw["GM_POD"] ?? "").toString().trim(),
            clientStatus: firstText(raw, MIR_STATUS_KEYS),

            eligibleOoh: parseEligible(raw["eligible_billups_ooh"]),
            eligiblePrint: parseEligible(raw["eligible_billups_print"]),

            billupsOoh: num(raw["billups_ooh_spend_2026"]),
            oohTotal: num(raw["ooh_spend_2026"]),
            billupsPrint: num(raw["billups_print_spend_2026"]),
            printTotal: num(raw["print_spend_2026"]),
          };
        });

        setRows(out);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load Billups (MIR) data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error };
}

// ─── Forecast source: map the app's forecast client rows ──────────────────────

/**
 * Structural shape the forecast mapper needs. `ClientTableRow`
 * (components/forecaster/sections/client-table-data.ts) already satisfies this,
 * so the section can pass its computeClientTable() output straight in — no
 * components import required from the data layer.
 */
export interface ForecastBillupsInput {
  clientId: string;
  name: string;
  businessLead: string;
  agency: string;
  region: string;
  status: string;
  billupsOohSpend: number;
  billupsPrintSpend: number;
  oohMedia: number;
  printMedia: number;
}

/** Resolved Billups eligibility for a client (from the LABS eligibility map). */
export interface BillupsEligibility {
  ooh: boolean;
  print: boolean;
}

/**
 * Map the app's forecast per-client rows to BillupsClientRow.
 *
 * `ClientTableRow` carries the spend/channel figures and most dimensions but not
 * GM Pod or Billups eligibility, so the section supplies those keyed by
 * clientId: `eligibilityById` from the resolved LABS partners (Billups-OOH /
 * Billups-Print) via isEligibleForPartner, and `gmPodById` from the Client
 * records. Missing entries default to eligible (matching parseEligible's blank
 * rule) and an empty GM Pod.
 */
export function mapForecastRowsToBillups(
  rows: ForecastBillupsInput[],
  eligibilityById: Map<string, BillupsEligibility>,
  gmPodById: Map<string, string>
): BillupsClientRow[] {
  return rows.map((r) => {
    const elig = eligibilityById.get(r.clientId);
    return {
      clientId: r.clientId,
      clientName: r.name,
      agency: (r.agency ?? "").toString().trim(),
      buRegion: (r.region ?? "").toString().trim(),
      businessLead: (r.businessLead ?? "").toString().trim(),
      gmPod: (gmPodById.get(r.clientId) ?? "").toString().trim(),
      clientStatus: (r.status ?? "").toString().trim(),

      eligibleOoh: elig ? elig.ooh : true,
      eligiblePrint: elig ? elig.print : true,

      billupsOoh: num(r.billupsOohSpend),
      oohTotal: num(r.oohMedia),
      billupsPrint: num(r.billupsPrintSpend),
      printTotal: num(r.printMedia),
    };
  });
}

// ─── Filters (source-agnostic) ────────────────────────────────────────────────

export interface BillupsFilters {
  agency: string[];
  buRegion: string[];
  businessLead: string[];
  gmPod: string[];
  client: string[];
  status: string[];
}

export const EMPTY_BILLUPS_FILTERS: BillupsFilters = {
  agency: [],
  buRegion: [],
  businessLead: [],
  gmPod: [],
  client: [],
  status: [],
};

export type BillupsFilterOptions = BillupsFilters;

/** Distinct, sorted, non-empty option lists for each filter, read from the rows. */
export function billupsFilterOptions(
  rows: BillupsClientRow[]
): BillupsFilterOptions {
  const uniq = (values: (string | null | undefined)[]): string[] => {
    const set = new Set<string>();
    for (const v of values) {
      const s = (v ?? "").toString().trim();
      if (s !== "") set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  return {
    agency: uniq(rows.map((r) => r.agency)),
    buRegion: uniq(rows.map((r) => r.buRegion)),
    businessLead: uniq(rows.map((r) => r.businessLead)),
    gmPod: uniq(rows.map((r) => r.gmPod)),
    client: uniq(rows.map((r) => r.clientName)),
    status: uniq(rows.map((r) => r.clientStatus)),
  };
}

/** Rows kept when they match every active filter (an empty list = no filter). */
export function applyBillupsFilters(
  rows: BillupsClientRow[],
  f: BillupsFilters
): BillupsClientRow[] {
  const match = (
    selected: string[],
    value: string | null | undefined
  ): boolean =>
    selected.length === 0 ||
    selected.includes((value ?? "").toString().trim());

  return rows.filter(
    (r) =>
      match(f.agency, r.agency) &&
      match(f.buRegion, r.buRegion) &&
      match(f.businessLead, r.businessLead) &&
      match(f.gmPod, r.gmPod) &&
      match(f.client, r.clientName) &&
      match(f.status, r.clientStatus)
  );
}

// ─── Roll-up compute (source-agnostic) ────────────────────────────────────────

/** Per-channel Billups scorecards, split by eligibility cohort. */
export interface BillupsChannelKpis {
  /** Billups spend across clients ELIGIBLE for this channel. */
  eligibleBillups: number;
  /** Total channel spend across clients ELIGIBLE for this channel. */
  eligibleChannel: number;
  /** eligibleBillups ÷ eligibleChannel (null when the denominator is 0). */
  eligibleShare: number | null;
  /** eligibleChannel − eligibleBillups — the "Missed Opportunity". */
  eligibleMissed: number;
  /** Total channel spend across clients NOT eligible for this channel. */
  nonEligibleChannel: number;
}

export interface BillupsKpis {
  /** Clients contributing (after filters). */
  clientCount: number;
  ooh: BillupsChannelKpis;
  print: BillupsChannelKpis;
  /** OOH + Print combined, eligible cohorts summed. */
  combined: {
    billups: number;
    channel: number;
    share: number | null;
    missed: number;
  };
  /**
   * Print channel spend for eligible-Print clients that booked NO Billups-Print
   * (billupsPrint === 0). Surfaced only on the Forecast card set.
   */
  printSpendsWithNoBillups: number;
}

/**
 * Roll the given (already-filtered) rows up to the Billups scorecards. OOH and
 * Print cohorts are resolved independently by their own eligibility flag, so a
 * client can count toward the OOH cards but sit in the non-eligible Print bucket
 * (and vice versa). Every share is sum(numerator) / sum(denominator).
 */
export function computeBillupsKpis(rows: BillupsClientRow[]): BillupsKpis {
  let oohEligBillups = 0;
  let oohEligChannel = 0;
  let oohNonEligChannel = 0;

  let printEligBillups = 0;
  let printEligChannel = 0;
  let printNonEligChannel = 0;

  let printNoBillups = 0;

  for (const r of rows) {
    // OOH cohort
    if (r.eligibleOoh) {
      oohEligBillups += r.billupsOoh;
      oohEligChannel += r.oohTotal;
    } else {
      oohNonEligChannel += r.oohTotal;
    }

    // Print cohort
    if (r.eligiblePrint) {
      printEligBillups += r.billupsPrint;
      printEligChannel += r.printTotal;
      if (r.billupsPrint === 0) printNoBillups += r.printTotal;
    } else {
      printNonEligChannel += r.printTotal;
    }
  }

  const combinedBillups = oohEligBillups + printEligBillups;
  const combinedChannel = oohEligChannel + printEligChannel;

  return {
    clientCount: rows.length,
    ooh: {
      eligibleBillups: oohEligBillups,
      eligibleChannel: oohEligChannel,
      eligibleShare: safeDiv(oohEligBillups, oohEligChannel),
      eligibleMissed: oohEligChannel - oohEligBillups,
      nonEligibleChannel: oohNonEligChannel,
    },
    print: {
      eligibleBillups: printEligBillups,
      eligibleChannel: printEligChannel,
      eligibleShare: safeDiv(printEligBillups, printEligChannel),
      eligibleMissed: printEligChannel - printEligBillups,
      nonEligibleChannel: printNonEligChannel,
    },
    combined: {
      billups: combinedBillups,
      channel: combinedChannel,
      share: safeDiv(combinedBillups, combinedChannel),
      missed: combinedChannel - combinedBillups,
    },
    printSpendsWithNoBillups: printNoBillups,
  };
}