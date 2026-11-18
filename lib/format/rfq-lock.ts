// lib/format/rfq-lock.ts

/**
 * Closed rounds are read-only for non-admins — the forecast AND its flags.
 *
 * Once an RFQ is LOCKED, a BL can no longer validate it (Validate / Re-validate,
 * Revalidate on the Flags page, the Milestones batch check), reset one of its
 * milestones, or edit a flag justification on it. Validating re-runs the checks
 * against the latest MediaOcean actuals and saves the result, so allowing it
 * after the deadline let a closed round pick up new flags and turn its milestone
 * yellow (AGLC 2026 RFQ3, 2026-11-17). Admins keep full access.
 *
 * The Firestore rules enforce the flag half (`data_entries`: no `flags` write by
 * a non-admin on a locked RFQ — see firestoreRules.txt); a validation writes the
 * flags before the milestone status, so a refused flag write stops the run
 * before the status changes. Pure and Firebase-free.
 */

import type { RFQ } from "../types/rfq.types";

/** True when `rfq` is locked and the person is not an admin. */
export function isRoundClosedFor(
  rfq: Pick<RFQ, "status"> | null | undefined,
  isAdmin: boolean
): boolean {
  return !isAdmin && rfq?.status === "LOCKED";
}

/** The note shown wherever a closed round hides its validation / justification controls. */
export const CLOSED_ROUND_NOTE =
  "This round is closed — it can no longer be validated or justified. Validate the open round instead.";

/** Thrown by a guarded write on a closed round (should be unreachable from the UI). */
export class ClosedRoundError extends Error {
  constructor() {
    super("This round is locked — it can no longer be validated or justified.");
    this.name = "ClosedRoundError";
  }
}
