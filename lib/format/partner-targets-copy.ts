// lib/format/partner-targets-copy.ts

/**
 * "Copy from {previous year}" on the Deal Targets page: fill a year's empty
 * targets from another year's. Pure and Firebase-free.
 *
 * Rules:
 * - Partners are matched by name (case- and space-insensitive).
 * - A target is "empty" when it is blank or $0 — those are filled; any other
 *   value already entered is kept (never overwritten).
 * - Source partners the target year doesn't have are added (same deal type,
 *   Labs Forecaster tick and target).
 * - The Labs share target and the Executive Summary goals are filled the same
 *   way (blank → copied; an existing value is kept).
 */

import type { ExecGoals, PartnerTarget, PartnerTargetsYear } from "../types/partner-targets.types";

export interface TargetsCopyResult {
  next: PartnerTargetsYear;
  /** Partner names whose target was filled. */
  filled: string[];
  /** Partner names that already had a target (kept). */
  kept: string[];
  /** Partner rows added from the source year. */
  added: string[];
  /** Goal / share fields filled. */
  goalsFilled: string[];
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const isEmpty = (v: number | null | undefined) => v == null || v === 0;

const GOAL_LABELS: Record<keyof ExecGoals, string> = {
  labsSpend: "Labs spend goal",
  metaSpend: "Meta spend goal",
  metaShareOfSocial: "Meta share of social goal",
  billupsShare: "Billups share goal",
};

export function copyTargetsFromYear(
  target: PartnerTargetsYear,
  source: PartnerTargetsYear,
  newId: () => string
): TargetsCopyResult {
  const byName = new Map(source.partners.map((p) => [key(p.partner), p]));
  const filled: string[] = [];
  const kept: string[] = [];
  const added: string[] = [];
  const seen = new Set<string>();

  const partners: PartnerTarget[] = target.partners.map((p) => {
    const k = key(p.partner);
    seen.add(k);
    const src = byName.get(k);
    if (!src || isEmpty(src.mediaSpendTarget)) return p;
    if (isEmpty(p.mediaSpendTarget)) {
      filled.push(p.partner);
      return { ...p, mediaSpendTarget: src.mediaSpendTarget };
    }
    kept.push(p.partner);
    return p;
  });
  for (const src of source.partners) {
    if (seen.has(key(src.partner)) || !src.partner.trim()) continue;
    added.push(src.partner);
    partners.push({ ...src, id: newId() });
  }

  const goalsFilled: string[] = [];
  const execGoals = { ...target.execGoals };
  for (const g of Object.keys(GOAL_LABELS) as (keyof ExecGoals)[]) {
    if (execGoals[g] == null && source.execGoals[g] != null) {
      execGoals[g] = source.execGoals[g];
      goalsFilled.push(GOAL_LABELS[g]);
    }
  }
  let totalLabsShareOfMediaTarget = target.totalLabsShareOfMediaTarget;
  if (totalLabsShareOfMediaTarget == null && source.totalLabsShareOfMediaTarget != null) {
    totalLabsShareOfMediaTarget = source.totalLabsShareOfMediaTarget;
    goalsFilled.push("Labs share of media target");
  }

  return {
    next: { ...target, totalLabsShareOfMediaTarget, execGoals, partners },
    filled,
    kept,
    added,
    goalsFilled,
  };
}
