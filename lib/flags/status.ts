// lib/flags/status.ts

/**
 * Pure derivation of a milestone step's UI status from its stored validation
 * record. Shared by the live forecast control (use-forecast-validation) and the
 * cross-client Milestones recap so both classify a step identically.
 *
 * The status is simply the stored outcome: a step with no validation record has
 * never been checked ("not_validated"); otherwise it is exactly what the last
 * check recorded ("validated" / "failed"). There is no staleness to compute —
 * a validated step is auto-rechecked whenever its data changes, so the stored
 * record is kept current (see use-forecast-validation / milestone-check-service).
 */

import type {
  RfqValidationStatus,
  StepValidation,
} from "../types/forecast-flags.types";

export interface StepStatusInput {
  /** The step's stored validation record — absent means never validated. */
  validation?: StepValidation;
}

export function deriveStepStatus(input: StepStatusInput): RfqValidationStatus {
  const v = input.validation;
  if (!v) return "not_validated";
  return v.status === "failed" ? "failed" : "validated";
}
