// lib/services/dashboard-pages-service.ts

/**
 * Firestore service — dashboard page visibility, a single doc
 * `config/dashboard_pages` holding `{ hidden: string[] }`: the ids of dashboard
 * tabs / sub-tabs an admin has hidden (see
 * components/forecaster/dashboard-pages.config.ts for the ids). Hidden pages
 * disappear for everyone, admins included; nothing is deleted.
 *
 * Read by every signed-in user, written by admins only (the existing
 * `config/{configId}` security rule).
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";

const CONFIG_COLLECTION = "config";
const DASHBOARD_PAGES_DOC = "dashboard_pages";

function normalizeHidden(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x !== ""))].sort();
}

/**
 * Real-time hidden page ids. On error it reports [] (show everything), so a
 * failed read can never blank the dashboard.
 */
export function subscribeToHiddenPages(
  callback: (hidden: string[]) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, CONFIG_COLLECTION, DASHBOARD_PAGES_DOC),
    (snapshot) => callback(normalizeHidden(snapshot.data()?.hidden)),
    (err) => {
      console.error("Dashboard pages subscription failed:", err);
      callback([]);
    }
  );
}

/** Replaces the hidden page list (admin-only per the security rules). */
export async function saveHiddenPages(hidden: string[], userUid?: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COLLECTION, DASHBOARD_PAGES_DOC), {
    hidden: normalizeHidden(hidden),
    updatedAt: new Date().toISOString(),
    ...(userUid ? { updatedBy: userUid } : {}),
  });
}
