// lib/services/dashboard-grants-service.ts

/**
 * Firestore service — `dashboard_grants/{email}`: the tabs an admin granted
 * one person, each with a scope (agencies × regions; Forecaster may also
 * allow editing). See GrantScope in access.types.ts and the resolution logic
 * in lib/format/access.ts; the security rules read the same doc.
 *
 * A person reads their own doc; admins read and write them all.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { DashboardGrantDoc } from "../types/access.types";
import { normalizeGrantTabs } from "../format/access";
import { normalizeEmail } from "../format/email";

const COLLECTION = "dashboard_grants";

/** Real-time own grants; a missing doc or a failed read reports none. */
export function subscribeToMyGrants(
  email: string,
  callback: (tabs: DashboardGrantDoc["tabs"]) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, normalizeEmail(email)),
    (snap) => callback(normalizeGrantTabs(snap.data()?.tabs)),
    (err) => {
      console.error("Dashboard grants subscription failed:", err);
      callback({});
    }
  );
}

/** Every grant (admin), sorted by email. */
export async function fetchAllGrants(): Promise<DashboardGrantDoc[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .map((d) => ({ email: d.id, tabs: normalizeGrantTabs(d.data().tabs), updatedAt: d.data().updatedAt, updatedBy: d.data().updatedBy }))
    .filter((g) => Object.keys(g.tabs).length > 0)
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Replaces one person's grants (admin); no tabs left → the doc is deleted. */
export async function saveGrant(email: string, tabs: DashboardGrantDoc["tabs"], updatedBy: string): Promise<void> {
  const id = normalizeEmail(email);
  const clean = normalizeGrantTabs(tabs);
  if (Object.keys(clean).length === 0) {
    await deleteDoc(doc(db, COLLECTION, id));
    return;
  }
  await setDoc(doc(db, COLLECTION, id), {
    email: id,
    tabs: clean,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeEmail(updatedBy),
  });
}

/** Writes many people's grants at once (sheet import); empty → deleted. */
export async function saveGrantsBatch(grants: DashboardGrantDoc[], updatedBy: string): Promise<void> {
  const now = new Date().toISOString();
  for (let start = 0; start < grants.length; start += 400) {
    const batch = writeBatch(db);
    for (const g of grants.slice(start, start + 400)) {
      const id = normalizeEmail(g.email);
      const clean = normalizeGrantTabs(g.tabs);
      if (Object.keys(clean).length === 0) batch.delete(doc(db, COLLECTION, id));
      else batch.set(doc(db, COLLECTION, id), { email: id, tabs: clean, updatedAt: now, updatedBy: normalizeEmail(updatedBy) });
    }
    await batch.commit();
  }
}
