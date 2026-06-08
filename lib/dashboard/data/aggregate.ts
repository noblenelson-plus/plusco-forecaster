// lib/dashboard/data/aggregate.ts

/**
 * Pure aggregation helpers for the dashboard tabs. They turn raw (already
 * scope-merged) AxisData into the breakdowns the charts consume — by media
 * channel, by revenue stream, monthly trends, digital vs traditional split.
 *
 * Firebase-free and side-effect-free: the hook does the fetching/merging, these
 * just reshape, so they're trivially testable and reusable.
 */

import {
  MONTHS,
  MEDIA_TYPES,
  sumMonthlyMap,
  type MediaType,
  type MonthlyMap,
} from "../../types/common.types";
import {
  aggregateByType,
  emptyMonthly,
  MEDIA_TYPE_LABELS,
  type AxisData,
} from "../../types/forecaster.types";
import {
  MEDIA_TYPE_COLORS,
  REVENUE_STREAM_COLORS,
} from "../../../components/dashboard/charts/colors";

/** Channels considered "digital" — drives the digital-share metrics. */
export const DIGITAL_MEDIA_TYPES: MediaType[] = [
  "sem",
  "social",
  "programmatic",
  "digitalDirect",
];

function isDigital(type: MediaType): boolean {
  return DIGITAL_MEDIA_TYPES.includes(type);
}

/**
 * One in-scope client's BL media spend, broken down by media type then month.
 * `byType` is keyed by the MediaType value (e.g. "social"); a type the client
 * never planned is simply absent. Consumed by the per-client data table.
 */
export interface ClientMediaBreakdown {
  clientId: string;
  byType: Record<string, MonthlyMap>;
}

/** Concatenate many clients' AxisData into one — downstream helpers sum rows. */
export function mergeAxisData(list: AxisData[]): AxisData {
  return {
    buckets: list.flatMap((d) => d.buckets),
    actuals: list.flatMap((d) => d.actuals),
  };
}

function addInto(target: MonthlyMap, source: MonthlyMap): void {
  for (const m of MONTHS) target[m] += source[m] ?? 0;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface ChannelSlice {
  mediaType: MediaType;
  label: string;
  color: string;
  annual: number;
  digital: boolean;
}

export interface MediaBreakdown {
  /** Per channel, in MEDIA_TYPES order. */
  byChannel: ChannelSlice[];
  /** Total media (BL) per month. */
  monthly: MonthlyMap;
  digitalMonthly: MonthlyMap;
  traditionalMonthly: MonthlyMap;
  totalAnnual: number;
  digitalAnnual: number;
  traditionalAnnual: number;
  /** digitalAnnual / totalAnnual — null when nothing is planned. */
  digitalShare: number | null;
}

export function computeMediaBreakdown(media: AxisData): MediaBreakdown {
  const byType = aggregateByType(media, "BL_INPUT");
  const monthly = emptyMonthly();
  const digitalMonthly = emptyMonthly();
  const traditionalMonthly = emptyMonthly();

  const byChannel: ChannelSlice[] = MEDIA_TYPES.map((mt) => {
    const months = byType[mt] ?? emptyMonthly();
    addInto(monthly, months);
    if (isDigital(mt)) addInto(digitalMonthly, months);
    else addInto(traditionalMonthly, months);
    return {
      mediaType: mt,
      label: MEDIA_TYPE_LABELS[mt],
      color: MEDIA_TYPE_COLORS[mt],
      annual: sumMonthlyMap(months),
      digital: isDigital(mt),
    };
  });

  const totalAnnual = sumMonthlyMap(monthly);
  const digitalAnnual = sumMonthlyMap(digitalMonthly);
  const traditionalAnnual = sumMonthlyMap(traditionalMonthly);

  return {
    byChannel,
    monthly,
    digitalMonthly,
    traditionalMonthly,
    totalAnnual,
    digitalAnnual,
    traditionalAnnual,
    digitalShare: totalAnnual > 0 ? digitalAnnual / totalAnnual : null,
  };
}

// ─── Revenue ─────────────────────────────────────────────────────────────────

const REVENUE_STREAMS: { key: string; label: string }[] = [
  { key: "retainer", label: "Retainer" },
  { key: "commission", label: "Commission" },
  { key: "projectFees", label: "Project Fees" },
  { key: "productFees", label: "Product Fees" },
];

export interface StreamSlice {
  key: string;
  label: string;
  color: string;
  annual: number;
}

export interface RevenueBreakdown {
  byStream: StreamSlice[];
  monthly: MonthlyMap;
  totalAnnual: number;
}

export function computeRevenueBreakdown(revenue: AxisData): RevenueBreakdown {
  const byType = aggregateByType(revenue, "BL_INPUT");
  const monthly = emptyMonthly();
  // Sum every stored stream (known or not) into the monthly total.
  for (const months of Object.values(byType)) addInto(monthly, months);

  const byStream: StreamSlice[] = REVENUE_STREAMS.map((s, i) => ({
    key: s.key,
    label: s.label,
    color: REVENUE_STREAM_COLORS[s.key] ?? `hsl(${i * 70}, 60%, 55%)`,
    annual: sumMonthlyMap(byType[s.key] ?? emptyMonthly()),
  }));

  return { byStream, monthly, totalAnnual: sumMonthlyMap(monthly) };
}

// ─── Labs ────────────────────────────────────────────────────────────────────

/** Total Labs (BL) spend per month, summed across all partner rows. */
export function computeLabsMonthly(labs: AxisData): MonthlyMap {
  const monthly = emptyMonthly();
  for (const bucket of labs.buckets) {
    for (const row of bucket.rows) addInto(monthly, row.months);
  }
  return monthly;
}
