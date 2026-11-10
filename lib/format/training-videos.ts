// lib/format/training-videos.ts

/**
 * Which training videos a person gets on the How to page — pure, Firebase-free.
 *
 * Forecast videos (onboarding, copy and paste, Google Sheets, flags) are for
 * people who open the team spaces. The dashboard overview has one video per
 * access level; each person gets the smallest one that covers every tab they
 * can open (admins get all three, to review them):
 *   - agency:     Media Investments, Labs Pacing, Reports (company-email default)
 *   - leads:      + the Forecaster tab (client team or Forecaster grant)
 *   - leadership: + Exec KPI and MediaBox Adoption (Exec KPI grant)
 * Presentation only — the videos show screens, not data the person can query.
 */

import type { DashboardTabId } from "../types/access.types";

export type DashboardVideoLevel = "agency" | "leads" | "leadership";

export const DASHBOARD_VIDEO_LEVELS: readonly DashboardVideoLevel[] = ["agency", "leads", "leadership"];

export interface TrainingAudience {
  isAdmin: boolean;
  hasTeamSpaces: boolean;
  openTabs: readonly DashboardTabId[];
}

/** The forecast videos are useful only to people who can open the forecast. */
export function seesForecastVideos(a: TrainingAudience): boolean {
  return a.isAdmin || a.hasTeamSpaces;
}

/** The dashboard overview video(s) to show, smallest level that covers the person's tabs. */
export function dashboardVideoLevels(a: TrainingAudience): DashboardVideoLevel[] {
  if (a.isAdmin) return [...DASHBOARD_VIDEO_LEVELS];
  const open = new Set(a.openTabs);
  // MediaBox Adoption alone doesn't make someone leadership: MediaBox
  // allocations open it too, so only the Exec KPI grant decides.
  if (open.has("exec-kpis")) return ["leadership"];
  if (open.has("forecaster") || a.hasTeamSpaces) return ["leads"];
  if (open.size > 0) return ["agency"];
  return [];
}
