// lib/services/milestone-check-service.ts

/**
 * Headless "run a milestone check" for one client — the batch-run equivalent of
 * `runValidation` in use-forecast-validation.ts, without the live grid.
 *
 * The live hook computes flags from the grid's in-memory working copies (the
 * user is editing that one client). A batch run has no grid, so this fetches the
 * saved truth for each client instead — mirroring exactly how the grid assembles
 * its axes on load: BL buckets come from the `data_entries` doc, while Media and
 * Labs actuals (ADMIN_INPUT) come from the separate `annual_actuals` doc (see
 * use-forecaster-grid.ts and use-scope-forecast-data.ts). Revenue actuals stay
 * in the submission doc.
 *
 * The rest is identical to the live flow: compute cat-3 swing flags (vs the
 * previous RFQ) + cat-4 under-target flags (over the step's admin window),
 * reconcile against the stored flags, persist, then record the step outcome.
 *
 * A batch only ever REFRESHES steps that were already validated: a client whose
 * step has no validation record yet is skipped, never validated for the first
 * time (initial validation stays a deliberate manual action). A client with no
 * `data_entries` doc for the step's target RFQ is likewise skipped (no forecast
 * entered yet) rather than recorded as a vacuous "validated".
 */

import type { RFQ } from "../types/rfq.types";
import type { ConfirmationStep } from "../constants/confirmation-steps";
import {
  previousRFQ,
  rollUpActuals,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import { ensureRevenueShape } from "../format/revenue-commission";
import { computeSwingFlags } from "../flags/swing-rules";
import { computeUnderTargetFlags } from "../flags/under-target-rules";
import { reconcileFlags } from "../flags/reconcile";
import type { StepWindowMap } from "./flag-config-service";
import {
  fetchDataEntry,
  fetchStoredFlags,
  writeReconciledFlags,
} from "./data-entry-service";
import { fetchAnnualActualsEntry } from "./annual-actuals-service";
import {
  fetchStepValidations,
  recordStepValidation,
} from "./forecast-validation-service";

/** Coerce a raw stored axis into a usable AxisData (mirrors the hook's axisOf). */
function axisOf(
  entry: { axes?: Partial<Record<AxisId, Partial<AxisData>>> } | null,
  axisId: AxisId
): AxisData {
  const raw = entry?.axes?.[axisId];
  return {
    buckets: Array.isArray(raw?.buckets) ? raw!.buckets! : [],
    actuals: Array.isArray(raw?.actuals) ? raw!.actuals! : [],
  };
}

/** Shared inputs for a batch run — resolved once, reused for every client. */
export interface ClientStepCheckDeps {
  /** All RFQs across every year — used to resolve the previous submission. */
  allRfqs: Pick<RFQ, "year" | "type">[];
  /** Resolve a Labs partnerId to a display name (falls back to the id). */
  partnerLabel: (partnerId: string) => string;
  /** Admin-configured per-step month windows for the cat-4 under-target flags. */
  windows: StepWindowMap;
  /** Acting user's uid, stamped on the flags + validation record. */
  userUid?: string;
}

export type ClientStepCheckStatus = "validated" | "failed" | "skipped";

export interface ClientStepCheckResult {
  clientId: string;
  status: ClientStepCheckStatus;
  /** Resulting unjustified flag count (0 when validated / skipped). */
  unjustified: number;
  created: number;
  updated: number;
  deleted: number;
}

const SKIPPED = (clientId: string): ClientStepCheckResult => ({
  clientId,
  status: "skipped",
  unjustified: 0,
  created: 0,
  updated: 0,
  deleted: 0,
});

/**
 * Refreshes one milestone step's check for a single client-year and records the
 * outcome. Returns a "skipped" result when the step was never validated for this
 * client (a batch only refreshes already-validated steps, never validates a new
 * one) or when the client has no submission for the step's target RFQ. Throws on
 * a Firestore write failure so the caller can mark that client as errored (e.g.
 * a permission-denied on a non-writable client).
 */
export async function runClientStepCheck(
  clientId: string,
  year: number,
  step: ConfirmationStep,
  deps: ClientStepCheckDeps
): Promise<ClientStepCheckResult> {
  const rfqType = step.targetRfq;

  // A batch only ever REFRESHES already-validated steps: a client that has
  // never validated this step (no record yet) is skipped, never validated for
  // the first time. Initial validation is always a deliberate manual action.
  const validations = await fetchStepValidations(clientId, year);
  if (!validations[step.id]) return SKIPPED(clientId);

  // Current side — the submission for the step's target RFQ. No doc → nothing
  // to validate, skip (don't fabricate a vacuous pass).
  const entry = await fetchDataEntry(clientId, year, rfqType);
  if (!entry) return SKIPPED(clientId);

  // Media/Labs actuals live in the annual doc, not the submission — merge them
  // in exactly like the grid does on load.
  const annual = await fetchAnnualActualsEntry(clientId, year);
  const media: AxisData = {
    ...axisOf(entry, "media"),
    actuals: rollUpActuals(annual.media ?? []),
  };
  const labs: AxisData = {
    ...axisOf(entry, "labs"),
    actuals: rollUpActuals(annual.labs ?? []),
  };
  // Revenue actuals stay in the submission doc. ensureRevenueShape mirrors the
  // grid's `normalizeLoaded`, so the swing math sees the same seeded rows the
  // manual single-client run does.
  const revenue = ensureRevenueShape(axisOf(entry, "revenue"));

  // Reference side — the previous RFQ's axes (swings only; BL/official values
  // read straight off the submission doc, no annual merge, as the live run does).
  const prev = previousRFQ(deps.allRfqs, year, rfqType);
  let previousAxes: Partial<Record<AxisId, AxisData>> | null = null;
  if (prev) {
    const prevEntry = await fetchDataEntry(clientId, prev.year, prev.rfq);
    previousAxes = {
      media: axisOf(prevEntry, "media"),
      labs: axisOf(prevEntry, "labs"),
      revenue: axisOf(prevEntry, "revenue"),
    };
  }

  // Compute both flag families for the step's window.
  const window = deps.windows[step.id] ?? [];
  const computed = [
    ...computeSwingFlags({
      current: { media, labs, revenue },
      previous: previousAxes,
      partnerLabel: deps.partnerLabel,
    }),
    ...computeUnderTargetFlags({
      media,
      labs,
      analyzedMonths: window,
      partnerLabel: deps.partnerLabel,
    }),
  ];

  // Reconcile against the freshly-read stored flags and persist.
  const now = new Date().toISOString();
  const existing = await fetchStoredFlags(clientId, year, rfqType);
  const result = reconcileFlags(existing, computed, now);
  await writeReconciledFlags(clientId, year, rfqType, result.flags, deps.userUid);

  const passed = result.unjustified === 0;
  await recordStepValidation(clientId, year, step.id, {
    status: passed ? "validated" : "failed",
    validatedAt: now,
    ...(deps.userUid ? { validatedBy: deps.userUid } : {}),
    analyzedMonths: [...window],
    targetRfq: step.targetRfq,
  });

  return {
    clientId,
    status: passed ? "validated" : "failed",
    unjustified: result.unjustified,
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
  };
}
