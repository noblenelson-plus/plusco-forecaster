// lib/flags/bl-alerts.ts

/**
 * Cat 2 — "QA BL" alerts. Pure, Firebase-free, per-client, and NEVER persisted:
 * they recompute live from the selected client's working axes and render both
 * as banners in the forecast module and in section 1 of the Flags page. Amounts
 * are in the client's own currency (no FX).
 *
 * Three alerts, all on FULL-YEAR totals (months offset each other — a month
 * over the forecast is fine when the year as a whole isn't):
 *   1. Labs over media  — a media type's yearly Labs spend exceeds its yearly
 *                         media-spend forecast                  (ε $0.5).
 *   2. MediaOcean over media forecast — yearly media actuals exceed the yearly
 *                         BL forecast                           (≥ $1,000).
 *   3. MediaOcean over labs forecast  — same for Labs           (≥ $1,000).
 *
 * Each flagged row also lists the months that are over on their own (same
 * threshold), shown behind "Show months" to help locate what to fix.
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

/** One month that is over on its own — detail of a flagged yearly row. */
export interface BlAlertMonth {
  month: number;
  left: number;
  right: number;
  /** left − right (> 0). */
  variance: number;
}

export interface BlAlertRow {
  /** Media type label — set only for the Labs-over-media alert. */
  label?: string;
  /** Full-year amount that is too high (Labs, or MediaOcean actuals). */
  left: number;
  /** Full-year reference it exceeds (the forecast). */
  right: number;
  /** left − right (always > 0 for a listed row). */
  variance: number;
  /** Months over on their own, in calendar order (may be empty). */
  months: BlAlertMonth[];
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
      "A media type's Labs spend for the year is higher than the forecasted media spend for that type.",
  },
  "mediaocean-over-media": {
    title: "Under forecast",
    axis: "media",
    explanation:
      "Booked MediaOcean media spend for the year is higher than the BL media forecast — the forecast was set too low.",
  },
  "mediaocean-over-labs": {
    title: "Under forecast",
    axis: "labs",
    explanation:
      "Booked MediaOcean Labs spend for the year is higher than the BL Labs forecast — the forecast was set too low.",
  },
};

const yearTotal = (map: MonthlyMap) => MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);

/**
 * The yearly row when `left`'s 12-month total exceeds `right`'s by more than
 * `slack` (null otherwise), with the months that are over on their own.
 */
function overYear(
  left: MonthlyMap,
  right: MonthlyMap,
  slack: number,
  label?: string
): BlAlertRow | null {
  const l = yearTotal(left);
  const r = yearTotal(right);
  if (!(l > r + slack)) return null;
  const months: BlAlertMonth[] = [];
  for (const m of MONTHS) {
    const lm = left[m] ?? 0;
    const rm = right[m] ?? 0;
    if (lm > rm + slack) months.push({ month: m, left: lm, right: rm, variance: lm - rm });
  }
  return { ...(label ? { label } : {}), left: l, right: r, variance: l - r, months };
}

export interface BlAlertsInput {
  media?: AxisData;
  labs?: AxisData;
  /** Resolve a Labs partnerId to its configured media type (for alert 1). */
  partnerMediaType: (partnerId: string) => MediaType | undefined;
}

/**
 * Every cat-2 alert with at least one violating row, in display order. An
 * alert with no violations is omitted entirely.
 */
export function computeBlAlerts(input: BlAlertsInput): BlAlert[] {
  const { media, labs, partnerMediaType } = input;
  const alerts: BlAlert[] = [];

  // 1 — Labs over media, per media type, on the year.
  if (media && labs) {
    const labsByType = labsBlByMediaType(labs, partnerMediaType);
    const mediaByType = mediaBlByType(media);
    const rows: BlAlertRow[] = [];
    for (const type of Object.keys(labsByType) as MediaType[]) {
      const row = overYear(
        labsByType[type]!,
        mediaByType[type] ?? {},
        BL_LABS_EPSILON,
        MEDIA_TYPE_LABELS[type]
      );
      if (row) rows.push(row);
    }
    if (rows.length > 0) {
      rows.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
      alerts.push({ id: "labs-over-media", ...ALERT_META["labs-over-media"], rows });
    }
  }

  // 2 — MediaOcean media actuals over the BL media forecast, on the year.
  if (media) {
    const row = overYear(
      actualsMonthlyTotal(media),
      blMonthlyTotal(media),
      BL_MEDIAOCEAN_THRESHOLD
    );
    if (row) {
      alerts.push({ id: "mediaocean-over-media", ...ALERT_META["mediaocean-over-media"], rows: [row] });
    }
  }

  // 3 — MediaOcean labs actuals over the BL labs forecast, on the year.
  if (labs) {
    const row = overYear(
      actualsMonthlyTotal(labs),
      blMonthlyTotal(labs),
      BL_MEDIAOCEAN_THRESHOLD
    );
    if (row) {
      alerts.push({ id: "mediaocean-over-labs", ...ALERT_META["mediaocean-over-labs"], rows: [row] });
    }
  }

  return alerts;
}

/** Total violating rows (one per alert, per media type for Labs) — drives a count badge. */
export function blAlertsCount(alerts: BlAlert[]): number {
  return alerts.reduce((acc, a) => acc + a.rows.length, 0);
}
