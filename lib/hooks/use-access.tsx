// lib/hooks/use-access.tsx
"use client";

/**
 * The signed-in person's access, resolved once for the protected shell — see
 * lib/format/access.ts:
 *   - `hasTeamSpaces`: admin, on ≥1 client team, or a Forecaster edit grant
 *     → Forecast, Flags, Milestones, Clients;
 *   - `openTabs`: the dashboard tabs they see (hidden ones dropped);
 *   - `hasAnyAccess`: either of the above (else "Access pending");
 *   - `tabCovers` / `tabAgencyScope`: which clients and agency-tagged data
 *     each tab shows; `readable` / `readableQueries`: what the rules let them
 *     read; `editGrant` / `editQueries`: the clients a grant lets them edit.
 * Presentation only — the security rules enforce the same model.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserProfile } from "./use-user-profile";
import { fetchAccessibleClients } from "../services/assignment-service";
import { subscribeToDashboardAccess } from "../services/dashboard-access-service";
import { subscribeToMyGrants } from "../services/dashboard-grants-service";
import { fetchAgencies, fetchCompanyDomains } from "../services/agency-service";
import {
  canOpenTeamSpaces,
  editableClientQueries,
  editGrant as resolveEditGrant,
  hiddenPagesFor,
  normalizeDashboardAccess,
  openTabs as resolveOpenTabs,
  readableAgencyScope,
  readableClientQueries,
  tabAgencyScope,
  tabCoversClient,
  type AccessContext as AccessCtx,
  type ClientQuerySpec,
  type DashboardScope,
} from "../format/access";
import type {
  DashboardAccessConfig,
  DashboardGrantDoc,
  DashboardTabId,
  GrantScope,
} from "../types/access.types";
import type { Client } from "../types/client.types";

interface AccessState {
  loading: boolean;
  /** Clients whose team lists the person (0 for admins — they see all anyway). */
  teamClientCount: number;
  /** Their ids (empty for admins). */
  teamClientIds: string[];
  dashboardAccess: DashboardAccessConfig;
  /** The person's own grants. */
  grants: DashboardGrantDoc["tabs"];
  /** Dashboard tabs they see, in tab-bar order. */
  openTabs: DashboardTabId[];
  hasTeamSpaces: boolean;
  hasAnyAccess: boolean;
  /** Everything lib/format/access.ts needs to resolve this person's access. */
  ctx: AccessCtx;
  /** Whether a tab shows a client. */
  tabCovers: (tab: DashboardTabId, client: Client) => boolean;
  /** Agency-tagged data a tab shows. */
  tabAgencyScope: (tab: DashboardTabId) => DashboardScope;
  /** Agency-tagged data they may read on any tab. */
  readable: DashboardScope;
  /** `clients` queries (beyond the team's) loading everything they may read. */
  readableQueries: ClientQuerySpec[];
  /** The Forecaster grant that lets them edit, if any. */
  editGrant: GrantScope | null;
  /** `clients` queries for that grant (beyond the team's). */
  editQueries: ClientQuerySpec[];
  /** Tab and sub-tab page ids hidden for them (none for admins). */
  hiddenSubtabs: ReadonlySet<string>;
}

const AccessContext = createContext<AccessState | null>(null);

interface AgencyMapping {
  agencyDomains: Record<string, string[]>;
  companyDomains: string[];
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin, email, loading: profileLoading } = useUserProfile();
  const disabled = !!profile?.disabled;
  const [config, setConfig] = useState<DashboardAccessConfig | null>(null);
  const [grants, setGrants] = useState<{ email: string; tabs: DashboardGrantDoc["tabs"] } | null>(null);
  const [team, setTeam] = useState<{ email: string; ids: string[] } | null>(null);
  const [mapping, setMapping] = useState<AgencyMapping | null>(null);

  // Subscribe once signed in (a signed-out read is denied and would stick).
  useEffect(() => {
    if (!email) return;
    return subscribeToDashboardAccess(setConfig);
  }, [email]);

  useEffect(() => {
    if (!email) return;
    return subscribeToMyGrants(email, (tabs) => setGrants({ email, tabs }));
  }, [email]);

  // The agency ↔ domain mapping, read live once per session (the rules read
  // the same docs). A failure leaves the person with no agency.
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    Promise.all([fetchAgencies(), fetchCompanyDomains()])
      .then(([agencies, companyDomains]) => {
        if (cancelled) return;
        setMapping({
          agencyDomains: Object.fromEntries(agencies.map((a) => [a.name, a.domains ?? []])),
          companyDomains,
        });
      })
      .catch((err) => {
        console.error("Failed to load the agency mapping:", err);
        if (!cancelled) setMapping({ agencyDomains: {}, companyDomains: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    if (!email || isAdmin || disabled) return;
    let cancelled = false;
    fetchAccessibleClients({ email, disabled }, false)
      .then((clients) => {
        if (!cancelled) setTeam({ email, ids: clients.map((c) => c.cl_id).sort() });
      })
      .catch((err) => {
        console.error("Failed to load team clients:", err);
        if (!cancelled) setTeam({ email, ids: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [email, isAdmin, disabled]);

  const value = useMemo<AccessState>(() => {
    const dashboardAccess = config ?? normalizeDashboardAccess(null);
    const myGrants = grants?.email === email ? grants.tabs : {};
    const teamReady = isAdmin || disabled || team?.email === email;
    const teamClientIds = team?.email === email ? team.ids : [];
    const teamClientCount = teamClientIds.length;
    const ctx: AccessCtx = {
      email,
      isAdmin,
      disabled,
      agencyDomains: mapping?.agencyDomains ?? {},
      companyDomains: mapping?.companyDomains ?? [],
      grants: myGrants,
      dashboardAccess,
    };
    const open = resolveOpenTabs(ctx, teamClientCount);
    const hasTeamSpaces = canOpenTeamSpaces(ctx, teamClientCount);
    return {
      loading: profileLoading || !config || !mapping || !teamReady || (!!email && grants?.email !== email),
      teamClientCount,
      teamClientIds,
      dashboardAccess,
      grants: myGrants,
      openTabs: open,
      hasTeamSpaces,
      hasAnyAccess: hasTeamSpaces || open.length > 0,
      ctx,
      tabCovers: (tab, client) => tabCoversClient(ctx, tab, client),
      tabAgencyScope: (tab) => tabAgencyScope(ctx, tab),
      readable: readableAgencyScope(ctx),
      readableQueries: readableClientQueries(ctx),
      editGrant: resolveEditGrant(ctx),
      editQueries: editableClientQueries(ctx),
      hiddenSubtabs: hiddenPagesFor(ctx),
    };
  }, [config, grants, mapping, team, email, isAdmin, disabled, profileLoading]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessState {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}

// ─── Per-tab scope ────────────────────────────────────────────────────────────

const DashboardTabContext = createContext<DashboardTabId | null>(null);

/**
 * Marks the dashboard tab a subtree renders, so agency-tagged data hooks
 * (useAgencyScope, useDashboardDocScope) read that tab's scope.
 */
export function DashboardTabScope({
  tab,
  children,
}: {
  tab: DashboardTabId | null;
  children: ReactNode;
}) {
  return <DashboardTabContext.Provider value={tab}>{children}</DashboardTabContext.Provider>;
}

/** The tab set by the nearest DashboardTabScope (null outside one). */
export function useDashboardTab(): DashboardTabId | null {
  return useContext(DashboardTabContext);
}
