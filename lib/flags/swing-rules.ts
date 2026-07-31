// lib/flags/swing-rules.ts

/**
 * Cat 3 — "big swing" flags. Pure, Firebase-free engine that raises a flag when
 * a submission's ANNUAL total moves materially away from the immediately-
 * previous RFQ (same client, same currency — no FX):
 *
 *   Revenue — BL Submission (year) vs the previous RFQ's Official Revenue,
 *             fires at |Δ| ≥ $50k.
 *   Media   — per channel (media type), annual BL Input vs the previous RFQ,
 *             fires at |Δ| ≥ $100k.
 *   Labs    — per partner, annual BL Input vs the previous RFQ, fires at
 *             |Δ| ≥ $100k.
 *
 * Baseline rule: with no previous RFQ, or a previous (reference) value of 0,
 * the flag is skipped — a swing off a 0 baseline is "no baseline to compare".
 *
 * The result is a list of ComputedFlag; persistence + justification happen in
 * the validation flow (use-forecast-validation.ts + reconcile.ts).
 */

import { sumMonthlyMap, type MediaType } from "../types/common.types";
import {
  aggregateByType,
  MEDIA_TYPE_LABELS,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import {
  blSubmissionByMonth,
  officialRevenueByMonth,
} from "../format/revenue-commission";
import type { ComputedFlag, FlagRuleId } from "../types/forecast-flags.types";

/** Absolute threshold ($50k) for the Revenue swing rule. */
export const REVENUE_SWING_THRESHOLD = 50_000;

/** Absolute threshold ($100k) for the Media and Labs swing rules. */
export const MEDIA_LABS_SWING_THRESHOLD = 100_000;

export interface SwingInput {
  current: Partial<Record<AxisId, AxisData>>;
  previous: Partial<Record<AxisId, AxisData>> | null;
  /** Resolve a Labs partnerId to a display name (falls back to the id). */
  partnerLabel: (partnerId: string) => string;
}

/** Annual total per rowType for the BL_INPUT side of an axis. */
function blAnnualByType(data: AxisData): Record<string, number> {
  const byType = aggregateByType(data, "BL_INPUT");
  const out: Record<string, number> = {};
  for (const [type, months] of Object.entries(byType)) {
    out[type] = sumMonthlyMap(months);
  }
  return out;
}

function swingFlag(
  axis: AxisId,
  ruleId: FlagRuleId,
  subject: string,
  title: string,
  current: number,
  reference: number,
  threshold: number
): ComputedFlag | null {
  // No baseline (previous value 0) — skip, per the baseline rule.
  if (reference === 0) return null;
  const delta = current - reference;
  if (Math.abs(delta) < threshold) return null;
  return {
    key: `${axis}:${ruleId}:${subject}`,
    category: "swing",
    ruleId,
    axis,
    subject,
    title,
    current,
    reference,
    delta,
    threshold,
  };
}

/** Every swing flag raised for the submission, in axis order: revenue, media, labs. */
export function computeSwingFlags(input: SwingInput): ComputedFlag[] {
  const { current, previous, partnerLabel } = input;
  if (!previous) return []; // no previous RFQ → nothing to compare

  const flags: ComputedFlag[] = [];

  // ─── Revenue — BL Submission vs previous Official Revenue, annual ───────────
  const curRevenue = current.revenue;
  const prevRevenue = previous.revenue;
  if (curRevenue && prevRevenue) {
    const curBLSubmission = sumMonthlyMap(blSubmissionByMonth(curRevenue));
    const prevOfficialAnnual = sumMonthlyMap(officialRevenueByMonth(prevRevenue));
    const flag = swingFlag(
      "revenue",
      "revenue-swing",
      "annual",
      "BL Submission (year)",
      curBLSubmission,
      prevOfficialAnnual,
      REVENUE_SWING_THRESHOLD
    );
    if (flag) flags.push(flag);
  }

  // ─── Media — per channel, annual BL Input variance ──────────────────────────
  const curMedia = current.media;
  const prevMedia = previous.media;
  if (curMedia && prevMedia) {
    const cur = blAnnualByType(curMedia);
    const prev = blAnnualByType(prevMedia);
    // Union so a dropped channel (present only in the previous RFQ) still fires.
    const channels = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    for (const channel of channels) {
      const label = MEDIA_TYPE_LABELS[channel as MediaType] ?? channel;
      const flag = swingFlag(
        "media",
        "media-swing",
        channel,
        label,
        cur[channel] ?? 0,
        prev[channel] ?? 0,
        MEDIA_LABS_SWING_THRESHOLD
      );
      if (flag) flags.push(flag);
    }
  }

  // ─── Labs — per partner, annual BL Input variance ───────────────────────────
  const curLabs = current.labs;
  const prevLabs = previous.labs;
  if (curLabs && prevLabs) {
    const cur = blAnnualByType(curLabs);
    const prev = blAnnualByType(prevLabs);
    const partners = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    for (const partnerId of partners) {
      const flag = swingFlag(
        "labs",
        "labs-swing",
        partnerId,
        partnerLabel(partnerId),
        cur[partnerId] ?? 0,
        prev[partnerId] ?? 0,
        MEDIA_LABS_SWING_THRESHOLD
      );
      if (flag) flags.push(flag);
    }
  }

  return flags;
}
