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
 * The seven dashboard tabs, in tab-bar order. Ids match FORECASTER_TABS in
 * components/forecaster/forecaster-tabs.config.ts.
 *
 * Who sees a tab (lib/format/access.ts; mirrored by the security rules):
 *   - Forecaster: client-team members (their clients) + people granted it.
 *   - Media Investments, MediaBox Planner, Labs Pacing, Reports
 *     (AGENCY_DEFAULT_TABS): every company email, for the agencies its domain
 *     maps to (a company-wide domain such as pluscompany.com: every agency) +
 *     people granted it.
 *   - Exec KPI, MediaBox Adoption: only people granted it.
 *   - Admins: every tab, every client — hidden tabs included.
 */
export const DASHBOARD_TABS = [
  "forecaster",
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox-planner",
  "mediabox",
  "reports",
] as const;

export type DashboardTabId = (typeof DASHBOARD_TABS)[number];

/** Every tab but Forecaster (the Forecaster tab also follows client teams). */
export const GRANTABLE_DASHBOARDS = [
  "labs-pacing",
  "exec-kpis",
  "mediaocean",
  "mediabox-planner",
  "mediabox",
  "reports",
] as const;

export type GrantableDashboardId = (typeof GRANTABLE_DASHBOARDS)[number];

/** Tabs every company email sees for its own agency, with no grant. */
export const AGENCY_DEFAULT_TABS: readonly DashboardTabId[] = ["mediaocean", "mediabox-planner", "labs-pacing", "reports"];

/**
 * Tabs that follow MediaBox allocations once `config/mediabox_allocations` is
 * on: every non-admin sees the clients it is allocated to in MediaBox
 * (CL_MediaBox_Emails) — plus every client whose team it is on (BL, DL, GM
 * Pod, collaborator: nobody loses their own clients) — instead of its whole
 * agency. Company-wide domains (pluscompany.com) included: a wider view comes
 * from grants, which still add on top. MediaBox Adoption opens for
 * allocated people too (otherwise it is grants only). On Media Investments and
 * MediaBox Planner the rows follow too: they are read by client (`_clientId`)
 * instead of by agency, and the Reports files come filtered to their clients
 * (the report-file route, lib/server/report-access.ts).
 */
export const ALLOCATION_TABS: readonly DashboardTabId[] = [
  "labs-pacing",
  "mediabox",
  "mediaocean",
  "mediabox-planner",
  "reports",
];

/**
 * The admins who get "View as" on the dashboard (lowercase emails). They must
 * also be admins — the preview relies on admin reads. Presentation only: it
 * shows nothing beyond what an admin may already read.
 */
export const VIEW_AS_EMAILS: readonly string[] = [
  "noble.nelson@pluscompany.com",
  "tristan.b-parent@pluscompany.com",
  "adriana.novoa@pluscompany.com",
];

/** `config/mediabox_allocations` — the allocations switch. */
export interface MediaboxAllocationsConfig {
  /** On for everyone. */
  enabled: boolean;
  /** On for these emails only (lowercase) — to try it before `enabled`. */
  pilotEmails: string[];
}

/**
 * Tabs a grant may name specific clients on. Media Investments, MediaBox
 * Planner and Reports are excluded: their data is split by agency, so a client
 * can't be isolated there — they take agency × region grants only.
 */
export const CLIENT_GRANT_TABS: readonly DashboardTabId[] = [
  "forecaster",
  "labs-pacing",
  "exec-kpis",
  "mediabox",
];

/**
 * A grant's scope on one tab, one of two kinds:
 *   - a rule: the clients of the chosen agencies × regions (`all…` = every
 *     one, including those added later) — new matching clients are included
 *     automatically;
 *   - specific clients (`clients`, on CLIENT_GRANT_TABS only), with the rule
 *     left empty (no agencies, no regions).
 * Agency-tagged data (Media Investments, Reports) follows the rule's agencies
 * only — specific clients never open agency data.
 */
export interface GrantScope {
  allAgencies: boolean;
  /** CL_Agency values; used when `allAgencies` is false. */
  agencies: string[];
  allRegions: boolean;
  /** CL_Business_Unit_Region values; used when `allRegions` is false. */
  regions: string[];
  /** Specific client ids (cl_id) — the "specific clients" kind of grant. */
  clients?: string[];
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
