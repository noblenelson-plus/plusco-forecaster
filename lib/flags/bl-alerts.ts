// lib/flags/bl-alerts.ts

/**
 * Cat 2 — "QA BL" alerts. Pure and Firebase-free, per-client. They recompute
 * live from the selected client's working axes as banners on the forecast
 * page, and computeQaCheckFlags turns them into persisted flags at validation
 * time — one per alert row. Amounts are in the client's own currency (no FX).
 *
 * Three alerts, all on FULL-YEAR totals (months offset each other — a month
 * over the forecast is fine when the year as a whole isn't):
 *   1. Labs over media spend — the Labs partners of a media type forecast more
 *                         for the year than that media type's media forecast
 *                         (ε $0.5). An ERROR to correct: it can't be justified,
 *                         so it blocks validation until the forecast is fixed.
 *   2. Under-forecast (media) — a media type's yearly MediaOcean actuals exceed
 *                         its yearly BL forecast               (≥ $100,000).
 *   3. Under-forecast (Labs)  — same per Labs partner          (≥ $100,000).
 *                         The under-forecast checks are justifiable, like the
 *                         big swings.
 *
 * Each flagged row also lists the months that are over on their own, shown
 * behind "Show months" to help locate what to fix (Labs over media: same ε;
 * under-forecast: months over by $1,000 or more, so the drivers of a $100K gap
 * still show).
 */

import {
  MONTHS,
  type MediaType,
  type MonthlyMap,
} from "../types/common.types";
import {
  aggregateByType,
  MEDIA_TYPE_LABELS,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import { labsBlByMediaType, mediaBlByType } from "./axis-totals";
import type { ComputedFlag } from "../types/forecast-flags.types";

/** Float-noise floor for the Labs-over-media alert (effectively threshold $0). */
export const BL_LABS_EPSILON = 0.5;

/**
 * Dollar threshold (per media type / partner, full year) for the two
 * under-forecast alerts: flagged when actuals − forecast ≥ this (Adriana,
 * 2026-11-13; was $1,000, which flagged negligible variances).
 */
export const BL_MEDIAOCEAN_THRESHOLD = 100_000;

/** Per-month floor for the under-forecast "Show months" detail. */
export const BL_MEDIAOCEAN_MONTH_DETAIL = 1_000;

export type BlAlertId =
  | "labs-over-media"
  | "mediaocean-over-media"
  | "mediaocean-over-labs";

/** One Labs partner's yearly forecast inside a Labs-over-media row. */
export interface BlAlertPartner {
  label: string;
  amount: number;
}

/** One month that is over on its own — detail of a flagged yearly row. */
export interface BlAlertMonth {
  month: number;
  left: number;
  right: number;
  /** left − right (> 0). */
  variance: number;
}

export interface BlAlertRow {
  /**
   * Stable subject of the row — the media type key (Labs over media,
   * under-forecast media) or the partnerId (under-forecast Labs). Part of the
   * persisted flag key.
   */
  subject: string;
  /** Display name of the subject (media type, or "Partner (Media type)"). */
  label?: string;
  /**
   * Labs over media only — what the `left` amount is: the partner's name when
   * one partner drives the row, else "Total {type} Labs partners".
   */
  leftName?: string;
  /** Full-year amount that is too high (Labs, or MediaOcean actuals). */
  left: number;
  /** Full-year reference it exceeds (the forecast). */
  right: number;
  /** left − right (always > 0 for a listed row). */
  variance: number;
  /** Labs over media only — left ÷ right (absent when there is no media forecast). */
  ratio?: number;
  /** Labs over media only — the media type's Labs partners, largest first. */
  partners?: BlAlertPartner[];
  /** Months over on their own, in calendar order (may be empty). */
  months: BlAlertMonth[];
}

export interface BlAlert {
  id: BlAlertId;
  /** Short, explicit name shown as the card title. */
  title: string;
  /** Which axis the alert concerns — drives the colour code. */
  axis: AxisId;
  /**
   * Whether a row can be justified on the Flags page. A non-justifiable alert
   * is an error the BL must correct; it blocks validation until fixed.
   */
  justifiable: boolean;
  /**
   * One-line explanation shown under the title. `explanationLead` names the
   * `left` amount and is shown in bold, like that amount, so the reader can
   * tell which figure is which; `explanation` is the rest of the sentence.
   */
  explanationLead: string;
  explanation: string;
  /** Short names of the two compared amounts (`left` vs `right`). */
  leftLabel: string;
  rightLabel: string;
  /** What the variance means, shown after it (e.g. "to add to BL"). */
  varianceLabel: string;
  rows: BlAlertRow[];
}

type AlertMeta = Omit<BlAlert, "id" | "rows">;

const ALERT_META: Record<BlAlertId, AlertMeta> = {
  "labs-over-media": {
    title: "QA ERROR: LABS OVER MEDIA SPEND",
    axis: "labs",
    justifiable: false,
    explanationLead: "Labs partner forecast",
    explanation:
      " exceeds the corresponding media type forecast. Correct the Labs or Media forecast — this can't be justified.",
    leftLabel: "Labs",
    rightLabel: "media forecast",
    varianceLabel: "over",
  },
  "mediaocean-over-media": {
    title: "QA: UNDER-FORECAST",
    axis: "media",
    justifiable: true,
    explanationLead: "Booked MediaOcean spend",
    explanation:
      " for the year is higher than the BL forecast for these media types: correct your forecast and revalidate, or justify on the Flags page.",
    leftLabel: "MediaOcean",
    rightLabel: "BL forecast",
    varianceLabel: "to add to BL",
  },
  "mediaocean-over-labs": {
    title: "QA: UNDER-FORECAST",
    axis: "labs",
    justifiable: true,
    explanationLead: "Booked MediaOcean spend",
    explanation:
      " for the year is higher than the BL forecast for these Labs partners: correct your forecast and revalidate, or justify on the Flags page.",
    leftLabel: "MediaOcean",
    rightLabel: "BL forecast",
    varianceLabel: "to add to BL",
  },
};

const yearTotal = (map: MonthlyMap) => MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);

