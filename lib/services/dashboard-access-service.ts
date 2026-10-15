// lib/services/dashboard-access-service.ts

/**
 * Firestore service — `config/dashboard_access`: the dashboard tabs and
 * sub-tabs hidden from everyone, admins included (DashboardAccessConfig in
 * access.types.ts). Who may open each tab is resolved in lib/format/access.ts
 * (defaults by email domain and client team, plus dashboard_grants).
 *
 * Read by every signed-in user, written by admins.
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { DashboardAccessConfig, MediaboxAllocationsConfig } from "../types/access.types";
import { normalizeDashboardAccess } from "../format/access";
import { normalizeEmailList } from "../format/email";

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

// ─── MediaBox allocations switch ──────────────────────────────────────────────

/**
 * `config/mediabox_allocations` — `{enabled, pilotEmails}`: when on (for
 * everyone, or for the pilot emails only), the allocation tabs
 * (ALLOCATION_TABS) show agency emails only the clients they are allocated to
 * in MediaBox (CL_MediaBox_Emails) instead of their whole agency. Its own doc
 * so a hidden-pages save (which replaces config/dashboard_access) can never
 * reset it. The security rules read the same doc.
 */
const MEDIABOX_ALLOCATIONS_DOC = "mediabox_allocations";

function normalizeAllocations(raw: unknown): MediaboxAllocationsConfig {
  const d = raw as { enabled?: unknown; pilotEmails?: unknown } | null;
  const pilot = Array.isArray(d?.pilotEmails) ? (d.pilotEmails as unknown[]) : [];
  return {
    enabled: d?.enabled === true,
    pilotEmails: normalizeEmailList(pilot.filter((e): e is string => typeof e === "string")),
  };
}

/** Real-time switch. A missing doc or a failed read means off. */
export function subscribeToMediaboxAllocations(
  callback: (config: MediaboxAllocationsConfig) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, CONFIG_COLLECTION, MEDIABOX_ALLOCATIONS_DOC),
    (snapshot) => callback(normalizeAllocations(snapshot.data() ?? null)),
    (err) => {
      console.error("MediaBox allocations subscription failed:", err);
      callback(normalizeAllocations(null));
    }
  );
}

/** Saves the switch (admin). Pilot emails are normalized. */
export async function saveMediaboxAllocations(config: MediaboxAllocationsConfig, by: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COLLECTION, MEDIABOX_ALLOCATIONS_DOC), {
    ...normalizeAllocations(config),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  });
}
