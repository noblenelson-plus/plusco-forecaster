// lib/types/access.types.ts

/**
 * The access model.
 *
 *   - `users/{email}`: one doc per person, keyed by lowercase email, role
 *     USER (default) or ADMIN. A row grants nothing by itself.
 *   - Client access comes from the client's team (CL_Team_Emails, see
 *     lib/format/client-team.ts) and gives the team spaces: Forecast, Flags,
 *     Milestones, Clients and the Forecaster dashboard.
 *   - Dashboard tabs: defaults by email domain and client team, plus
 *     per-person grants (`dashboard_grants/{email}`) — see DASHBOARD_TABS.
 *
 * Imported directly (not via the lib/types barrel).
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
 * The six dashboard tabs, in tab-bar order. Ids match FORECASTER_TABS in
 * components/forecaster/forecaster-tabs.config.ts.
 *
 * Who sees a tab (lib/format/access.ts; mirrored by the security rules):
 *   - Forecaster: client-team members (their clients) + people granted it.
 *   - Media Investments, Labs Pacing, Reports (AGENCY_DEFAULT_TABS): every
 *     company email, for the agencies its domain maps to (a company-wide
 *     domain such as pluscompany.com: every agency) + people granted it.
 *   - Exec KPI, MediaBox Adoption: only people granted it.
 *   - Admins: every tab, every client — hidden tabs included.
 */
export const DASHBOARD_TABS = [
  "forecaster",
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox",
  "reports",
] as const;

export type DashboardTabId = (typeof DASHBOARD_TABS)[number];

/** Every tab but Forecaster (the Forecaster tab also follows client teams). */
export const GRANTABLE_DASHBOARDS = [
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox",
  "reports",
] as const;

export type GrantableDashboardId = (typeof GRANTABLE_DASHBOARDS)[number];

/** Tabs every company email sees for its own agency, with no grant. */
export const AGENCY_DEFAULT_TABS: readonly DashboardTabId[] = ["mediaocean", "labs-pacing", "reports"];

/**
 * A grant's scope on one tab: the clients of the chosen agencies × regions
 * (`all…` = every one, including those added later). Being a rule rather
 * than a client list, new clients that match are included automatically.
 * Agency-tagged data (Media Investments, Reports) follows the agencies only.
 */
export interface GrantScope {
  allAgencies: boolean;
  /** CL_Agency values; used when `allAgencies` is false. */
  agencies: string[];
  allRegions: boolean;
  /** CL_Business_Unit_Region values; used when `allRegions` is false. */
  regions: string[];
  /**
   * Forecaster only: may also EDIT those clients in Forecast (like a client
   * team member). Other grants are read-only.
   */
  edit?: boolean;
}

/** `dashboard_grants/{email}` — one doc per granted person. */
export interface DashboardGrantDoc {
  /** Lowercase; equal to the doc id. */
  email: string;
  tabs: Partial<Record<DashboardTabId, GrantScope>>;
  updatedAt?: string;
  updatedBy?: string;
}

/** `config/dashboard_access` — dashboard tabs and sub-tabs hidden for everyone. */
export interface DashboardAccessConfig {
  /** Tab ids hidden from everyone, admins included. */
  hiddenTabs: string[];
  /**
   * Sub-tab page ids ("exec-kpis/meta") hidden from everyone, admins included —
   * work-in-progress pages. Any dashboard's sub-tabs, Forecaster's included.
   */
  hiddenSubtabs: string[];
}
