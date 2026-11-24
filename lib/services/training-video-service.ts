// lib/services/training-video-service.ts

/**
 * Firestore service — the private training video files, a single doc
 * `config/training_videos` (company users read, admins write; see the
 * `config` rule in firestoreRules.txt).
 *
 * Videos that show real dashboard data are not listed in the app's code: their
 * files sit under public/training/ with unguessable names, and only this doc —
 * readable after sign-in — says where they are. Written by
 * plusco-training/tools/publish-private.mjs.
 *
 * Shape: { dashboard: { [videoId]: { en: VideoFile, fr: VideoFile } } } — one
 * entry per dashboard (DASHBOARD_VIDEO_IDS). Older per-access-level entries
 * (agency / leads / leadership) may still sit in the doc; they are ignored.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DASHBOARD_VIDEO_IDS, type DashboardVideoId } from "../format/training-videos";

export interface VideoFile {
  src: string;
  poster: string;
  /** Duration label, e.g. "2:33". */
  length: string;
}

export type DashboardVideoFiles = Partial<Record<DashboardVideoId, { en: VideoFile; fr: VideoFile }>>;

function asFile(raw: unknown): VideoFile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.src !== "string" || typeof r.poster !== "string") return null;
  return { src: r.src, poster: r.poster, length: typeof r.length === "string" ? r.length : "" };
}

/** The dashboard video files by dashboard (empty until published). */
export async function fetchDashboardVideoFiles(): Promise<DashboardVideoFiles> {
  const snap = await getDoc(doc(db, "config", "training_videos"));
  const dashboard = (snap.data()?.dashboard ?? {}) as Record<string, unknown>;
  const out: DashboardVideoFiles = {};
  for (const id of DASHBOARD_VIDEO_IDS) {
    const entry = dashboard[id] as Record<string, unknown> | undefined;
    const en = asFile(entry?.en);
    const fr = asFile(entry?.fr);
    if (en && fr) out[id] = { en, fr };
  }
  return out;
}
