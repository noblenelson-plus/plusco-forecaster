// lib/services/local-media-proxy-service.ts

/**
 * Firestore service — `config/local_media_proxies`: how Exec KPI → Local Media
 * splits each channel's HYBRID dollars into local / foreign, per year
 * (`{years: {"2026": {OOH: {local, source, note}}}, updatedAt, updatedBy}`).
 * Read by every signed-in user, written by admins (config/* rules). Years not
 * saved yet fall back to DEFAULT_LOCAL_MEDIA_PROXIES.
 */

import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import {
  DEFAULT_LOCAL_MEDIA_PROXIES,
  type LocalMediaProxies,
  type LocalMediaProxy,
} from "../format/local-media";

const REF = () => doc(db, "config", "local_media_proxies");

function normalize(raw: unknown): LocalMediaProxies {
  const years = (raw as { years?: unknown } | null)?.years;
  const out: LocalMediaProxies = { ...DEFAULT_LOCAL_MEDIA_PROXIES };
  if (!years || typeof years !== "object") return out;
  for (const [year, channels] of Object.entries(years as Record<string, unknown>)) {
    if (!channels || typeof channels !== "object") continue;
    const clean: Record<string, LocalMediaProxy> = {};
    for (const [channel, p] of Object.entries(channels as Record<string, unknown>)) {
      const v = p as Partial<LocalMediaProxy> | null;
      const local = Number(v?.local);
      if (!Number.isFinite(local) || local < 0 || local > 1) continue;
      clean[channel] = { local, source: String(v?.source ?? ""), ...(v?.note ? { note: String(v.note) } : {}) };
    }
    out[year] = clean;
  }
  return out;
}

/** Real-time proxies; a missing doc or a failed read gives the defaults. */
export function subscribeToLocalMediaProxies(callback: (p: LocalMediaProxies) => void): Unsubscribe {
  return onSnapshot(
    REF(),
    (snap) => callback(normalize(snap.data() ?? null)),
    (err) => {
      console.error("Local media proxies subscription failed:", err);
      callback(normalize(null));
    }
  );
}

/**
 * Saves one year's proxies (admin). Writes the whole doc (every year in
 * `current`, defaults included) rather than merging, because a merge would keep
 * a channel the admin just removed.
 */
export async function saveLocalMediaProxies(
  current: LocalMediaProxies,
  year: string,
  channels: Record<string, LocalMediaProxy>,
  by: string | null
): Promise<void> {
  await setDoc(REF(), {
    years: { ...current, [year]: channels },
    updatedAt: new Date().toISOString(),
    updatedBy: by ?? null,
  });
}
