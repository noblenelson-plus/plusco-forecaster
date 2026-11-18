// lib/services/flag-history-service.ts

/**
 * Firestore service — "flag_history" collection: what each client's flags (and
 * their justifications) looked like at each milestone, so earlier rounds'
 * justifications stay visible after the flags move on.
 *
 * One doc per client × year × milestone step, ID `{cl_id}_{year}_{stepId}`:
 *   { clientId, year, stepId, targetRfq, status, validatedAt, validatedBy?,
 *     flags: StoredFlagMap, updatedAt }
 *
 * Written by every validation of that step (the run's reconciled flags), and
 * kept in step with later justifications of the round (`syncSnapshotFlag`
 * updates the latest-validated step of that RFQ). A later validation of the
 * same step replaces its snapshot; other steps are never touched, so once a
 * round moves on its snapshot keeps what was justified then.
 *
 * Rules (firestoreRules.txt): read = whoever reads the client's data; write =
 * the client's writers while the target RFQ is unlocked; admins always.
 */

import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import type { RFQType } from "../types/rfq.types";
import type {
  StepValidationStatus,
  StoredFlag,
  StoredFlagMap,
} from "../types/forecast-flags.types";

const COLLECTION = "flag_history";

export interface FlagSnapshot {
  clientId: string;
  year: number;
  stepId: string;
  targetRfq: RFQType;
  status: StepValidationStatus;
  validatedAt: string;
  validatedBy?: string;
  flags: StoredFlagMap;
  updatedAt: string;
}

export function flagSnapshotId(clientId: string, year: number, stepId: string): string {
  return `${clientId}_${year}_${stepId}`;
}

/** Saves (replaces) a step's snapshot after a validation run. */
export async function writeFlagSnapshot(snapshot: Omit<FlagSnapshot, "updatedAt">): Promise<void> {
  const { validatedBy, ...rest } = snapshot;
  await setDoc(doc(db, COLLECTION, flagSnapshotId(snapshot.clientId, snapshot.year, snapshot.stepId)), {
    ...rest,
    ...(validatedBy ? { validatedBy } : {}),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Mirrors one justified/edited flag into a step's snapshot (dot-path update of
 * `flags.{key}`). Missing snapshot → nothing to update (ignored).
 */
export async function syncSnapshotFlag(
  clientId: string,
  year: number,
  stepId: string,
  flag: StoredFlag
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, flagSnapshotId(clientId, year, stepId)), {
      [`flags.${flag.key}`]: flag,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // not-found: the step was validated before history existed — nothing to sync.
    if ((err as { code?: string })?.code !== "not-found") throw err;
  }
}

/** Every snapshot of a client for a year, keyed by step id. */
export async function fetchFlagSnapshots(
  clientId: string,
  year: number
): Promise<Record<string, FlagSnapshot>> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("clientId", "==", clientId), where("year", "==", year))
  );
  const out: Record<string, FlagSnapshot> = {};
  for (const d of snap.docs) {
    const s = d.data() as FlagSnapshot;
    out[s.stepId] = s;
  }
  return out;
}
