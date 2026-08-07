// lib/hooks/use-forecast-validation.ts

/**
 * Orchestrates the "BL Forecast Validation" for the selected submission — the
 * replacement for the old tick-a-box use-submission-ready-months. Validating a
 * milestone step runs the flag analysis for its target RFQ and records the
 * outcome; nothing is computed live between validations.
 *
 * A validation run (runValidation):
 *   1. force-saves any unsaved forecast edits (persistDirty, page-supplied);
 *   2. computes the cat-3 swing flags (annual, vs the previous RFQ) and the
 *      cat-4 under-target flags (over the step's admin-configured month window);
 *   3. reconciles them with the stored flags — new flags start unjustified,
 *      existing flags keep their justification but refresh their numbers, gone
 *      flags are dropped;
 *   4. writes the reconciled set and records the step's status: "validated" when
 *      every flag is justified, otherwise "failed".
 *
 * Auto-recheck: whenever the forecast is saved, `recheckValidatedSteps` re-runs
 * the check for every step of the selected RFQ that already has a validation
 * record, so a validated step never drifts out of date — its stored outcome is
 * refreshed in place ("validated" ⇄ "failed"). Steps never validated are left
 * untouched (they stay "not validated" until someone runs the manual Validate).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaType } from "../types/common.types";
import { useAuth } from "../auth-context";
import { useForecastSelection } from "../stores/forecast-selection.store";
import {
  fetchDataEntry,
  fetchStoredFlags,
  subscribeToFlags,
  writeFlagJustification,
  writeReconciledFlags,
} from "../services/data-entry-service";
import {
  clearStepValidation,
  recordStepValidation,
  subscribeToStepValidations,
} from "../services/forecast-validation-service";
import {
  subscribeToStepWindows,
  type StepWindowMap,
} from "../services/flag-config-service";
import { computeSwingFlags } from "../flags/swing-rules";
import { computeUnderTargetFlags } from "../flags/under-target-rules";
import { reconcileFlags } from "../flags/reconcile";
import { justifyStoredFlag } from "../flags/reconcile";
import { deriveStepStatus } from "../flags/status";
import {
  previousRFQ,
  type AxisData,
  type AxisId,
} from "../types/forecaster.types";
import { CONFIRMATION_STEPS, stepById } from "../constants/confirmation-steps";
import type {
  FlagContext,
  RfqValidationStatus,
  StepValidationMap,
  StoredFlag,
  StoredFlagMap,
} from "../types/forecast-flags.types";

/** Coerce a raw stored axis into a usable AxisData (mirrors the service normalizer). */
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

/** Display order: revenue, media, labs; swings before under-target within an axis. */
const AXIS_RANK: Record<AxisId, number> = { revenue: 0, media: 1, labs: 2 };
function sortFlags(flags: StoredFlag[]): StoredFlag[] {
  return [...flags].sort(
    (a, b) =>
      AXIS_RANK[a.axis] - AXIS_RANK[b.axis] ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title)
  );
}

export interface UseForecastValidationParams {
  /** Current working copies of the three axes (live from the grid engines). */
  media: AxisData;
  labs: AxisData;
  revenue: AxisData;
  /** All RFQs across every year — used to resolve the previous submission. */
  allRfqs: { year: number; type: import("../types/rfq.types").RFQType }[];
  /** Resolve a Labs partnerId to a display name. */
  partnerLabel: (partnerId: string) => string;
  /** Resolve a Labs partnerId to its configured media type. */
  partnerMediaType: (partnerId: string) => MediaType | undefined;
  /** Force-save any unsaved forecast edits for the selected RFQ (no-op if clean/locked). */
  persistDirty: () => Promise<void>;
}

export interface ValidationRunResult {
  created: number;
  updated: number;
  deleted: number;
  unjustified: number;
  passed: boolean;
}

export interface UseForecastValidationResult {
  ready: boolean;
  flags: StoredFlag[];
  unjustifiedCount: number;
  stepValidations: StepValidationMap;
  windows: StepWindowMap;
  /** Stored outcome of a step for the selected RFQ (not_validated / failed / validated). */
  stepStatus: (stepId: string) => RfqValidationStatus;
  runningStep: string | null;
  runValidation: (stepId: string) => Promise<ValidationRunResult | null>;
  /**
   * Re-run the check for every already-validated step of the selected RFQ.
   * Called after a forecast save so a validated step's stored outcome stays
   * current; a no-op for steps that were never validated.
   */
  recheckValidatedSteps: () => Promise<void>;
  /** Reset a step's status to "not validated" (clears its validation record). */
  unvalidate: (stepId: string) => Promise<void>;
  justify: (
    flagKey: string,
    input: { context?: FlagContext; note: string }
  ) => Promise<void>;
}

