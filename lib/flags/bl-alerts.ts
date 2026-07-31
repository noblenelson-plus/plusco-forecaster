// lib/flags/bl-alerts.ts

/**
 * Cat 2 — "QA BL" alerts. Pure, Firebase-free, per-client, and NEVER persisted:
 * they recompute live from the selected client's working axes and render both
 * as banners in the forecast module and in section 1 of the Flags page. Amounts
 * are in the client's own currency (no FX).
 *
 * Three alerts, all per-month:
 *   1. Labs over media  — Labs spend attributed to a media type exceeds the
 *                         media-spend forecast for that type    (ε $0.5).
 *   2. MediaOcean over media forecast — media actuals exceed the BL forecast (≥ $1,000).
 *   3. MediaOcean over labs forecast  — labs actuals exceed the BL forecast  (≥ $1,000).
 */

import {
  MONTHS,
  type MediaType,
  type MonthlyMap,
} from "../types/common.types";
import {
  MEDIA_TYPE_LABELS,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import {
  actualsMonthlyTotal,
  blMonthlyTotal,
  labsBlByMediaType,
  mediaBlByType,
} from "./axis-totals";

/** Float-noise floor for the Labs-over-media alert (effectively threshold $0). */
export const BL_LABS_EPSILON = 0.5;

/** Dollar threshold for the two MediaOcean-over-forecast alerts. */
export const BL_MEDIAOCEAN_THRESHOLD = 1_000;

export type BlAlertId =
  | "labs-over-media"
  | "mediaocean-over-media"
  | "mediaocean-over-labs";

export interface BlAlertRow {
  month: number;
  /** Media type label — set only for the Labs-over-media alert. */
  label?: string;
  /** The amount that is too high (Labs, or MediaOcean actuals). */
  left: number;
  /** The reference it exceeds (the forecast). */
  right: number;
  /** left − right (always > 0 for a listed row). */
  variance: number;
}

export interface BlAlert {
  id: BlAlertId;
  /** Short, explicit name shown as the card title. */
  title: string;
  /** Which axis the alert concerns — drives the colour code. */
  axis: AxisId;
  /** One-line explanation shown under the title. */
  explanation: string;
  rows: BlAlertRow[];
}

const ALERT_META: Record<
  BlAlertId,
  { title: string; axis: AxisId; explanation: string }
> = {
  "labs-over-media": {
    title: "Labs over media",
    axis: "labs",
    explanation:
      "A media type's Labs spend is higher than the forecasted media spend for that type in the month shown.",
  },
  "mediaocean-over-media": {
    title: "Under forecast",
    axis: "media",
    explanation:
      "Booked MediaOcean media spend is higher than the BL media forecast — the forecast was set too low for the month shown.",
  },
  "mediaocean-over-labs": {
    title: "Under forecast",
    axis: "labs",
    explanation:
      "Booked MediaOcean Labs spend is higher than the BL Labs forecast — the forecast was set too low for the month shown.",
  },
};

/** Rows where `left` exceeds `right` by more than `slack`, month by month. */
function overMonths(
  left: MonthlyMap,
  right: MonthlyMap,
  slack: number,
  label?: string
): BlAlertRow[] {
  const rows: BlAlertRow[] = [];
  for (const m of MONTHS) {
    const l = left[m] ?? 0;
    const r = right[m] ?? 0;
    if (l > r + slack) {
      rows.push({ month: m, ...(label ? { label } : {}), left: l, right: r, variance: l - r });
    }
  }
  return rows;
}

export interface BlAlertsInput {
  media?: AxisData;
  labs?: AxisData;
  /** Resolve a Labs partnerId to its configured media type (for alert 1). */
  partnerMediaType: (partnerId: string) => MediaType | undefined;
}

/**
 * Every cat-2 alert with at least one violating month, in display order. An
 * alert with no violations is omitted entirely.
 */
export function computeBlAlerts(input: BlAlertsInput): BlAlert[] {
  const { media, labs, partnerMediaType } = input;
  const alerts: BlAlert[] = [];

  // 1 — Labs over media, per media type, per month.
  if (media && labs) {
    const labsByType = labsBlByMediaType(labs, partnerMediaType);
    const mediaByType = mediaBlByType(media);
    const rows: BlAlertRow[] = [];
    for (const type of Object.keys(labsByType) as MediaType[]) {
      rows.push(
        ...overMonths(
          labsByType[type]!,
          mediaByType[type] ?? {},
          BL_LABS_EPSILON,
          MEDIA_TYPE_LABELS[type]
        )
      );
    }
    if (rows.length > 0) {
      rows.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "") || a.month - b.month);
      alerts.push({ id: "labs-over-media", ...ALERT_META["labs-over-media"], rows });
    }
  }

  // 2 — MediaOcean media actuals over the BL media forecast, per month.
  if (media) {
    const rows = overMonths(
      actualsMonthlyTotal(media),
      blMonthlyTotal(media),
      BL_MEDIAOCEAN_THRESHOLD
    );
    if (rows.length > 0) {
      alerts.push({ id: "mediaocean-over-media", ...ALERT_META["mediaocean-over-media"], rows });
    }
  }

  // 3 — MediaOcean labs actuals over the BL labs forecast, per month.
  if (labs) {
    const rows = overMonths(
      actualsMonthlyTotal(labs),
      blMonthlyTotal(labs),
      BL_MEDIAOCEAN_THRESHOLD
    );
    if (rows.length > 0) {
      alerts.push({ id: "mediaocean-over-labs", ...ALERT_META["mediaocean-over-labs"], rows });
    }
  }

  return alerts;
}

/** Total violating (month × type) rows across every alert — drives a count badge. */
export function blAlertsCount(alerts: BlAlert[]): number {
  return alerts.reduce((acc, a) => acc + a.rows.length, 0);
}