/**
 * The yearly row when `left`'s 12-month total exceeds `right`'s by at least
 * `slack` (null otherwise), with the months over by at least `monthSlack`.
 */
function overYear(
  left: MonthlyMap,
  right: MonthlyMap,
  slack: number,
  subject: string,
  label?: string,
  monthSlack: number = slack
): BlAlertRow | null {
  const l = yearTotal(left);
  const r = yearTotal(right);
  if (!(l - r >= slack)) return null;
  const months: BlAlertMonth[] = [];
  for (const m of MONTHS) {
    const lm = left[m] ?? 0;
    const rm = right[m] ?? 0;
    if (lm - rm >= monthSlack) months.push({ month: m, left: lm, right: rm, variance: lm - rm });
  }
  return { subject, ...(label ? { label } : {}), left: l, right: r, variance: l - r, months };
}

/**
 * Under-forecast rows for one axis: one per subject (rowType — media type or
 * partnerId) whose yearly MediaOcean actuals exceed its yearly BL forecast by
 * the threshold, largest variance first. Actuals-only subjects (no forecast
 * line) are included.
 */
function underForecastRows(
  data: AxisData,
  label: (rowType: string) => string
): BlAlertRow[] {
  const forecast = aggregateByType(data, "BL_INPUT");
  const actuals = aggregateByType(data, "ADMIN_INPUT");
  const rows: BlAlertRow[] = [];
  for (const [type, map] of Object.entries(actuals)) {
    const row = overYear(
      map,
      forecast[type] ?? {},
      BL_MEDIAOCEAN_THRESHOLD,
      type,
      label(type),
      BL_MEDIAOCEAN_MONTH_DETAIL
    );
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => b.variance - a.variance);
}

export interface BlAlertsInput {
  media?: AxisData;
  labs?: AxisData;
  /** Resolve a Labs partnerId to its configured media type (for alert 1). */
  partnerMediaType: (partnerId: string) => MediaType | undefined;
  /** Resolve a Labs partnerId to its display name (falls back to the id). */
  partnerLabel?: (partnerId: string) => string;
}

/**
 * Every cat-2 alert with at least one violating row, in display order. An
 * alert with no violations is omitted entirely.
 */
