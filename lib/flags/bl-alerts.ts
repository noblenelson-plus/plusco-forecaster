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
 * threshold), shown behind "Show months" to help locate what to fix. The two
 * MediaOcean alerts compare whole-axis totals, so their year and month lines
 * also carry `parts`: the media types (Media) or partners (Labs) whose actuals
 * exceed their forecast, largest first — the lines driving the variance.
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

/** One media type / partner whose actuals exceed its forecast. */
export interface BlAlertPart {
  label: string;
  left: number;
  right: number;
  /** left − right (> 0). */
  variance: number;
}

/** One month that is over on its own — detail of a flagged yearly row. */
export interface BlAlertMonth {
  month: number;
  left: number;
  right: number;
  /** left − right (> 0). */
  variance: number;
  /** MediaOcean alerts only: the subjects over in that month, largest first. */
  parts?: BlAlertPart[];
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
  /** MediaOcean alerts only: the subjects over for the year, largest first. */
  parts?: BlAlertPart[];
}

export interface BlAlert {
  id: BlAlertId;
  /** Short, explicit name shown as the card title. */
  title: string;
  /** Which axis the alert concerns — drives the colour code. */
  axis: AxisId;
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
    title: "Labs over media",
    axis: "labs",
    explanationLead: "A media type's Labs spend",
    explanation:
      " for the year is higher than the forecasted media spend for that type.",
    leftLabel: "Labs",
    rightLabel: "media forecast",
    varianceLabel: "over",
  },
  "mediaocean-over-media": {
    title: "Under forecast",
    axis: "media",
    explanationLead: "Booked MediaOcean media spend",
    explanation:
      " for the year is higher than the BL media forecast — the forecast was set too low.",
    leftLabel: "MediaOcean",
    rightLabel: "BL forecast",
    varianceLabel: "to add to BL",
  },
  "mediaocean-over-labs": {
    title: "Under forecast",
    axis: "labs",
    explanationLead: "Booked MediaOcean Labs spend",
    explanation:
      " for the year is higher than the BL Labs forecast — the forecast was set too low.",
    leftLabel: "MediaOcean",
    rightLabel: "BL forecast",
    varianceLabel: "to add to BL",
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

/**
 * Subjects (rowTypes) whose actuals exceed their BL forecast over `months`,
 * largest variance first. Subjects over by less than the float-noise floor are
 * left out; actuals-only subjects (no forecast line) are included.
 */
function overParts(
  data: AxisData,
  months: readonly number[],
  label: (rowType: string) => string
): BlAlertPart[] {
  const forecast = aggregateByType(data, "BL_INPUT");
  const actuals = aggregateByType(data, "ADMIN_INPUT");
  const parts: BlAlertPart[] = [];
  for (const [type, map] of Object.entries(actuals)) {
    const left = months.reduce((acc, m) => acc + (map[m] ?? 0), 0);
    const right = months.reduce((acc, m) => acc + (forecast[type]?.[m] ?? 0), 0);
    if (left > right + BL_LABS_EPSILON)
      parts.push({ label: label(type), left, right, variance: left - right });
  }
  return parts.sort((a, b) => b.variance - a.variance);
}

/**
 * Yearly MediaOcean-over-forecast row for one axis, with its year and each
 * month broken down by subject (null when the year isn't over).
 */
function mediaOceanOverRow(
  data: AxisData,
  label: (rowType: string) => string
): BlAlertRow | null {
  const row = overYear(actualsMonthlyTotal(data), blMonthlyTotal(data), BL_MEDIAOCEAN_THRESHOLD);
  if (!row) return null;
  return {
    ...row,
    parts: overParts(data, MONTHS, label),
    months: row.months.map((m) => ({ ...m, parts: overParts(data, [m.month], label) })),
  };
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
    const row = mediaOceanOverRow(
      media,
      (type) => MEDIA_TYPE_LABELS[type as MediaType] ?? type
    );
    if (row) {
      alerts.push({ id: "mediaocean-over-media", ...ALERT_META["mediaocean-over-media"], rows: [row] });
    }
  }

  // 3 — MediaOcean labs actuals over the BL labs forecast, on the year.
  if (labs) {
    // Partner name + its media type, so each line also names the channel.
    const row = mediaOceanOverRow(labs, (partnerId) => {
      const type = partnerMediaType(partnerId);
      const name = partnerLabel(partnerId);
      return type ? `${name} (${MEDIA_TYPE_LABELS[type] ?? type})` : name;
    });
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
