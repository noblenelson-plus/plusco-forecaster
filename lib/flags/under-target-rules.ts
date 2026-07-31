// lib/flags/under-target-rules.ts

/**
 * Cat 4 — "under target" flags. Pure, Firebase-free engine that raises a flag
 * when the MediaOcean actuals fall materially BELOW the current RFQ's BL
 * forecast, for Media and Labs, over a specific month window.
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

import { emptyAxisData, type AxisData, type AxisId } from "../types/forecaster.types";
import {
  actualsMonthlyTotal,
  blMonthlyTotal,
  sumOverMonths,
} from "./axis-totals";
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
}

const AXIS_TITLE: Record<"media" | "labs", string> = {
  media: "Media Spend (window)",
  labs: "Labs (window)",
};

function underTargetFlag(
  axis: Extract<AxisId, "media" | "labs">,
  ruleId: FlagRuleId,
  data: AxisData,
  months: number[]
): ComputedFlag | null {
  const forecast = sumOverMonths(blMonthlyTotal(data), months);
  const actuals = sumOverMonths(actualsMonthlyTotal(data), months);
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
    key: `${axis}:${ruleId}`,
    category: "under_target",
    ruleId,
    axis,
    subject: axis,
    title: AXIS_TITLE[axis],
    current: actuals,
    reference: forecast,
    delta: actuals - forecast, // negative = under target
    threshold,
    analyzedMonths: [...months],
    moTotal: actuals,
  };
}

/** Every under-target flag raised for the given window. */
export function computeUnderTargetFlags(input: UnderTargetInput): ComputedFlag[] {
  const months = input.analyzedMonths;
  if (months.length === 0) return []; // no window configured → nothing to analyze

  const flags: ComputedFlag[] = [];
  const media = underTargetFlag(
    "media",
    "media-under-target",
    input.media ?? emptyAxisData(),
    months
  );
  if (media) flags.push(media);
  const labs = underTargetFlag(
    "labs",
    "labs-under-target",
    input.labs ?? emptyAxisData(),
    months
  );
  if (labs) flags.push(labs);
  return flags;
}
