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
 * `computeSwingLines` returns every compared line (no threshold) — the
 * Milestones page sums them for the total RFQ variance; the flags are the
 * lines that cross their threshold. Persistence + justification happen in
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

/**
 * One compared line of a submission: the client's annual revenue, one media
 * type or one Labs partner, current vs the previous RFQ (no threshold).
 */
export interface SwingLine {
  /** Same key as the flag the line raises (`${axis}:${ruleId}:${subject}`). */
  key: string;
  axis: AxisId;
  ruleId: FlagRuleId;
  subject: string;
  title: string;
  current: number;
  reference: number;
  /** current − reference. */
  delta: number;
  threshold: number;
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

function swingLine(
  axis: AxisId,
  ruleId: FlagRuleId,
  subject: string,
  title: string,
  current: number,
  reference: number,
  threshold: number
): SwingLine {
  return {
    key: `${axis}:${ruleId}:${subject}`,
    axis,
    ruleId,
    subject,
    title,
    current,
    reference,
    delta: current - reference,
    threshold,
  };
}

/**
 * True when the line raises a swing flag. No baseline (previous value 0) —
 * skipped, per the baseline rule.
 */
export function isSwingFlagged(l: Pick<SwingLine, "reference" | "delta" | "threshold">): boolean {
  return l.reference !== 0 && Math.abs(l.delta) >= l.threshold;
}

/** Every compared line, in axis order: revenue, media, labs. Empty without a previous RFQ. */
export function computeSwingLines(input: SwingInput): SwingLine[] {
  const { current, previous, partnerLabel } = input;
  if (!previous) return []; // no previous RFQ → nothing to compare

  const lines: SwingLine[] = [];

  // ─── Revenue — BL Submission vs previous Official Revenue, annual ───────────
  const curRevenue = current.revenue;
  const prevRevenue = previous.revenue;
  if (curRevenue && prevRevenue) {
    lines.push(
      swingLine(
        "revenue",
        "revenue-swing",
        "annual",
        "BL Submission (year)",
        sumMonthlyMap(blSubmissionByMonth(curRevenue)),
        sumMonthlyMap(officialRevenueByMonth(prevRevenue)),
        REVENUE_SWING_THRESHOLD
      )
    );
  }

  // ─── Media — per channel, annual BL Input variance ──────────────────────────
  const curMedia = current.media;
  const prevMedia = previous.media;
  if (curMedia && prevMedia) {
    const cur = blAnnualByType(curMedia);
    const prev = blAnnualByType(prevMedia);
    // Union so a dropped channel (present only in the previous RFQ) still counts.
    const channels = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    for (const channel of channels) {
      lines.push(
        swingLine(
          "media",
          "media-swing",
          channel,
          MEDIA_TYPE_LABELS[channel as MediaType] ?? channel,
          cur[channel] ?? 0,
          prev[channel] ?? 0,
          MEDIA_LABS_SWING_THRESHOLD
        )
      );
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
      lines.push(
        swingLine(
          "labs",
          "labs-swing",
          partnerId,
          partnerLabel(partnerId),
          cur[partnerId] ?? 0,
          prev[partnerId] ?? 0,
          MEDIA_LABS_SWING_THRESHOLD
        )
      );
    }
  }

  return lines;
}

/** Every swing flag raised for the submission, in axis order: revenue, media, labs. */
export function computeSwingFlags(input: SwingInput): ComputedFlag[] {
  return computeSwingLines(input)
    .filter(isSwingFlagged)
    .map((l) => ({
      key: l.key,
      category: "swing",
      ruleId: l.ruleId,
      axis: l.axis,
      subject: l.subject,
      title: l.title,
      current: l.current,
      reference: l.reference,
      delta: l.delta,
      threshold: l.threshold,
    }));
}
