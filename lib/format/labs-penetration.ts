// lib/format/labs-penetration.ts

/**
 * Labs penetration — how much of each media type's planned budget the Labs
 * partners cover, in the same submission.
 *
 * Labs grid rows are keyed by partner id, so each partner's spend is summed
 * across projects and attributed to its media type, then compared to the planned
 * Media BL spend for that type (Media rows are keyed by media type directly).
 * A media type is "over" when its partners together cover more than 100% of the
 * planned budget. A global Labs/Media ratio is also returned against a 25% goal.
 *
 * Only BL_INPUT is considered on both sides — this is about the plan, not the
 * MediaOcean actuals.
 */

import {
  MONTHS,
  MEDIA_TYPES,
  type MonthlyMap,
  type MediaType,
} from "../types/common.types";
import {
  aggregateByType,
  emptyMonthly,
  type AxisData,
} from "../types/forecaster.types";
import type { LabsPartner } from "../types/labs.types";

/** Labs/Media spend goal. */
export const LABS_RATIO_TARGET = 0.25;

export interface PartnerPenetration {
  partnerId: string;
  name: string;
  description?: string;
  /** Partner's annual Labs spend on its media type (summed across projects). */
  annual: number;
  /** annual / plannedAnnual — null when nothing is planned, Infinity when the
   *  partner spends against a 0 plan. */
  coverage: number | null;
}

export interface MediaTypePenetration {
  mediaType: MediaType;
  /** Planned media (BL) for this type, per month — drives the % → $ resolution. */
  plannedMonths: MonthlyMap;
  plannedAnnual: number;
  labsAnnual: number;
  /** labsAnnual / plannedAnnual (null/Infinity as above). */
  coverage: number | null;
  /** Partners together cover more than 100% of the planned budget. */
  over: boolean;
  /** Partners of this type (configured for the year), busiest first. */
  partners: PartnerPenetration[];
}

export interface LabsPenetrationResult {
  /** Types with at least one partner or some planned budget, in MEDIA_TYPES order. */
  byType: MediaTypePenetration[];
  totalLabs: number;
  totalPlanned: number;
  /** totalLabs / totalPlanned — null when nothing is planned. */
  ratio: number | null;
  targetRatio: number;
  hasOver: boolean;
}

function annual(map: MonthlyMap): number {
  return MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);
}

function coverageOf(part: number, whole: number): number | null {
  if (whole > 0) return part / whole;
  return part > 0 ? Infinity : null;
}

export function computeLabsPenetration(
  labsData: AxisData,
  mediaData: AxisData,
  partnersForYear: LabsPartner[]
): LabsPenetrationResult {
  // Labs BL spend per partner id, summed across projects.
  const labsByPartner = new Map<string, number>();
  for (const bucket of labsData.buckets) {
    for (const row of bucket.rows) {
      labsByPartner.set(
        row.rowType,
        (labsByPartner.get(row.rowType) ?? 0) + annual(row.months)
      );
    }
  }

  // Planned media (BL) per type — Media rows are keyed by media type.
  const plannedByType = aggregateByType(mediaData, "BL_INPUT");

  // Configured partners grouped by their media type.
  const partnersByType = new Map<MediaType, PartnerPenetration[]>();
  for (const p of partnersForYear) {
    const list = partnersByType.get(p.mediaType) ?? [];
    list.push({
      partnerId: p.partnerId,
      name: p.name,
      description: p.description,
      annual: labsByPartner.get(p.partnerId) ?? 0,
      coverage: null,
    });
    partnersByType.set(p.mediaType, list);
  }

  const byType: MediaTypePenetration[] = [];
  for (const mediaType of MEDIA_TYPES) {
    const plannedMonths = plannedByType[mediaType] ?? emptyMonthly();
    const plannedAnnual = annual(plannedMonths);
    const partners = (partnersByType.get(mediaType) ?? []).sort(
      (a, b) => b.annual - a.annual
    );
    // Nothing planned and no partner to place — skip the type entirely.
    if (partners.length === 0 && plannedAnnual === 0) continue;

    for (const p of partners) p.coverage = coverageOf(p.annual, plannedAnnual);
    const labsAnnual = partners.reduce((acc, p) => acc + p.annual, 0);
    const coverage = coverageOf(labsAnnual, plannedAnnual);

    byType.push({
      mediaType,
      plannedMonths,
      plannedAnnual,
      labsAnnual,
      coverage,
      over: coverage !== null && coverage > 1,
      partners,
    });
  }

  // Global ratio — all Labs spend (incl. unknown/removed partners) vs all media.
  const totalLabs = [...labsByPartner.values()].reduce((a, b) => a + b, 0);
  const totalPlanned = Object.values(plannedByType).reduce(
    (acc, m) => acc + annual(m),
    0
  );

  return {
    byType,
    totalLabs,
    totalPlanned,
    ratio: totalPlanned > 0 ? totalLabs / totalPlanned : null,
    targetRatio: LABS_RATIO_TARGET,
    hasOver: byType.some((t) => t.over),
  };
}
