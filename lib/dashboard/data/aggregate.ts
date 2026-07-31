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
  PLUS,
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

/**
 * Restricts an axis to a set of months: values outside the set are zeroed on
 * every BL and actuals row, so all downstream aggregations (totals, ratios,
 * tables) only count the selected months. Feed it a strict subset — with all
 * 12 months selected just skip the call.
 */
export function maskAxisDataToMonths(
  data: AxisData,
  months: ReadonlySet<number>
): AxisData {
  const maskRow = (r: ForecastRow): ForecastRow => {
    const masked = emptyMonthly();
    for (const m of MONTHS) masked[m] = months.has(m) ? r.months[m] ?? 0 : 0;
    return { ...r, months: masked };
  };
  return {
    buckets: data.buckets.map((b) => ({ ...b, rows: b.rows.map(maskRow) })),
    actuals: data.actuals.map(maskRow),
  };
}

function addInto(target: MonthlyMap, source: MonthlyMap): void {
  for (const m of MONTHS) target[m] += source[m] ?? 0;
}

// ─── Dimension breakdowns (by client attribute) ──────────────────────────────

/** One in-scope client's annual total for an axis (already CAD-normalized). */
export interface ClientAnnualTotal {
  clientId: string;
  total: number;
}

/** One in-scope client's monthly totals for an axis (already CAD-normalized). */
export interface ClientMonthlyTotal {
  clientId: string;
  months: MonthlyMap;
}

/** Monthly total of an axis's ADMIN_INPUT (actuals) rows, all types summed. */
export function actualsMonthly(data: AxisData): MonthlyMap {
  const monthly = emptyMonthly();
  for (const row of data.actuals) addInto(monthly, row.months);
  return monthly;
}

export interface DimensionSlice {
  label: string;
  annual: number;
  /** annual / scope total — null when the scope total is zero. */
  share: number | null;
}

/**
 * Group per-client annual totals under a resolved label (the client's region,
 * business lead, …) and sort descending. Zero-total groups are omitted.
 */
export function groupTotalsByLabel(
  totals: ClientAnnualTotal[],
  labelOf: (clientId: string) => string
): DimensionSlice[] {
  const byLabel = new Map<string, number>();
  let grand = 0;
  for (const t of totals) {
    const label = labelOf(t.clientId);
    byLabel.set(label, (byLabel.get(label) ?? 0) + t.total);
    grand += t.total;
  }
  return [...byLabel.entries()]
    .filter(([, annual]) => annual > 0)
    .map(([label, annual]) => ({
      label,
      annual,
      share: grand > 0 ? annual / grand : null,
    }))
    .sort((a, b) => b.annual - a.annual);
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
  { key: "commissionOverwrite", label: "Commission Overwrite" },
  { key: "projectFees", label: "Project Fees" },
  { key: "productFees", label: "Product Fees" },
  { key: "accrual", label: "Accrual/Adjustment" },
];

/** Synthetic single-stream key for the Official Revenue line (no real stream). */
export const OFFICIAL_STREAM_KEY = "official";

/** Stream key → display label (known streams; unknown keys fall back to the key). */
export const REVENUE_STREAM_LABELS: Record<string, string> = {
  ...Object.fromEntries(REVENUE_STREAMS.map((s) => [s.key, s.label])),
  [OFFICIAL_STREAM_KEY]: "Official Revenue",
};

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

/**
 * Build a RevenueBreakdown from an already-summed per-stream map (stream key →
 * MonthlyMap). Known streams come first in canonical order; any unknown stored
 * key is appended last so nothing is silently dropped. Reused for both the raw
 * BL_INPUT breakdown and the scope-level BL Submission aggregate (whose per-
 * stream sums are computed client by client upstream).
 */
export function revenueBreakdownFromStreams(
  byStream: Record<string, MonthlyMap>
): RevenueBreakdown {
  const monthly = emptyMonthly();
  for (const months of Object.values(byStream)) addInto(monthly, months);

  const monthlyByStream: Record<string, MonthlyMap> = {};
  const slices: StreamSlice[] = [];
  REVENUE_STREAMS.forEach((s, i) => {
    const months = byStream[s.key] ?? emptyMonthly();
    monthlyByStream[s.key] = months;
    slices.push({
      key: s.key,
      label: s.label,
      color: REVENUE_STREAM_COLORS[s.key] ?? `hsl(${i * 70}, 60%, 55%)`,
      annual: sumMonthlyMap(months),
    });
  });
  for (const [key, months] of Object.entries(byStream)) {
    if (key in monthlyByStream) continue;
    monthlyByStream[key] = months;
    slices.push({
      key,
      label: REVENUE_STREAM_LABELS[key] ?? key,
      color: REVENUE_STREAM_COLORS[key] ?? "#cbd5e1",
      annual: sumMonthlyMap(months),
    });
  }

  return {
    byStream: slices,
    monthlyByStream,
    monthly,
    totalAnnual: sumMonthlyMap(monthly),
  };
}

export function computeRevenueBreakdown(revenue: AxisData): RevenueBreakdown {
  return revenueBreakdownFromStreams(aggregateByType(revenue, "BL_INPUT"));
}

/**
 * Official Revenue as a RevenueBreakdown with a single synthetic stream — the
 * hand-entered `gaiaForecast` line has no per-stream dimension, so charts render
 * it as one green series (and the mix donut is hidden by the tab).
 */
export function officialBreakdown(monthly: MonthlyMap): RevenueBreakdown {
  const months = { ...emptyMonthly(), ...monthly };
  const annual = sumMonthlyMap(months);
  return {
    byStream: [
      {
        key: OFFICIAL_STREAM_KEY,
        label: REVENUE_STREAM_LABELS[OFFICIAL_STREAM_KEY],
        color: REVENUE_STREAM_COLORS[OFFICIAL_STREAM_KEY] ?? PLUS.green,
        annual,
      },
    ],
    monthlyByStream: { [OFFICIAL_STREAM_KEY]: months },
    monthly: months,
    totalAnnual: annual,
  };
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
