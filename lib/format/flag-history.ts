// lib/format/flag-history.ts

/**
 * Reads the flag history (flag_history snapshots, one per milestone step) for
 * "what did the BL say last time?": the most recent justification of the same
 * flag (same key = same rule on the same media type / partner) at an earlier
 * round of the year. Pure and Firebase-free.
 */

import { CONFIRMATION_STEPS } from "../constants/confirmation-steps";
import { RFQ_TYPE_ORDER, type RFQType } from "../types/rfq.types";
import type { FlagContext } from "../types/forecast-flags.types";
import type { FlagSnapshot } from "../services/flag-history-service";

export interface PreviousJustification {
  /** Milestone label, e.g. "RFQ3 (Sept)". */
  stepLabel: string;
  /** Round, e.g. "RFQ3". */
  rfq: RFQType;
  context?: FlagContext;
  note?: string;
}

/**
 * The latest justification of `flagKey` at a round BEFORE `rfq` (a Prelim and
 * its RFQ share the round, so they never count as "previous" for each other).
 */
export function previousJustification(
  snapshots: Record<string, FlagSnapshot> | undefined,
  rfq: RFQType,
  flagKey: string
): PreviousJustification | undefined {
  if (!snapshots) return undefined;
  const before = CONFIRMATION_STEPS.filter((s) => RFQ_TYPE_ORDER[s.targetRfq] < RFQ_TYPE_ORDER[rfq]);
  for (let i = before.length - 1; i >= 0; i--) {
    const step = before[i];
    const f = snapshots[step.id]?.flags?.[flagKey];
    if (f?.justified && (f.context || f.note)) {
      return { stepLabel: step.label, rfq: step.targetRfq, context: f.context, note: f.note };
    }
  }
  return undefined;
}
