// lib/flags/status.ts

/**
 * Pure derivation of a milestone step's UI status from its stored validation
 * record plus the staleness signals. Shared by the live forecast control
 * (use-forecast-validation) and the cross-client Milestones recap so both
 * classify a step identically.
 */

import type { MonthlyMap } from "../types/common.types";
import type {
  RfqValidationStatus,
  StepValidation,
  StoredFlag,
} from "../types/forecast-flags.types";
import { sumOverMonths } from "./axis-totals";

export interface StepStatusInput {
  /** The step's stored validation record — absent means never validated. */
  validation?: StepValidation;
  /** data_entries.forecastEditedAt for the step's target RFQ (BL-change signal). */
  forecastEditedAt?: string;
  /** True when a MediaOcean total behind an under-target flag has drifted. */
  moDrift: boolean;
  /** Live-only: unsaved edits in the working copy (always false in the recap). */
  hasUnsavedEdits?: boolean;
}

/**
 * A BL forecast change takes priority over a MediaOcean change when both moved,
 * since it is the edit the user just made.
 */
export function deriveStepStatus(input: StepStatusInput): RfqValidationStatus {
  const v = input.validation;
  if (!v) return "not_validated";
  if (v.status === "failed") return "failed";
  const editedAfter = !!input.forecastEditedAt && input.forecastEditedAt > v.validatedAt;
  if (input.hasUnsavedEdits || editedAfter) return "stale_bl";
  if (input.moDrift) return "stale_mo";
  return "validated";
}

/**
 * Whether any under-target flag's stored MediaOcean total no longer matches the
 * current MediaOcean total over its analyzed window. `currentMoByAxis` holds the
 * live per-axis monthly MediaOcean totals (media / labs).
 */
export function flagsMoDrift(
  flags: StoredFlag[],
  currentMoByAxis: { media: MonthlyMap; labs: MonthlyMap }
): boolean {
  return flags.some((f) => {
    if (f.category !== "under_target" || f.moTotal === undefined) return false;
    const map =
      f.axis === "media"
        ? currentMoByAxis.media
        : f.axis === "labs"
          ? currentMoByAxis.labs
          : null;
    if (!map) return false;
    const current = sumOverMonths(map, f.analyzedMonths ?? []);
    return Math.round(current) !== Math.round(f.moTotal);
  });
}
