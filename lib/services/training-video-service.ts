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
 * Shape: { dashboard: { [videoId]: { en, fr: VideoFile } }, forecast: { [videoId]: … } }
 *   dashboard — one entry per dashboard (DASHBOARD_VIDEO_IDS). Older per-access-level
 *               entries (agency / leads / leadership) may still sit there; ignored.
 *   forecast  — forecast videos that show (masked) real data: PRIVATE_FORECAST_VIDEO_IDS.
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

export type VideoPair = { en: VideoFile; fr: VideoFile };

/** Forecast videos whose files are private (they show masked real data). */
export const PRIVATE_FORECAST_VIDEO_IDS = ["milestones"] as const;
export type PrivateForecastVideoId = (typeof PRIVATE_FORECAST_VIDEO_IDS)[number];

export interface PrivateVideoFiles {
  dashboard: Partial<Record<DashboardVideoId, VideoPair>>;
  forecast: Partial<Record<PrivateForecastVideoId, VideoPair>>;
}

function asFile(raw: unknown): VideoFile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.src !== "string" || typeof r.poster !== "string") return null;
  return { src: r.src, poster: r.poster, length: typeof r.length === "string" ? r.length : "" };
}

function asPair(raw: unknown): VideoPair | null {
  const entry = raw as Record<string, unknown> | undefined;
  const en = asFile(entry?.en);
  const fr = asFile(entry?.fr);
  return en && fr ? { en, fr } : null;
}

/** The private video files (empty until published). */
export async function fetchPrivateVideoFiles(): Promise<PrivateVideoFiles> {
  const snap = await getDoc(doc(db, "config", "training_videos"));
  const dashboard = (snap.data()?.dashboard ?? {}) as Record<string, unknown>;
  const forecast = (snap.data()?.forecast ?? {}) as Record<string, unknown>;
  const out: PrivateVideoFiles = { dashboard: {}, forecast: {} };
  for (const id of DASHBOARD_VIDEO_IDS) {
    const pair = asPair(dashboard[id]);
    if (pair) out.dashboard[id] = pair;
  }
  for (const id of PRIVATE_FORECAST_VIDEO_IDS) {
    const pair = asPair(forecast[id]);
    if (pair) out.forecast[id] = pair;
  }
  return out;
}
