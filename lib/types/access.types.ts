// lib/types/access.types.ts

/**
 * Access model of the user & access rebuild (branch auth-rebuild).
 *
 *   - `users/{email}`: one doc per person, keyed by lowercase email, role
 *     USER (default) or ADMIN. A row grants nothing by itself.
 *   - Client access comes from the client's team (CL_Team_Emails, see
 *     lib/format/client-team.ts) and gives the team spaces: Forecast, Flags,
 *     Milestones, Clients and the Forecaster dashboard.
 *   - Every other dashboard is opened by `config/dashboard_access`: per
 *     dashboard a mode (GLOBAL = all clients, AGENCY = the viewer's agencies)
 *     and grants (email domains and/or people).
 *
 * Imported directly (not via the lib/types barrel) while the legacy
 * user.types.ts model still exists; the names differ from it on purpose.
 */

import type { Timestamp } from "firebase/firestore";

/** USER is the default; ADMIN is set by hand. */
export type AppRole = "USER" | "ADMIN";

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  USER: "User",
  ADMIN: "Admin",
};

/** `users/{email}` — the doc id is `email`. */
export interface UserRecord {
  /** Lowercase; equal to the doc id. */
  email: string;
  displayName: string | null;
  photoURL: string | null;
  /** Firebase Auth uid, filled on the first Google sign-in. */
  uid: string | null;
  role: AppRole;
  /** Null when added by an admin and never signed in. */
  lastLoginAt: Timestamp | null;
  createdAt: Timestamp | null;
  /** Email of the admin who added the person by hand; null for self sign-up. */
  createdBy: string | null;
  /** Soft revoke: the person keeps their row but gets no access. */
  disabled?: boolean | null;
}

// ─── Dashboard access ─────────────────────────────────────────────────────────

/**
 * Dashboards opened by `config/dashboard_access`. The Forecaster dashboard is
 * not one of them: it follows the client team (team members + admins).
 * Ids match FORECASTER_TABS in components/forecaster/forecaster-tabs.config.ts.
 */
export const GRANTABLE_DASHBOARDS = [
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox",
  "reports",
] as const;

export type GrantableDashboardId = (typeof GRANTABLE_DASHBOARDS)[number];

/** GLOBAL: every client. AGENCY: the clients of the viewer's agencies. */
export type DashboardMode = "GLOBAL" | "AGENCY";

export interface DashboardGrant {
  mode: DashboardMode;
  /** Lowercase email domains ("cossettemedia.com"). */
  domains: string[];
  /** Lowercase emails. */
  users: string[];
}

/** `config/dashboard_access`. */
export interface DashboardAccessConfig {
  dashboards: Record<GrantableDashboardId, DashboardGrant>;
  /**
   * Sub-tab page ids ("exec-kpis/meta") hidden from everyone but admins —
   * work-in-progress pages. Any dashboard's sub-tabs, Forecaster's included.
   */
  hiddenSubtabs: string[];
}