export function useForecastValidation(
  params: UseForecastValidationParams
): UseForecastValidationResult {
  const {
    media,
    labs,
    revenue,
    allRfqs,
    partnerLabel,
    partnerMediaType,
    persistDirty,
  } = params;

  const { user } = useAuth();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;

  // ─── Subscriptions ──────────────────────────────────────────────────────────
  const [flagMap, setFlagMap] = useState<StoredFlagMap>({});
  useEffect(() => {
    if (!ready) {
      setFlagMap({});
      return;
    }
    return subscribeToFlags(
      selectedClient!.cl_id,
      selectedYear!,
      selectedRFQ!.type,
      ({ flags }) => setFlagMap(flags)
    );
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type]);

  const [stepValidations, setStepValidations] = useState<StepValidationMap>({});
  useEffect(() => {
    if (!selectedClient || !selectedYear) {
      setStepValidations({});
      return;
    }
    return subscribeToStepValidations(
      selectedClient.cl_id,
      selectedYear,
      setStepValidations
    );
  }, [selectedClient?.cl_id, selectedYear]);

  const [windows, setWindows] = useState<StepWindowMap>({});
  useEffect(() => subscribeToStepWindows(setWindows), []);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const flags = useMemo(() => sortFlags(Object.values(flagMap)), [flagMap]);
  const unjustifiedCount = useMemo(
    () => flags.filter((f) => !f.justified).length,
    [flags]
  );

  const stepStatus = useCallback(
    (stepId: string): RfqValidationStatus =>
      deriveStepStatus({ validation: stepValidations[stepId] }),
    [stepValidations]
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  const [runningStep, setRunningStep] = useState<string | null>(null);
  // Keep the latest working copies reachable from the async run without
  // re-creating runValidation on every keystroke.
  const liveRef = useRef({ media, labs, revenue, allRfqs, partnerLabel, partnerMediaType, windows });
  liveRef.current = { media, labs, revenue, allRfqs, partnerLabel, partnerMediaType, windows };

  const runValidation = useCallback(
    async (stepId: string): Promise<ValidationRunResult | null> => {
      const step = stepById(stepId);
      if (!step || !selectedClient || !selectedYear || !selectedRFQ) return null;
      // A step only validates its target RFQ; the working copies belong to the
      // selected RFQ, so the two must match.
      if (step.targetRfq !== selectedRFQ.type) return null;

      setRunningStep(stepId);
      try {
        // 1 — Persist unsaved edits so the analysis reads the saved truth.
        await persistDirty();

        const live = liveRef.current;
        const clientId = selectedClient.cl_id;
        const year = selectedYear;
        const rfqType = selectedRFQ.type;

        // 2 — Reference side: the previous RFQ's axes (swings only).
        const prev = previousRFQ(live.allRfqs, year, rfqType);
        let previousAxes: Partial<Record<AxisId, AxisData>> | null = null;
        if (prev) {
          const prevEntry = await fetchDataEntry(clientId, prev.year, prev.rfq);
          previousAxes = {
            media: axisOf(prevEntry, "media"),
            labs: axisOf(prevEntry, "labs"),
            revenue: axisOf(prevEntry, "revenue"),
          };
        }

        // 3 — Compute both flag families.
        const window = live.windows[stepId] ?? [];
        const computed = [
          ...computeSwingFlags({
            current: { media: live.media, labs: live.labs, revenue: live.revenue },
            previous: previousAxes,
            partnerLabel: live.partnerLabel,
          }),
          ...computeUnderTargetFlags({
            media: live.media,
            labs: live.labs,
            analyzedMonths: window,
            partnerLabel: live.partnerLabel,
          }),
        ];

        // 4 — Reconcile against the freshly-read stored flags and persist.
        const now = new Date().toISOString();
        const existing = await fetchStoredFlags(clientId, year, rfqType);
        const result = reconcileFlags(existing, computed, now);
        await writeReconciledFlags(clientId, year, rfqType, result.flags, user?.uid);

        const passed = result.unjustified === 0;
        await recordStepValidation(clientId, year, stepId, {
          status: passed ? "validated" : "failed",
          validatedAt: now,
          ...(user?.uid ? { validatedBy: user.uid } : {}),
          analyzedMonths: [...window],
          targetRfq: step.targetRfq,
        });

        return {
          created: result.created,
          updated: result.updated,
          deleted: result.deleted,
          unjustified: result.unjustified,
          passed,
        };
      } finally {
        setRunningStep(null);
      }
    },
    [selectedClient?.cl_id, selectedYear, selectedRFQ?.type, persistDirty, user?.uid]
  );

  const recheckValidatedSteps = useCallback(async (): Promise<void> => {
    if (!selectedRFQ) return;
    // Only steps of the selected RFQ that have already been validated — a
    // never-validated step stays "not validated" until a manual Validate.
    const steps = CONFIRMATION_STEPS.filter(
      (s) => s.targetRfq === selectedRFQ.type && stepValidations[s.id]
    );
    for (const step of steps) {
      await runValidation(step.id);
    }
  }, [selectedRFQ?.type, stepValidations, runValidation]);

  const unvalidate = useCallback(
    async (stepId: string): Promise<void> => {
      if (!selectedClient || !selectedYear) return;
      setRunningStep(stepId);
      try {
        await clearStepValidation(selectedClient.cl_id, selectedYear, stepId);
      } finally {
        setRunningStep(null);
      }
    },
    [selectedClient?.cl_id, selectedYear]
  );

  const justify = useCallback(
    async (
      flagKey: string,
      input: { context?: FlagContext; note: string }
    ): Promise<void> => {
      if (!selectedClient || !selectedYear || !selectedRFQ) return;
      const flag = flagMap[flagKey];
      if (!flag) return;
      const next = justifyStoredFlag(
        flag,
        input.context,
        input.note,
        new Date().toISOString(),
        user?.uid
      );
      await writeFlagJustification(
        selectedClient.cl_id,
        selectedYear,
        selectedRFQ.type,
        next
      );
    },
    [selectedClient?.cl_id, selectedYear, selectedRFQ?.type, flagMap, user?.uid]
  );

  return {
    ready,
    flags,
    unjustifiedCount,
    stepValidations,
    windows,
    stepStatus,
    runningStep,
    runValidation,
    recheckValidatedSteps,
    unvalidate,
    justify,
  };
}
