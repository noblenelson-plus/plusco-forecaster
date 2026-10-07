// lib/services/dashboard-access-service.ts

/**
 * Firestore service — `config/dashboard_access`: per grantable dashboard, its
 * mode (GLOBAL / AGENCY) and grants (email domains and people). See
 * DashboardAccessConfig in access.types.ts and the resolution logic in
 * lib/format/access.ts. Replaces the by-role `config/dashboard_pages`.
 *
 * Read by every signed-in user (the rules read it too), written by admins.
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { DashboardAccessConfig } from "../types/access.types";
import { normalizeDashboardAccess } from "../format/access";

const CONFIG_COLLECTION = "config";
const DASHBOARD_ACCESS_DOC = "dashboard_access";

/**
 * Real-time config. A missing doc or a failed read reports every dashboard
 * closed (admins still see everything), never an error state.
 */
export function subscribeToDashboardAccess(
  callback: (config: DashboardAccessConfig) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, CONFIG_COLLECTION, DASHBOARD_ACCESS_DOC),
    (snapshot) => callback(normalizeDashboardAccess(snapshot.data() ?? null)),
    (err) => {
      console.error("Dashboard access subscription failed:", err);
      callback(normalizeDashboardAccess(null));
    }
  );
}

/** Replaces the whole config (admin). Values are normalized first. */
export async function saveDashboardAccess(config: DashboardAccessConfig): Promise<void> {
  await setDoc(doc(db, CONFIG_COLLECTION, DASHBOARD_ACCESS_DOC), normalizeDashboardAccess(config));
}
