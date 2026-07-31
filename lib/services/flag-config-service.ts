// lib/services/flag-config-service.ts

/**
 * Firestore service — global flag configuration, a single doc `config/flag_validation`.
 *
 * Holds the admin-defined analysis window for each validation milestone step:
 * which months (1–12) a step analyzes for the cat-4 under-target flags. The
 * window is global (not per client or per RFQ). A "delay" is expressed simply
 * by leaving recent months out — e.g. the May Prelim RFQ2 might
 * analyze only Jan–Mar because MediaOcean reporting lags.
 *
 * An absent step key means an empty window → no under-target flag is raised at
 * that step (it validates swings only).
 */

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

const CONFIG_COLLECTION = "config";
const FLAG_VALIDATION_DOC = "flag_validation";

/** Per-step analyzed months (1–12). Absent step = empty window. */
export type StepWindowMap = Record<string, number[]>;

/** Sanitize a raw stored windows map into de-duplicated, sorted months (1–12). */
function normalizeWindows(raw: unknown): StepWindowMap {
  if (!raw || typeof raw !== "object") return {};
  const out: StepWindowMap = {};
  for (const [stepId, months] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(months)) continue;
    const clean = [
      ...new Set(
        months.filter(
          (m): m is number => typeof m === "number" && m >= 1 && m <= 12
        )
      ),
    ].sort((a, b) => a - b);
    out[stepId] = clean;
  }
  return out;
}

/** One-shot read of the per-step month windows (empty map when unconfigured). */
export async function fetchStepWindows(): Promise<StepWindowMap> {
  const snapshot = await getDoc(doc(db, CONFIG_COLLECTION, FLAG_VALIDATION_DOC));
  return normalizeWindows(snapshot.data()?.stepWindows);
}

/** Real-time per-step month windows. */
export function subscribeToStepWindows(
  callback: (windows: StepWindowMap) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, CONFIG_COLLECTION, FLAG_VALIDATION_DOC),
    (snapshot) => callback(normalizeWindows(snapshot.data()?.stepWindows)),
    (err) => {
      console.error("Step windows subscription failed:", err);
      callback({});
    }
  );
}

/**
 * Writes the whole per-step windows map (admin-only per the security rules).
 * The map is replaced wholesale so a step whose window was cleared disappears.
 */
export async function saveStepWindows(
  windows: StepWindowMap,
  userUid?: string
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, CONFIG_COLLECTION, FLAG_VALIDATION_DOC),
    {
      stepWindows: normalizeWindows(windows),
      updatedAt: now,
      ...(userUid ? { updatedBy: userUid } : {}),
    },
    { merge: true }
  );
}
