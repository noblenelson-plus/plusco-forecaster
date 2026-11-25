// lib/format/training-videos.ts

/**
 * Which training videos a person gets on the How to page — pure, Firebase-free.
 *
 * Forecast videos (onboarding, copy and paste, Google Sheets, flags) are for
 * people who open the team spaces. The dashboard has one video per dashboard
 * (Adriana, 2026-11-24); each person gets the videos of the dashboards they can
 * open (admins get all of them, to review them):
 *   - forecaster:  the Forecaster tab (client team or Forecaster grant)
 *   - labs-pacing: Labs Pacing
 *   - exec-kpis:   Exec KPI Dashboard
 *   - mediaocean:  Media Investments Report + Reports (Raw Data Download)
 *   - mediabox:    MediaBox Adoption
 * Presentation only — the videos show screens, not data the person can query.
 */

import type { DashboardTabId } from "../types/access.types";

export type DashboardVideoId = "forecaster" | "labs-pacing" | "exec-kpis" | "mediaocean" | "mediabox";

/** Menu order: the dashboard tab order. */
export const DASHBOARD_VIDEO_IDS: readonly DashboardVideoId[] = [
  "forecaster",
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox",
];

export interface TrainingAudience {
  isAdmin: boolean;
  hasTeamSpaces: boolean;
  openTabs: readonly DashboardTabId[];
}

/** The forecast videos are useful only to people who can open the forecast. */
export function seesForecastVideos(a: TrainingAudience): boolean {
  return a.isAdmin || a.hasTeamSpaces;
}

/** The dashboard videos to show: one per dashboard the person can open. */
export function dashboardVideoIds(a: TrainingAudience): DashboardVideoId[] {
  if (a.isAdmin) return [...DASHBOARD_VIDEO_IDS];
  const open = new Set<DashboardTabId>(a.openTabs);
  const sees: Record<DashboardVideoId, boolean> = {
    forecaster: open.has("forecaster") || a.hasTeamSpaces,
    "labs-pacing": open.has("labs-pacing"),
    "exec-kpis": open.has("exec-kpis"),
    mediaocean: open.has("mediaocean") || open.has("reports"),
    mediabox: open.has("mediabox"),
  };
  return DASHBOARD_VIDEO_IDS.filter((id) => sees[id]);
}
