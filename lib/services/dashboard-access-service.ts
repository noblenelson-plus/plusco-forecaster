// lib/services/dashboard-access-service.ts

/**
 * Firestore service — `config/dashboard_access`: the dashboard tabs and
 * sub-tabs hidden from everyone but admins (DashboardAccessConfig in
 * access.types.ts). Who may open each tab is resolved in lib/format/access.ts
 * (defaults by email domain and client team, plus dashboard_grants).
 *
 * Read by every signed-in user, written by admins.
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { DashboardAccessConfig } from "../types/access.types";
import { normalizeDashboardAccess } from "../format/access";

const CONFIG_COLLECTION = "config";
const DASHBOARD_ACCESS_DOC = "dashboard_access";

/**
 * Real-time config. A missing doc or a failed read reports nothing hidden,
 * never an error state.
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
