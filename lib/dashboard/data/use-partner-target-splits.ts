// lib/dashboard/data/use-partner-target-splits.ts
"use client";

/**
 * Loads everything the client split of the partner targets needs and runs it
 * (lib/format/partner-target-split.ts):
 *   - the year's Deal Targets (partner_targets/{year}), Labs deal types with a target;
 *   - the split round (the round before the year's open round) and every
 *     readable client's Labs forecast for it (data_entries, axes.labs), in CAD
 *     (USD clients × the year's USD → CAD rate);
 *   - MIR booked net by client × partner (investment_deals_mix, this year and last);
 *   - the admin overrides (partner_target_splits/{year}).
 * Shares are computed over every client the viewer can read; the page filters
 * the result by the dashboard filters.
 */

import { useEffect, useMemo, useState } from "react";
import { subscribeToPartnerTargets } from "../../services/partner-targets-service";
import { subscribeToRFQs } from "../../services/rfq-service";
import { subscribeToLabsPartners } from "../../services/labs-partner-service";
import { subscribeToCurrencyRates, getCurrencyRateForYear } from "../../services/currency-service";
import { subscribeToSplitOverrides, type SplitOverrides } from "../../services/partner-target-split-service";
import { fetchAxisData } from "../../services/data-entry-service";
import { useReadableClients } from "../../hooks/use-readable-clients";
import { useInvestmentDealsMix } from "./use-investment-deals-mix";
import { sumMonthlyMap } from "../../types/common.types";
import { isTestClient } from "../../format/client";
import {
  computePartnerSplits,
  partnerKey,
  splitRound,
  targetForLabsPartner,
  targetForMirRow,
  type PartnerSplit,
} from "../../format/partner-target-split";
import type { PartnerTargetsYear } from "../../types/partner-targets.types";
import type { RFQ, RFQType } from "../../types/rfq.types";
import { RFQ_TYPE_ORDER } from "../../types/rfq.types";
import type { LabsPartner } from "../../types/labs.types";
import type { CurrencyRate } from "../../types/currency.types";
import type { Client } from "../../types/client.types";

export interface PartnerTargetSplitsResult {
  splits: PartnerSplit[];
  /** Round the forecast shares come from, e.g. "RFQ3 2026" (the chosen one, else the latest submitted). */
  round: string | null;
  /** Id ("2026_RFQ3") of the round in use, and of the default (latest submitted) one. */
  roundId: string | null;
  defaultRoundId: string | null;
  /** Round picker options: last year's RFQ3 + FINAL, then this year's rounds up to the open one. */
  roundOptions: { id: string; label: string }[];
  /** The chosen round has no Labs forecast entered yet (e.g. a round that hasn't started). */
  forecastEmpty: boolean;
  clients: Client[];
  overrides: SplitOverrides;
  usdToCad: number | null;
  loading: boolean;
  error: string | null;
}

