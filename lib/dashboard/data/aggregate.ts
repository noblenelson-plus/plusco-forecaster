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
  type ForecastRow,
} from "../../types/forecaster.types";
import {
  MEDIA_TYPE_COLORS,
  REVENUE_STREAM_COLORS,
} from "../../../components/dashboard/charts/colors";
import type { LabsPartner } from "../../types/labs.types";

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

/**
 * Multiply every monthly amount in an axis by `factor` — used to normalize a
 * USD client's figures to CAD before they are merged into the scope totals.
 * A factor of 1 returns the input unchanged (CAD clients, or no rate set). Both
 * BL rows and admin actuals are scaled.
 */
export function scaleAxisData(data: AxisData, factor: number): AxisData {
  if (factor === 1) return data;
  const scaleRow = (r: ForecastRow): ForecastRow => {
    const months = emptyMonthly();
    for (const m of MONTHS) months[m] = (r.months[m] ?? 0) * factor;
    return { ...r, months };
  };
  return {
    buckets: data.buckets.map((b) => ({ ...b, rows: b.rows.map(scaleRow) })),
    actuals: data.actuals.map(scaleRow),
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
  /** BL media spend per month, split by media type (every MediaType present). */
  monthlyByType: Record<MediaType, MonthlyMap>;
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
  const monthlyByType = {} as Record<MediaType, MonthlyMap>;

  const byChannel: ChannelSlice[] = MEDIA_TYPES.map((mt) => {
    const months = byType[mt] ?? emptyMonthly();
    monthlyByType[mt] = months;
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
    monthlyByType,
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

/** Stream key → display label (known streams; unknown keys fall back to the key). */
export const REVENUE_STREAM_LABELS: Record<string, string> = Object.fromEntries(
  REVENUE_STREAMS.map((s) => [s.key, s.label])
);

export interface StreamSlice {
  key: string;
  label: string;
  color: string;
  annual: number;
}

export interface RevenueBreakdown {
  byStream: StreamSlice[];
  /** BL revenue per month, split by stream key (known streams, in order). */
  monthlyByStream: Record<string, MonthlyMap>;
  monthly: MonthlyMap;
  totalAnnual: number;
}

/** One in-scope client's BL revenue, keyed by stream key then month. */
export interface ClientRevenueBreakdown {
  clientId: string;
  byStream: Record<string, MonthlyMap>;
}

export function computeRevenueBreakdown(revenue: AxisData): RevenueBreakdown {
  const byType = aggregateByType(revenue, "BL_INPUT");
  const monthly = emptyMonthly();
  // Sum every stored stream (known or not) into the monthly total.
  for (const months of Object.values(byType)) addInto(monthly, months);

  const monthlyByStream = {} as Record<string, MonthlyMap>;
  const byStream: StreamSlice[] = REVENUE_STREAMS.map((s, i) => {
    const months = byType[s.key] ?? emptyMonthly();
    monthlyByStream[s.key] = months;
    return {
      key: s.key,
      label: s.label,
      color: REVENUE_STREAM_COLORS[s.key] ?? `hsl(${i * 70}, 60%, 55%)`,
      annual: sumMonthlyMap(months),
    };
  });

  return { byStream, monthlyByStream, monthly, totalAnnual: sumMonthlyMap(monthly) };
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

/**
 * One in-scope client's Labs BL spend, keyed by partner id (`row.rowType`) then
 * month, summed across projects. Drives the detailed Labs data table; partner
 * names and media types are resolved later via the configured partner list.
 */
export interface ClientLabsRaw {
  clientId: string;
  byPartner: Record<string, MonthlyMap>;
}

export function labsByPartnerForClient(labs: AxisData): Record<string, MonthlyMap> {
  const out: Record<string, MonthlyMap> = {};
  for (const bucket of labs.buckets) {
    for (const row of bucket.rows) {
      const pid = row.rowType;
      if (!out[pid]) out[pid] = emptyMonthly();
      addInto(out[pid], row.months);
    }
  }
  return out;
}

/** A fully-resolved row for the detailed Labs table: client × partner × month. */
export interface LabsDetailRow {
  clientId: string;
  partnerId: string;
  partnerName: string;
  /** The partner's media type, or null when the partner is no longer configured. */
  mediaType: MediaType | null;
  months: MonthlyMap;
  total: number;
}

/**
 * Resolve raw per-client Labs spend into table rows, attaching each partner's
 * name and media type from the configured partner list. Partners with spend but
 * no current configuration are kept (name falls back to the id, type is null) so
 * no money is silently dropped. Rows with zero spend are omitted.
 */
export function resolveLabsDetail(
  labsByClient: ClientLabsRaw[],
  partnersForYear: LabsPartner[]
): LabsDetailRow[] {
  const byId = new Map(partnersForYear.map((p) => [p.partnerId, p]));
  const rows: LabsDetailRow[] = [];
  for (const entry of labsByClient) {
    for (const [partnerId, months] of Object.entries(entry.byPartner)) {
      const total = sumMonthlyMap(months);
      if (total === 0) continue;
      const partner = byId.get(partnerId);
      rows.push({
        clientId: entry.clientId,
        partnerId,
        partnerName: partner?.name ?? partnerId,
        mediaType: partner?.mediaType ?? null,
        months,
        total,
      });
    }
  }
  return rows;
}
