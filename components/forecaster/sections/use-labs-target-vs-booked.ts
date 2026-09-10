// components/forecaster/sections/use-labs-target-vs-booked.ts
"use client";

/**
 * Wiring hook for the Labs "Target vs Booked by Partner" exec-KPI table.
 * Composes the three live sources and hands them to the pure compute function
 * in ./labs-target-vs-booked-data:
 *
 *   A–D + flag  partner_targets/{year}            (subscribeToPartnerTargets)
 *   E (RFQ2)    labs pacing RFQ2-BL target         (useScopeLabsPacing → computeLabsPacing)
 *   F (booked)  MediaOcean MIR net per partner     (useMediaoceanInvestmentMix, scoped)
 *   I (total)   MIR total media, channels ≠ N/A    (computeTotalMediaInvestment, inside step 1)
 *
 * Scope: booked (F) and total media (I) are scoped by YEAR + selected MONTHS only
 * (the Time & Context selector) — matching the deck's fixed annual/MTD MIR total.
 * They are NOT client/pod-scoped here; if we later need that, it needs a
 * clientId → PLUSCO_CLIENT_NAME map and is a follow-up. The RFQ2 target (E) IS
 * client-scoped, because it flows through the existing pacing hook.
 *
 * Currency: D and MIR F are CAD (the admin target is "CAD"; NET_ORDERED_CAD is
 * CAD). E flows through pacing's currency conversion. View the table in CAD to
 * keep the three columns consistent.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useMediaoceanInvestmentMix,
  isDealValue,
  type MediaInvestmentRow,
} from "../../../lib/dashboard/data/use-mediaocean-investment-mix";
import { useScopeLabsPacing } from "../../../lib/dashboard/data/use-scope-labs-pacing";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import { subscribeToPartnerTargets } from "../../../lib/services/partner-targets-service";
import { computeLabsPacing } from "./labs-pacing-data";
import {
    computeLabsTargetVsBooked,
  DEFAULT_ROLLUP,
  type LabsTargetVsBookedResult,
} from "./labs-target-vs-booked-data";
import type {
  DealType,
  PartnerTarget,
  PartnerTargetsYear,
} from "../../../lib/types/partner-targets.types";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { RFQType } from "../../../lib/types/rfq.types";
import type { Currency } from "../../../lib/types/client.types";

// ─── Params / result ──────────────────────────────────────────────────────────

export interface UseLabsTargetVsBookedParams {
  /** Selected year — drives targets, MIR scope, and pacing. */
  year: number | null;
  /** Selected RFQ — passed to the pacing hook for the RFQ2-BL target read. */
  rfq: RFQType | null;
  /** Selected months (1–12); empty = whole year. Scopes booked + total media. */
  selMonths: number[];
  /** In-scope client ids — used by the pacing (RFQ2 target) read only. */
  scopedClientIds: string[];
  /** clientId → currency, for the pacing currency conversion. */
  currencyByClient: Record<string, Currency>;
  /** clientId → GM pod label, for the pacing read. */
  gmPodByClient: Record<string, string>;
  /** USD→CAD rate for the pacing conversion (undefined/1 in a CAD view). */
  usdToCad?: number;
  /** Deal types to include; defaults to the deck view (Labs + Labs - BRP). */
  dealTypeFilter?: DealType[];
  /** Optional allow-list of display (post roll-up) partner names. */
  partnerFilter?: string[];
  /** Roll-up map override (raw name → display name). Defaults to Billups/MIQ. */
  rollupMap?: Record<string, string>;
  /** When true, F counts only "Partner Deal" MIR rows; default false (all net). */
  onlyPartnerDeal?: boolean;
}

export interface UseLabsTargetVsBookedResult extends LabsTargetVsBookedResult {
  loading: boolean;
  /** Every partner in the Labs Targets roster (all deal types, rolled up). */
  rosterPartners: string[];
}

