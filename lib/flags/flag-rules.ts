// lib/flags/flag-rules.ts

/**
 * Pure "Flags" rules engine. Given the current submission's three axes and the
 * previous RFQ's three axes, it raises every flag that fires — no Firebase, no
 * React, no side effects (like lib/dashboard/data/qa-checks.ts). The hook feeds
 * it live working copies; the drawer renders the result.
 *
 * Rules (all compared against the immediately-previous RFQ):
 *   Revenue  — annual total: BL Submission (the grid's two-level-priority
 *              figure) vs the previous RFQ's Official Revenue; fires at |Δ| ≥ $50k.
 *   Media    — per channel (media type), annual BL Input total vs the previous
 *              RFQ's; fires at |Δ| ≥ $100k.
 *   Labs     — per partner, annual BL Input total vs the previous RFQ's; fires
 *              at |Δ| ≥ $100k.
 *
 * Baseline rule: when there is no previous RFQ, or the previous (reference)
 * value is 0, the flag is skipped — a variance from a 0 baseline is treated as
 * "no baseline to compare". Amounts are in the submission's own currency (same
 * client on both sides — no FX conversion).
 */

import { sumMonthlyMap } from "../types/common.types";
import {
  aggregateByType,
  MEDIA_TYPE_LABELS,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import type { MediaType } from "../types/common.types";
import {
  blSubmissionByMonth,
  officialRevenueByMonth,
} from "../format/revenue-commission";
import type { Flag, FlagRuleId } from "../types/flag.types";

/** Absolute threshold ($50k) for the Revenue annual-variance rule. */
export const REVENUE_ABSOLUTE_THRESHOLD = 50_000;

/** Absolute threshold ($100k) for the Media and Labs annual-variance rules. */
export const ABSOLUTE_VARIANCE_THRESHOLD = 100_000;

/** Per-axis current + previous data. `previous` is null when no RFQ precedes. */
export interface FlagComputeInput {
  current: Partial<Record<AxisId, AxisData>>;
  previous: Partial<Record<AxisId, AxisData>> | null;
  /** Resolve a Labs partnerId to a display name (falls back to the id). */
  partnerLabel: (partnerId: string) => string;
}

/** Annual total per rowType for one side of an axis (BL Input rows summed). */
function blAnnualByType(data: AxisData): Record<string, number> {
  const byType = aggregateByType(data, "BL_INPUT");
  const out: Record<string, number> = {};
  for (const [type, months] of Object.entries(byType)) {
    out[type] = sumMonthlyMap(months);
  }
  return out;
}

function absoluteFlag(
  axis: AxisId,
  ruleId: FlagRuleId,
  subject: string,
  title: string,
  current: number,
  reference: number,
  threshold: number
): Flag | null {
  // No baseline (previous value 0) — skip, per the baseline rule.
  if (reference === 0) return null;
  const delta = current - reference;
  if (Math.abs(delta) < threshold) return null;
  return {
    key: `${axis}:${ruleId}:${subject}`,
    axis,
    ruleId,
    title,
    current,
    reference,
    delta,
    relative: null,
    kind: "absolute",
    threshold,
  };
}

/** Every flag raised for the submission, grouped in axis order: revenue, media, labs. */
export function computeFlags(input: FlagComputeInput): Flag[] {
  const { current, previous, partnerLabel } = input;
  if (!previous) return []; // no previous RFQ → nothing to compare

  const flags: Flag[] = [];

  // ─── Revenue ───────────────────────────────────────────────────────────────
  const curRevenue = current.revenue;
  const prevRevenue = previous.revenue;
  if (curRevenue && prevRevenue) {
    // BL Submission vs previous Official Revenue, annual total.
    const curBLSubmission = sumMonthlyMap(blSubmissionByMonth(curRevenue));
    const prevOfficialAnnual = sumMonthlyMap(officialRevenueByMonth(prevRevenue));
    const flag = absoluteFlag(
      "revenue",
      "revenue-bl-submission-vs-official-annual",
      "annual",
      "BL Submission (year)",
      curBLSubmission,
      prevOfficialAnnual,
      REVENUE_ABSOLUTE_THRESHOLD
    );
    if (flag) flags.push(flag);
  }

  // ─── Media — per channel, annual BL Input variance ──────────────────────────
  const curMedia = current.media;
  const prevMedia = previous.media;
  if (curMedia && prevMedia) {
    const cur = blAnnualByType(curMedia);
    const prev = blAnnualByType(prevMedia);
    // Iterate the union so a dropped channel (present only in the previous RFQ)
    // still surfaces as a large negative variance.
    const channels = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    for (const channel of channels) {
      const label =
        MEDIA_TYPE_LABELS[channel as MediaType] ?? channel;
      const flag = absoluteFlag(
        "media",
        "media-channel-variance-annual",
        channel,
        label,
        cur[channel] ?? 0,
        prev[channel] ?? 0,
        ABSOLUTE_VARIANCE_THRESHOLD
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
      const flag = absoluteFlag(
        "labs",
        "labs-partner-variance-annual",
        partnerId,
        partnerLabel(partnerId),
        cur[partnerId] ?? 0,
        prev[partnerId] ?? 0,
        ABSOLUTE_VARIANCE_THRESHOLD
      );
      if (flag) flags.push(flag);
    }
  }

  return flags;
}