export function computeBlAlerts(input: BlAlertsInput): BlAlert[] {
  const { media, labs, partnerMediaType } = input;
  const partnerLabel = input.partnerLabel ?? ((id: string) => id);
  const alerts: BlAlert[] = [];

  // 1 — Labs over media spend, per media type, on the year.
  if (media && labs) {
    const labsByType = labsBlByMediaType(labs, partnerMediaType);
    const mediaByType = mediaBlByType(media);
    // Each partner's yearly Labs forecast, grouped by its media type.
    const partnersByType = new Map<MediaType, BlAlertPartner[]>();
    for (const [partnerId, map] of Object.entries(aggregateByType(labs, "BL_INPUT"))) {
      const type = partnerMediaType(partnerId);
      const amount = yearTotal(map);
      if (!type || !(amount > BL_LABS_EPSILON)) continue;
      const list = partnersByType.get(type) ?? [];
      list.push({ label: partnerLabel(partnerId), amount });
      partnersByType.set(type, list);
    }
    const rows: BlAlertRow[] = [];
    for (const type of Object.keys(labsByType) as MediaType[]) {
      const typeLabel = MEDIA_TYPE_LABELS[type] ?? type;
      const row = overYear(
        labsByType[type]!,
        mediaByType[type] ?? {},
        BL_LABS_EPSILON,
        type,
        typeLabel
      );
      if (!row) continue;
      const partners = (partnersByType.get(type) ?? []).sort((a, b) => b.amount - a.amount);
      rows.push({
        ...row,
        leftName:
          partners.length === 1 ? partners[0].label : `Total ${typeLabel} Labs partners`,
        ...(row.right > BL_LABS_EPSILON ? { ratio: row.left / row.right } : {}),
        partners,
      });
    }
    if (rows.length > 0) {
      rows.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
      alerts.push({ id: "labs-over-media", ...ALERT_META["labs-over-media"], rows });
    }
  }

  // 2 — Under-forecast: MediaOcean over the BL media forecast, per media type.
  if (media) {
    const rows = underForecastRows(media, (type) => MEDIA_TYPE_LABELS[type as MediaType] ?? type);
    if (rows.length > 0) {
      alerts.push({ id: "mediaocean-over-media", ...ALERT_META["mediaocean-over-media"], rows });
    }
  }

  // 3 — Under-forecast: MediaOcean over the BL Labs forecast, per partner.
  if (labs) {
    // Partner name + its media type, so each line also names the channel.
    const rows = underForecastRows(labs, (partnerId) => {
      const type = partnerMediaType(partnerId);
      const name = partnerLabel(partnerId);
      return type ? `${name} (${MEDIA_TYPE_LABELS[type] ?? type})` : name;
    });
    if (rows.length > 0) {
      alerts.push({ id: "mediaocean-over-labs", ...ALERT_META["mediaocean-over-labs"], rows });
    }
  }

  return alerts;
}

/** Total violating rows (one per media type / partner) — drives a count badge. */
export function blAlertsCount(alerts: BlAlert[]): number {
  return alerts.reduce((acc, a) => acc + a.rows.length, 0);
}

// ─── Persisted flags ─────────────────────────────────────────────────────────

/** The stored flag key of one alert row — stable across validations. */
export function qaFlagKey(alert: Pick<BlAlert, "id" | "axis">, row: Pick<BlAlertRow, "subject">): string {
  return `${alert.axis}:${alert.id}:${row.subject}`;
}

/**
 * The cat-2 QA checks as flags to persist at validation time: one per alert
 * row (per media type for Labs over media and media under-forecast, per
 * partner for Labs under-forecast), current = the yearly amount that is too
 * high, reference = what it exceeds, delta = the excess. Labs over media
 * carries its partners as the breakdown (current = the partner's yearly Labs
 * forecast; reference / delta unused, 0 / current).
 */
export function computeQaCheckFlags(input: BlAlertsInput): ComputedFlag[] {
  return computeBlAlerts(input).flatMap((alert) =>
    alert.rows.map(
      (row): ComputedFlag => ({
        key: qaFlagKey(alert, row),
        category: "qa_check",
        ruleId: alert.id,
        axis: alert.axis,
        subject: row.subject,
        title: row.label ?? row.subject,
        current: row.left,
        reference: row.right,
        delta: row.variance,
        threshold: alert.id === "labs-over-media" ? 0 : BL_MEDIAOCEAN_THRESHOLD,
        ...(row.partners?.length
          ? {
              breakdown: row.partners.map((p) => ({
                label: p.label,
                current: p.amount,
                reference: 0,
                delta: p.amount,
              })),
            }
          : {}),
      })
    )
  );
}
