// lib/flags/status.ts

/**
 * Pure milestone-status logic, shared by the live forecast control
 * (use-forecast-validation), the Flags page, the headless/batch check
 * (milestone-check-service) and the cross-client Milestones recap, so every
 * path classifies and records a step identically.
 *
 * Display (`deriveStepStatus`): no record or a "pending" record → "not_validated";
 * "failed" → "failed" (yellow); "validated" → "validated" (green).
 *
 * Recording (`nextStepStatus`): a passing check always records "validated". A
 * failing check records "failed" only when the step had already passed
 * (validated / failed) — i.e. new flags surfaced after a data change. A step
 * that never passed stays "pending" (shown as not validated): validating with
 * flags left unjustified never turns a milestone yellow.
 */

import type {
  RfqValidationStatus,
  StepValidation,
  StepValidationStatus,
} from "../types/forecast-flags.types";

export interface StepStatusInput {
  /** The step's stored validation record — absent means never validated. */
  validation?: StepValidation;
}

export function deriveStepStatus(input: StepStatusInput): RfqValidationStatus {
  const v = input.validation;
  if (!v || v.status === "pending") return "not_validated";
  return v.status === "failed" ? "failed" : "validated";
}

/** The status to record after a check, given the step's previous record. */
export function nextStepStatus(
  previous: StepValidation | undefined,
  passed: boolean
): StepValidationStatus {
  if (passed) return "validated";
  const hadPassed = previous?.status === "validated" || previous?.status === "failed";
  return hadPassed ? "failed" : "pending";
}
