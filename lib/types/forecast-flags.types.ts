// lib/types/forecast-flags.types.ts

/**
 * Forecast "flags" — the persisted big-swing (cat 3) and under-target (cat 4)
 * warnings raised for a submission. Unlike the legacy live flags (lib/flags/
 * flag-rules.ts, being retired), these are NOT recomputed on every edit: they
 * are created / updated / deleted only when a Business Lead runs a validation
 * (see use-forecast-validation.ts), and stored on the RFQ's data_entries doc.
 *
 * A flag is only "justified" when it carries BOTH a context (a dropdown value)
 * and a non-empty note. When a validation re-computes an existing flag it keeps
 * the justification and records a drift snapshot ("justified when it was $X").
 *
 * The transient QA-BL banners (cat 2) are frontend-only and never persisted —
 * they live in lib/flags/bl-alerts.ts, not here.
 */

import type { AxisId } from "./forecaster.types";
import type { RFQType } from "./rfq.types";

// ─── Rules ───────────────────────────────────────────────────────────────────

export type FlagCategory = "swing" | "under_target";

/** Every persisted-flag rule the engine can raise. */
export type FlagRuleId =
  // Cat 3 — big swings vs the previous RFQ (annual totals).
  | "revenue-swing"
  | "media-swing"
  | "labs-swing"
  // Cat 4 — MediaOcean under the current RFQ forecast over a month window.
  | "media-under-target"
  | "labs-under-target";

// ─── Justification context ─────────────────────────────────────────────────

/** The fixed reasons a user may attach to justify a flag (the dropdown). */
export const FLAG_CONTEXTS = [
  { value: "PERFORMANCE_PRICING", label: "Performance / Pricing" },
  { value: "BUDGET_CUTS", label: "Budget Cuts" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "TIMING_SHIFT", label: "Timing Shift" },
  { value: "INCOMPLETE_INPUT", label: "Incomplete Input" },
  { value: "INCREMENTAL_BUDGET", label: "Incremental Budget" },
  { value: "OTHER", label: "Other" },
] as const;

export type FlagContext = (typeof FLAG_CONTEXTS)[number]["value"];

export function flagContextLabel(context: FlagContext): string {
  return FLAG_CONTEXTS.find((c) => c.value === context)?.label ?? context;
}

// ─── Computed flag (rules output, no justification) ──────────────────────────

/**
 * A flag as produced by the pure rules engines (swing-rules / under-target-rules).
 * `key` is stable across validations — `${axis}:${ruleId}:${subject}` — so a
 * justification survives recomputation as long as the same rule fires on the
 * same subject.
 */
export interface ComputedFlag {
  key: string;
  category: FlagCategory;
  ruleId: FlagRuleId;
  axis: AxisId;
  /** Stable subject: "annual" (revenue), a media channel, a partnerId, or the axis. */
  subject: string;
  /** Short display label — e.g. "Social", a partner name, "BL Submission (year)". */
  title: string;
  /** The current submission's amount for this subject. */
  current: number;
  /** The comparison amount — previous RFQ (swing) or forecast over the window (under-target). */
  reference: number;
  /** current − reference. */
  delta: number;
  /** The tripped threshold in dollars. */
  threshold: number;
  /** under_target only — the months (1–12) analyzed for this flag. */
  analyzedMonths?: number[];
  /** under_target only — MediaOcean actuals total over the window at compute time. */
  moTotal?: number;
}

// ─── Stored flag (computed + justification) ──────────────────────────────────

/** Snapshot of a flag's numbers at the moment it was justified (drift log). */
export interface FlagJustificationSnapshot {
  reference: number;
  current: number;
  delta: number;
}

/** A flag as persisted under `flags[key]` on the RFQ's data_entries doc. */
export interface StoredFlag extends ComputedFlag {
  context?: FlagContext;
  note?: string;
  /** = has a context AND a non-empty note. Derived, but stored for cheap reads. */
  justified: boolean;
  /** The numbers at justify time — lets the UI show "justified at $X, now $Y". */
  justifiedSnapshot?: FlagJustificationSnapshot;
  justifiedAt?: string;
  justifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type StoredFlagMap = Record<string, StoredFlag>;

/** A flag is justified only with BOTH a context and a non-empty note. */
export function isFlagJustified(input: {
  context?: FlagContext;
  note?: string;
}): boolean {
  return !!input.context && !!input.note?.trim();
}

/**
 * Whether a stored flag's current numbers have drifted from what was justified.
 * `changed` is false when unjustified or when the delta matches the snapshot.
 */
export function flagDrift(flag: StoredFlag): {
  changed: boolean;
  fromDelta: number;
  toDelta: number;
} {
  const from = flag.justifiedSnapshot?.delta ?? flag.delta;
  return {
    changed: flag.justified && from !== flag.delta,
    fromDelta: from,
    toDelta: flag.delta,
  };
}

// ─── Validation status (per confirmation step) ───────────────────────────────

/** Outcome of one validation run for a milestone step. Absence = not validated. */
export type StepValidationStatus = "validated" | "failed";

/** One step's last validation, stored under `steps[stepId]` on forecast_validations. */
export interface StepValidation {
  status: StepValidationStatus;
  validatedAt: string;
  validatedBy?: string;
  /** The month window (1–12) analyzed for cat-4 flags in this run. */
  analyzedMonths: number[];
  /** The RFQ this step validated (its own RFQ, or the upcoming one for a Prelim step). */
  targetRfq: RFQType;
}

export type StepValidationMap = Record<string, StepValidation>;

/**
 * The UI-facing status of a submission's validation, derived at read time.
 *
 * Only three states exist: a step is either untouched, or its last check left
 * flags to justify, or it passed. There is no "stale" state — a validated step
 * is auto-rechecked whenever its underlying data changes (BL save, actuals
 * import) and the manual Validate / batch check refresh it otherwise, so the
 * stored outcome is always current.
 */
export type RfqValidationStatus =
  | "not_validated" // never validated (no check has run for this step yet)
  | "failed" // last check left some flags unjustified
  | "validated"; // last check passed — every flag justified
