// lib/flags/reconcile.ts

/**
 * Reconciles the stored flags of a submission with a freshly-computed set, the
 * core of a validation run. For each computed flag:
 *   • new key            → create it, unjustified;
 *   • key already stored → keep the justification (context + note + drift
 *                          snapshot) but refresh the numbers;
 *   • stored key missing from the computed set → drop it (no longer applies).
 *
 * Pure and Firebase-free. The output carries NO `undefined` values (Firestore
 * rejects them), so it can be written as-is.
 */

import {
  isFlagJustified,
  type ComputedFlag,
  type StoredFlag,
  type StoredFlagMap,
} from "../types/forecast-flags.types";

/** Build a StoredFlag from a computed one, omitting every absent field. */
function base(computed: ComputedFlag): Omit<
  StoredFlag,
  "justified" | "createdAt" | "updatedAt"
> {
  return {
    key: computed.key,
    category: computed.category,
    ruleId: computed.ruleId,
    axis: computed.axis,
    subject: computed.subject,
    title: computed.title,
    current: computed.current,
    reference: computed.reference,
    delta: computed.delta,
    threshold: computed.threshold,
    ...(computed.analyzedMonths ? { analyzedMonths: computed.analyzedMonths } : {}),
    ...(computed.moTotal !== undefined ? { moTotal: computed.moTotal } : {}),
  };
}

export interface ReconcileResult {
  flags: StoredFlagMap;
  created: number;
  updated: number;
  deleted: number;
  /** Count of resulting flags not yet justified — a validation passes at 0. */
  unjustified: number;
}

export function reconcileFlags(
  existing: StoredFlagMap,
  computed: ComputedFlag[],
  now: string
): ReconcileResult {
  const next: StoredFlagMap = {};
  let created = 0;
  let updated = 0;

  for (const c of computed) {
    const prev = existing[c.key];
    if (prev) {
      // Keep the justification, refresh the numbers. `justified` follows the
      // preserved context + note (unchanged here), so it stays as it was.
      const justified = isFlagJustified(prev);
      next[c.key] = {
        ...base(c),
        ...(prev.context ? { context: prev.context } : {}),
        ...(prev.note ? { note: prev.note } : {}),
        justified,
        ...(prev.justifiedSnapshot
          ? { justifiedSnapshot: prev.justifiedSnapshot }
          : {}),
        ...(prev.justifiedAt ? { justifiedAt: prev.justifiedAt } : {}),
        ...(prev.justifiedBy ? { justifiedBy: prev.justifiedBy } : {}),
        createdAt: prev.createdAt,
        updatedAt: now,
      };
      updated += 1;
    } else {
      next[c.key] = { ...base(c), justified: false, createdAt: now, updatedAt: now };
      created += 1;
    }
  }

  const deleted = Object.keys(existing).filter((k) => !(k in next)).length;
  const unjustified = Object.values(next).filter((f) => !f.justified).length;

  return { flags: next, created, updated, deleted, unjustified };
}

/**
 * Applies a justification to a stored flag: sets context + note, recomputes
 * `justified`, and — when it becomes justified — snapshots the current numbers
 * as the drift baseline. Returns a new flag object (no `undefined` fields).
 */
export function justifyStoredFlag(
  flag: StoredFlag,
  context: StoredFlag["context"],
  note: string,
  now: string,
  userUid?: string
): StoredFlag {
  const justified = isFlagJustified({ context, note });
  const next: StoredFlag = {
    ...flag,
    updatedAt: now,
    justified,
  };
  // Set/clear the annotation fields without leaving undefined behind.
  if (context) next.context = context;
  else delete next.context;
  if (note.trim()) next.note = note;
  else delete next.note;

  if (justified) {
    next.justifiedSnapshot = {
      reference: flag.reference,
      current: flag.current,
      delta: flag.delta,
    };
    next.justifiedAt = now;
    if (userUid) next.justifiedBy = userUid;
  } else {
    delete next.justifiedSnapshot;
    delete next.justifiedAt;
    delete next.justifiedBy;
  }
  return next;
}
