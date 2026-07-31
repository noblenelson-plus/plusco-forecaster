// lib/services/forecast-validation-service.ts

/**
 * Firestore service — "forecast_validations" collection, one doc per
 * `{cl_id}_{year}`.
 *
 * The "BL Forecast Validation" is the set of milestone steps (see
 * lib/constants/confirmation-steps.ts) a Business Lead validates over the year.
 * Validating a step runs an analysis of its target RFQ (its own, or the
 * upcoming one for a Prelim step) and records the outcome.
 *
 * Two shapes coexist during the flags refonte:
 *   • legacy `steps: string[]`  — a plain set of confirmed step ids (old
 *     checkbox model), still read by pre-refonte callers.
 *   • new `stepValidations: Record<stepId, StepValidation>` — the outcome of
 *     each validation run (status + window + timestamp). This is the source of
 *     truth going forward; a legacy `steps` array is coerced into it on read so
 *     existing checkmarks survive.
 */

import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { stepById } from "../constants/confirmation-steps";
import type { StepValidation, StepValidationMap } from "../types/forecast-flags.types";

const COLLECTION = "forecast_validations";

/** Document ID for a {client, year} validation — e.g. CL_001_2026. */
export function buildValidationId(clientId: string, year: number): string {
  return `${clientId}_${year}`;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

/** Legacy `steps` value → a sorted, de-duplicated string[] of confirmed ids. */
function normalizeLegacySteps(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((s): s is string => typeof s === "string"))].sort()
    : [];
}

/**
 * Reads the step-validation map from a doc's data, coercing a legacy `steps`
 * array (confirmed ids, no analysis detail) into minimal "validated" records so
 * pre-refonte checkmarks are preserved. A real `stepValidations` map wins.
 */
function readStepValidations(data: Record<string, unknown> | undefined): StepValidationMap {
  if (!data) return {};
  const map = data.stepValidations as StepValidationMap | undefined;
  if (map && typeof map === "object") return map;

  // Coerce legacy confirmed steps → soft "validated" (no window, no flags run).
  const legacy = normalizeLegacySteps(data.steps);
  if (legacy.length === 0) return {};
  const stamp =
    (data.updatedAt as string | undefined) ??
    (data.meta as { updatedAt?: string } | undefined)?.updatedAt ??
    "1970-01-01T00:00:00.000Z";
  const coerced: StepValidationMap = {};
  for (const id of legacy) {
    const step = stepById(id);
    if (!step) continue;
    coerced[id] = {
      status: "validated",
      validatedAt: stamp,
      analyzedMonths: [],
      targetRfq: step.targetRfq,
    };
  }
  return coerced;
}

/** Validated step ids from a map (for the legacy confirmed-set consumers). */
function confirmedIds(map: StepValidationMap): string[] {
  return Object.entries(map)
    .filter(([, v]) => v.status === "validated")
    .map(([id]) => id)
    .sort();
}

// ─── Legacy reads (confirmed step ids) — kept until the refonte finishes ─────

/**
 * Confirmed steps for a {client, year} (validated ids). Returns [] when nothing
 * is validated. Reads either the new map or a legacy `steps` array.
 */
export async function fetchForecastValidation(
  clientId: string,
  year: number
): Promise<string[]> {
  const snapshot = await getDoc(doc(db, COLLECTION, buildValidationId(clientId, year)));
  return confirmedIds(readStepValidations(snapshot.data()));
}

/** Real-time confirmed step ids for a {client, year}. */
export function subscribeToForecastValidation(
  clientId: string,
  year: number,
  callback: (steps: string[]) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, buildValidationId(clientId, year)),
    (snapshot) => callback(confirmedIds(readStepValidations(snapshot.data()))),
    (err) => {
      console.error("Forecast validation subscription failed:", err);
      callback([]);
    }
  );
}

/**
 * Legacy write of the confirmed-step set (`steps: string[]`) — still used by the
 * pre-refonte "BL Forecast Validation" dropdown until the Validate flow replaces
 * it (phase 3). Creates the doc on first write.
 */
export async function saveForecastValidation(
  clientId: string,
  year: number,
  steps: string[],
  userUid?: string
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COLLECTION, buildValidationId(clientId, year)),
    {
      clientId,
      year,
      steps: [...new Set(steps)].sort(),
      meta: { updatedAt: now, ...(userUid ? { updatedBy: userUid } : {}) },
      updatedAt: now,
    },
    { merge: true }
  );
}

// ─── New model — step validations (status + window per step) ─────────────────

/** One-shot read of a {client, year}'s step validations (empty when none). */
export async function fetchStepValidations(
  clientId: string,
  year: number
): Promise<StepValidationMap> {
  const snapshot = await getDoc(doc(db, COLLECTION, buildValidationId(clientId, year)));
  return readStepValidations(snapshot.data());
}

/** Real-time step validations for a {client, year} (empty map when absent). */
export function subscribeToStepValidations(
  clientId: string,
  year: number,
  callback: (validations: StepValidationMap) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, buildValidationId(clientId, year)),
    (snapshot) => callback(readStepValidations(snapshot.data())),
    (err) => {
      console.error("Step validations subscription failed:", err);
      callback({});
    }
  );
}

/**
 * Records the outcome of one step's validation (dot-path set of
 * `stepValidations.{stepId}`), creating the doc on first write. Only that step
 * is touched; the others keep their records. Writable for a user with access
 * regardless of any RFQ lock.
 */
export async function recordStepValidation(
  clientId: string,
  year: number,
  stepId: string,
  validation: StepValidation
): Promise<void> {
  const ref = doc(db, COLLECTION, buildValidationId(clientId, year));
  const now = new Date().toISOString();
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, { clientId, year, createdAt: now });
  }
  await updateDoc(ref, {
    [`stepValidations.${stepId}`]: validation,
    updatedAt: now,
  });
}

/**
 * Un-validates a step — removes its validation record so the status resets to
 * "not validated". Only the step's own record is deleted; the RFQ's stored flags
 * are untouched (they live on the data_entries doc and are shared across steps).
 * A no-op when the doc doesn't exist yet.
 */
export async function clearStepValidation(
  clientId: string,
  year: number,
  stepId: string
): Promise<void> {
  const ref = doc(db, COLLECTION, buildValidationId(clientId, year));
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  await updateDoc(ref, {
    [`stepValidations.${stepId}`]: deleteField(),
    updatedAt: new Date().toISOString(),
  });
}
