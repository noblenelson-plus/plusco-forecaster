// lib/flags/under-target-rules.ts

/**
 * Cat 4 — "under target" flags. Pure, Firebase-free engine that raises a flag
 * when the MediaOcean actuals fall materially BELOW the current RFQ's BL
 * forecast over a specific month window. The comparison is broken down by
 * subject: Media is analyzed per media type, Labs per partner — one flag per
 * subject that trips, never a single axis-wide flag.
 *
 * Period sensitivity is the whole point: MediaOcean fills in progressively, so
 * comparing full-year actuals to a full-year forecast would always read as
 * "under". The caller passes the exact months to analyze (the window configured
 * for the validation step, admin-defined); BOTH sides are summed over the same
 * window.
 *
 *   fires when  forecast(window) − actuals(window)  ≥ $50k
 *            OR  that shortfall ≥ 10% of forecast(window)   (forecast > 0)
 *
 * Direction convention (matching swings): current = actuals, reference =
 * forecast, so `delta = actuals − forecast` is negative when under target.
 */

import { type MediaType, type MonthlyMap } from "../types/common.types";
import {
  aggregateByType,
  emptyMonthly,
  MEDIA_TYPE_LABELS,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import { sumOverMonths } from "./axis-totals";
import type { ComputedFlag, FlagRuleId } from "../types/forecast-flags.types";

/** Relative shortfall (10%) that trips an under-target flag. */
export const UNDER_TARGET_RELATIVE = 0.1;

/** Absolute shortfall ($50k) that trips an under-target flag. */
export const UNDER_TARGET_ABSOLUTE = 50_000;

export interface UnderTargetInput {
  media?: AxisData;
  labs?: AxisData;
  /** Months (1–12) analyzed for this validation — both sides summed over them. */
  analyzedMonths: number[];
  /** Resolve a Labs partnerId to a display name (falls back to the id). */
  partnerLabel?: (partnerId: string) => string;
}

function underTargetFlag(
  axis: Extract<AxisId, "media" | "labs">,
  ruleId: FlagRuleId,
  subject: string,
  title: string,
  forecastMonthly: MonthlyMap,
  actualsMonthly: MonthlyMap,
  months: number[]
): ComputedFlag | null {
  const forecast = sumOverMonths(forecastMonthly, months);
  const actuals = sumOverMonths(actualsMonthly, months);
  const shortfall = forecast - actuals;
  if (shortfall <= 0) return null; // actuals meet or beat the forecast

  const relativeHit = forecast > 0 && shortfall / forecast >= UNDER_TARGET_RELATIVE;
  const absoluteHit = shortfall >= UNDER_TARGET_ABSOLUTE;
  if (!relativeHit && !absoluteHit) return null;

  // The tripped threshold reported in dollars: the absolute floor, or the
  // relative floor when only the % rule fired.
  const threshold = absoluteHit
    ? UNDER_TARGET_ABSOLUTE
    : Math.round(forecast * UNDER_TARGET_RELATIVE);

  return {
    key: `${axis}:${ruleId}:${subject}`,
    category: "under_target",
    ruleId,
    axis,
    subject,
    title,
    current: actuals,
    reference: forecast,
    delta: actuals - forecast, // negative = under target
    threshold,
    analyzedMonths: [...months],
    moTotal: actuals,
  };
}

/**
 * Under-target flags for one axis, one per subject (rowType). Forecast (BL) and
 * actuals (MediaOcean) are aggregated per rowType and compared over the window;
 * the union of both sides' types is scanned so a type present on only one side
 * is still considered (an actuals-only type has a 0 forecast and is skipped).
 */
function axisUnderTargetFlags(
  data: AxisData,
  axis: Extract<AxisId, "media" | "labs">,
  ruleId: FlagRuleId,
  label: (subject: string) => string,
  months: number[]
): ComputedFlag[] {
  const forecast = aggregateByType(data, "BL_INPUT");
  const actuals = aggregateByType(data, "ADMIN_INPUT");
  const subjects = new Set([...Object.keys(forecast), ...Object.keys(actuals)]);

  const flags: ComputedFlag[] = [];
  for (const subject of subjects) {
    const flag = underTargetFlag(
      axis,
      ruleId,
      subject,
      label(subject),
      forecast[subject] ?? emptyMonthly(),
      actuals[subject] ?? emptyMonthly(),
      months
    );
    if (flag) flags.push(flag);
  }
  return flags;
}

/** Every under-target flag raised for the given window. */
export function computeUnderTargetFlags(input: UnderTargetInput): ComputedFlag[] {
  const months = input.analyzedMonths;
  if (months.length === 0) return []; // no window configured → nothing to analyze

  const partnerLabel = input.partnerLabel ?? ((id: string) => id);
  const flags: ComputedFlag[] = [];

  if (input.media)
    flags.push(
      ...axisUnderTargetFlags(
        input.media,
        "media",
        "media-under-target",
        (type) => MEDIA_TYPE_LABELS[type as MediaType] ?? type,
        months
      )
    );

  if (input.labs)
    flags.push(
      ...axisUnderTargetFlags(
        input.labs,
        "labs",
        "labs-under-target",
        (partnerId) => partnerLabel(partnerId),
        months
      )
    );

  return flags;
}
