// lib/services/dashboard-pages-service.ts

/**
 * Firestore service — dashboard page access, a single doc
 * `config/dashboard_pages`:
 *   - `access: Record<pageId, UserRole[]>` — the roles an admin chose for each
 *     page they edited (pages absent keep their default roles);
 *   - `hidden: string[]` — the older all-or-nothing switch: pages no role
 *     sees. Still read, and written as the pages with no roles, so a page
 *     switched off before per-role access stays off.
 * See components/forecaster/dashboard-pages.config.ts for the page ids and how
 * access resolves.
 *
 * Read by every signed-in user, written by admins only (the existing
 * `config/{configId}` security rule).
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { UserRole } from "../types/user.types";

const CONFIG_COLLECTION = "config";
const DASHBOARD_PAGES_DOC = "dashboard_pages";
const ROLES: readonly UserRole[] = ["VIEWER", "BUSINESS_LEAD", "EXEC", "ADMIN"];

export interface DashboardPageSettings {
  hidden: string[];
  access: Record<string, UserRole[]>;
}

/**
 * Ids saved before the Forecaster Dashboard grouping, when Forecast Summary /
 * Revenue / Media Spend / Labs / Product were top-level tabs, mapped to their
 * sub-tab ids — so those pages keep their settings after the regroup. The next
 * admin save writes the new ids.
 */
const LEGACY_PAGE_IDS: Record<string, string> = {
  exec: "forecaster/exec",
  revenue: "forecaster/revenue",
  media: "forecaster/media",
  labs: "forecaster/labs",
  product: "forecaster/product",
};
const pageId = (id: string) => LEGACY_PAGE_IDS[id] ?? id;

function normalizeHidden(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((x): x is string => typeof x === "string" && x !== "").map(pageId);
  return [...new Set(ids)].sort();
}

function normalizeAccess(raw: unknown): Record<string, UserRole[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, UserRole[]> = {};
  for (const [id, roles] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !Array.isArray(roles)) continue;
    out[pageId(id)] = ROLES.filter((r) => roles.includes(r));
  }
  return out;
}

/**
 * Real-time page settings. On error it reports none (every page on its
 * default roles), so a failed read can never blank the dashboard.
 */
export function subscribeToDashboardPages(
  callback: (settings: DashboardPageSettings) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, CONFIG_COLLECTION, DASHBOARD_PAGES_DOC),
    (snapshot) =>
      callback({
        hidden: normalizeHidden(snapshot.data()?.hidden),
        access: normalizeAccess(snapshot.data()?.access),
      }),
    (err) => {
      console.error("Dashboard pages subscription failed:", err);
      callback({ hidden: [], access: {} });
    }
  );
}

/**
 * Replaces the page settings with the full role map (admin-only per the
 * security rules). `hidden` is derived — the pages no role sees.
 */
export async function saveDashboardPages(
  access: Record<string, UserRole[]>,
  userUid?: string
): Promise<void> {
  const clean = normalizeAccess(access);
  await setDoc(doc(db, CONFIG_COLLECTION, DASHBOARD_PAGES_DOC), {
    access: clean,
    hidden: Object.keys(clean).filter((id) => clean[id].length === 0).sort(),
    updatedAt: new Date().toISOString(),
    ...(userUid ? { updatedBy: userUid } : {}),
  });
}