// ─── Month parsing (MIR MONTH / MONTH_DATE may be a name, number, or date) ─────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Row's month 1–12, matching the app's canonical parser (MONTH_DATE first). */
function monthOf(r: MediaInvestmentRow): number | null {
  if (r.MONTH_DATE) {
    const d = new Date(r.MONTH_DATE);
    if (!Number.isNaN(d.getTime())) return d.getUTCMonth() + 1;
  }
  const n = Number(r.MONTH);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const idx = MONTH_NAMES.indexOf(String(r.MONTH ?? "").trim().toLowerCase());
  return idx >= 0 ? idx + 1 : null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLabsTargetVsBooked(
  params: UseLabsTargetVsBookedParams
): UseLabsTargetVsBookedResult {
  const {
    year,
    rfq,
    selMonths,
    scopedClientIds,
    currencyByClient,
    gmPodByClient,
    usdToCad,
    dealTypeFilter,
    partnerFilter,
    rollupMap,
    onlyPartnerDeal,
  } = params;

  // 1) Partner targets (A–D + the forecaster flag), one doc per year.
  const [targetYears, setTargetYears] = useState<PartnerTargetsYear[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  useEffect(() => {
    const unsubscribe = subscribeToPartnerTargets(
      (years) => {
        setTargetYears(years);
        setTargetsLoading(false);
      },
      () => setTargetsLoading(false)
    );
    return () => unsubscribe();
  }, []);

    const targetsForYear: PartnerTarget[] = useMemo(
    () =>
      year !== null
        ? targetYears.find((y) => y.year === year)?.partners ?? []
        : [],
    [targetYears, year]
  );

  // Every roster partner (all deal types, rolled up) — drives the partner
  // filter so it stays complete as Labs Targets grows.
  const rosterPartners = useMemo(() => {
    const roll = rollupMap ?? DEFAULT_ROLLUP;
    const names = new Set<string>();
    for (const t of targetsForYear) names.add(roll[t.partner] ?? t.partner);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [targetsForYear, rollupMap]);

  // 2) Labs partners (for the pacing partnerId → name resolution).
  const [labsPartners, setLabsPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setLabsPartners);
    return () => unsubscribe();
  }, []);

  const yearPartners = useMemo(
    () => (year !== null ? getLabsPartnersForYear(labsPartners, year) : []),
    [labsPartners, year]
  );

  // 3) RFQ2-BL target per partner NAME (col E), via the existing pacing read.
  const { cells, loading: pacingLoading } = useScopeLabsPacing({
    scopedClientIds,
    year,
    rfq,
    currencyByClient,
    gmPodByClient,
    usdToCad,
    selMonths,
  });

  const rfq2TargetByPartner = useMemo(() => {
    const { rows } = computeLabsPacing(cells, yearPartners);
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.partnerName, row.target);
    return map;
  }, [cells, yearPartners]);

  // 4) MIR rows → booked per partner (col F) + total media (col I), scoped by
  //    year + months only.
  const { rows: mirAll, loading: mixLoading } = useMediaoceanInvestmentMix();

  const yearStr = year !== null ? String(year) : null;
  const monthsKey = selMonths.join(",");

  const mirScoped = useMemo(() => {
    if (yearStr === null) return [];
    const monthSet = new Set(selMonths);
    return mirAll.filter((r) => {
      if ((r.PLUSCO_YEAR ?? "").toString().trim() !== yearStr) return false;
      if (monthSet.size === 0) return true;
            const m = monthOf(r);
      return m !== null && monthSet.has(m);
    });
    // monthsKey stands in for selMonths in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirAll, yearStr, monthsKey]);

  const bookedByPartner = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mirScoped) {
      if (onlyPartnerDeal && !isDealValue(r.PLUSCO_2026_DEALS)) continue;
      const partner = (r.PLUSCO_MEDIA_PARTNER ?? "").toString().trim();
      if (partner === "") continue;
      const net = Number(r.NET_ORDERED_CAD) || 0;
      map.set(partner, (map.get(partner) ?? 0) + net);
    }
    return map;
  }, [mirScoped, onlyPartnerDeal]);

  // 5) Compose everything through the pure step-1 function.
  const dealTypeKey = (dealTypeFilter ?? []).join("|");
  const partnerKey = (partnerFilter ?? []).join("|");

  const result = useMemo(
    () =>
      computeLabsTargetVsBooked({
        targets: targetsForYear,
        bookedByPartner,
        rfq2TargetByPartner,
        mirRows: mirScoped,
        dealTypeFilter,
        partnerFilter,
        rollupMap,
      }),
    // dealTypeKey / partnerKey stand in for the array identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      targetsForYear,
      bookedByPartner,
      rfq2TargetByPartner,
      mirScoped,
      dealTypeKey,
      partnerKey,
      rollupMap,
    ]
  );

  const loading = targetsLoading || pacingLoading || mixLoading;

    return { ...result, loading, rosterPartners };
}