export function usePartnerTargetSplits(
  year: number | null,
  options: {
    /** Share basis (see computePartnerSplits); default "auto". */
    mode?: "auto" | "forecast" | "mir";
    /** Forecast round id ("2026_RFQ3") to use instead of the latest submitted one. */
    round?: string | null;
  } = {}
): PartnerTargetSplitsResult {
  const mode = options.mode ?? "auto";
  const [targetYears, setTargetYears] = useState<PartnerTargetsYear[] | null>(null);
  const [rfqs, setRfqs] = useState<RFQ[] | null>(null);
  const [labsPartners, setLabsPartners] = useState<LabsPartner[] | null>(null);
  const [rates, setRates] = useState<CurrencyRate[] | null>(null);
  const [overridesState, setOverridesState] = useState<{ year: number; overrides: SplitOverrides } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { clients: readable, loading: clientsLoading } = useReadableClients();
  const mix = useInvestmentDealsMix();
  // Only clients the dashboard shows take a share: readable clients minus test
  // clients (hidden ones are already left out). Others' MIR lines count as not
  // attributed, so no part of a target lands on a client nobody sees.
  const clients = useMemo(() => readable.filter((c) => !isTestClient(c.CL_Name)), [readable]);
  const shareClientIds = useMemo(() => new Set(clients.map((c) => c.cl_id)), [clients]);

  useEffect(() => subscribeToPartnerTargets(setTargetYears, (e) => setError(e.message)), []);
  useEffect(() => subscribeToRFQs(setRfqs, (e) => setError(e.message)), []);
  useEffect(() => subscribeToLabsPartners(setLabsPartners, (e) => setError(e.message)), []);
  useEffect(() => subscribeToCurrencyRates(setRates, (e) => setError(e.message)), []);
  useEffect(() => {
    if (year == null) return;
    return subscribeToSplitOverrides(year, (overrides) => setOverridesState({ year, overrides }), (e) => setError(e.message));
  }, [year]);

  const targets = useMemo(
    () =>
      (targetYears?.find((t) => t.year === year)?.partners ?? []).filter(
        (p) => p.dealType.startsWith("Labs") && (p.mediaSpendTarget ?? 0) > 0
      ),
    [targetYears, year]
  );
  const targetKeys = useMemo(() => new Set(targets.map((t) => partnerKey(t.partner))), [targets]);
  const defaultRoundId = useMemo(() => {
    const t = rfqs && year != null ? splitRound(rfqs, year) : null;
    return t ? `${year}_${t}` : null;
  }, [rfqs, year]);
  // Picker, consistent with the rest of the app: last year's RFQ3 and FINAL, then
  // this year's rounds up to the open one (later rounds haven't started).
  const roundOptions = useMemo(() => {
    if (!rfqs || year == null) return [];
    const ofYear = (y: number) => rfqs.filter((r) => r.year === y).sort((a, b) => RFQ_TYPE_ORDER[a.type] - RFQ_TYPE_ORDER[b.type]);
    const prev = ofYear(year - 1).filter((r) => r.type === "RFQ3" || r.type === "FINAL");
    const cur = ofYear(year);
    const open = cur.findIndex((r) => r.status === "UNLOCKED");
    const curShown = open < 0 ? cur : cur.slice(0, open + 1);
    return [...prev, ...curShown].map((r) => ({
      id: `${r.year}_${r.type}`,
      label: `${r.type} ${r.year}${r.status === "UNLOCKED" ? " (in progress)" : ""}`,
    }));
  }, [rfqs, year]);
  const roundId = options.round && roundOptions.some((o) => o.id === options.round) ? options.round : defaultRoundId;
  const [roundYearStr, roundType] = (roundId ?? "").split("_") as [string, RFQType | undefined];
  const roundYear = roundYearStr ? Number(roundYearStr) : null;
  const round = roundId ? `${roundType} ${roundYear}` : null;
  const usdToCad = rates && roundYear != null ? getCurrencyRateForYear(rates, roundYear) ?? null : null;

  // Labs partner id → target partner key (partners of the round's year: ids differ by year).
  const partnerTarget = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of labsPartners ?? []) {
      if (p.year !== roundYear) continue;
      const k = targetForLabsPartner(p.name, targetKeys);
      if (k) m.set(p.partnerId, k);
    }
    return m;
  }, [labsPartners, roundYear, targetKeys]);

  // Forecast per client × target partner (CAD), fetched per split round.
  const fetchKey = roundYear != null && roundType && !clientsLoading && labsPartners && rates ? `${roundId}|${clients.map((c) => c.cl_id).join(",")}|${usdToCad}` : "";
  const [forecastState, setForecastState] = useState<{ key: string; forecast: Map<string, Map<string, number>> } | null>(null);
  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const out = new Map<string, Map<string, number>>();
        await Promise.all(
          clients.map(async (c) => {
            const labs = await fetchAxisData(c.cl_id, roundYear!, roundType!, "labs");
            const factor = c.CL_Currency === "USD" ? usdToCad ?? 1 : 1;
            const byPartner = new Map<string, number>();
            for (const bucket of labs.buckets) {
              for (const row of bucket.rows) {
                const k = partnerTarget.get(row.rowType);
                if (!k) continue;
                byPartner.set(k, (byPartner.get(k) ?? 0) + sumMonthlyMap(row.months) * factor);
              }
            }
            if (byPartner.size) out.set(c.cl_id, byPartner);
          })
        );
        if (!cancelled) setForecastState({ key: fetchKey, forecast: out });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the Labs forecast.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // fetchKey covers year, round, clients and the rate; partnerTarget follows labsPartners + targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, partnerTarget]);

  // MIR booked: year → target partner key → client id ("" = not a Forecaster client).
  const mir = useMemo(() => {
    const out = new Map<string, Map<string, Map<string, number>>>();
    for (const r of mix.rows) {
      const k = targetForMirRow(r.PLUSCO_MEDIA_PARTNER, r.PLUSCO_MEDIA_CHANNEL, targetKeys);
      if (!k) continue;
      const y = String(r.PLUSCO_YEAR);
      let byKey = out.get(y);
      if (!byKey) out.set(y, (byKey = new Map()));
      let byClient = byKey.get(k);
      if (!byClient) byKey.set(k, (byClient = new Map()));
      const id = r._clientId && shareClientIds.has(r._clientId) ? r._clientId : "";
      byClient.set(id, (byClient.get(id) ?? 0) + (Number(r.NET_ORDERED_CAD) || 0));
    }
    return out;
  }, [mix.rows, targetKeys, shareClientIds]);

  const overrides = overridesState && overridesState.year === year ? overridesState.overrides : null;
  const forecast = forecastState && forecastState.key === fetchKey ? forecastState.forecast : null;
  const loading = !targetYears || !rfqs || !labsPartners || !rates || clientsLoading || mix.loading || !overrides || (!!fetchKey && !forecast);

  const splits = useMemo(
    () =>
      year == null || loading || !forecast || !overrides
        ? []
        : computePartnerSplits({
            year,
            // Forecaster tab: only the partners in the Labs Forecaster 2.0.
            targets: mode === "forecast" ? targets.filter((t) => t.inLabsForecaster2) : targets,
            forecast,
            mir,
            overrides,
            mode,
          }),
    [year, loading, targets, forecast, mir, overrides, mode]
  );

  return {
    splits,
    round,
    roundId,
    defaultRoundId,
    roundOptions,
    forecastEmpty: !!forecast && forecast.size === 0,
    clients,
    overrides: overrides ?? {},
    usdToCad,
    loading,
    error: error ?? mix.error,
  };
}
