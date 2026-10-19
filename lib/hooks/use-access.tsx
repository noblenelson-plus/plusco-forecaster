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
 *     read; `canReadData`: whose data (forecast, MediaBox totals, …) they may
 *     load; `editGrant` / `editQueries`: the clients a grant lets them edit.
 *   - `mediaboxAllocations`: the allocations switch (config/mediabox_allocations)
 *     is on for them (for everyone, or as a pilot).
 * Presentation only — the security rules enforce the same model.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserProfile } from "./use-user-profile";
import { fetchAccessibleClients, fetchAllocatedClientIds } from "../services/assignment-service";
import { subscribeToDashboardAccess, subscribeToMediaboxAllocations } from "../services/dashboard-access-service";
import { subscribeToMyGrants } from "../services/dashboard-grants-service";
import { fetchUserRecord } from "../services/user-service";
import { fetchAgencies, fetchCompanyDomains } from "../services/agency-service";
import {
  canOpenTeamSpaces,
  canReadClient,
  editableClientQueries,
  editGrant as resolveEditGrant,
  hiddenPagesFor,
  normalizeDashboardAccess,
  openTabs as resolveOpenTabs,
  readableAgencyScope,
  readableClientQueries,
  tabAgencyScope,
  tabClientIds as resolveTabClientIds,
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
  MediaboxAllocationsConfig,
} from "../types/access.types";
import { normalizeEmail } from "../format/email";
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
  /** Whether they may load the client's data (rules: canReadClientData). */
  canReadData: (client: Client) => boolean;
  /** The MediaBox allocations switch is on. */
  mediaboxAllocations: boolean;
  /** Clients allocated to them in MediaBox (loaded only while the switch is on). */
  allocatedClientIds: string[];
  /** The allocations switch doc (null until loaded). */
  allocationsConfig: MediaboxAllocationsConfig | null;
  /** The agency ↔ domain mapping (null until loaded). */
  mapping: AgencyMapping | null;
  /** Set when an admin is previewing this person's dashboard (ViewAsProvider). */
  viewAs: string | null;
  /** Agency-tagged data a tab shows. */
  tabAgencyScope: (tab: DashboardTabId) => DashboardScope;
  /** Clients whose per-client rows a tab reads one by one, beyond its agency scope (null: none). */
  tabClientIds: (tab: DashboardTabId) => string[] | null;
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

/** A team client, as much as access needs (its MediaBox links decide the allocation tabs). */
type TeamClient = Pick<Client, "cl_id" | "CL_MediaBox_IDs">;

interface AgencyMapping {
  agencyDomains: Record<string, string[]>;
  companyDomains: string[];
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin, email, loading: profileLoading } = useUserProfile();
  const disabled = !!profile?.disabled;
  const [config, setConfig] = useState<DashboardAccessConfig | null>(null);
  const [grants, setGrants] = useState<{ email: string; tabs: DashboardGrantDoc["tabs"] } | null>(null);
  const [team, setTeam] = useState<{ email: string; clients: TeamClient[] } | null>(null);
  const [mapping, setMapping] = useState<AgencyMapping | null>(null);
  const [allocationsConfig, setAllocationsConfig] = useState<MediaboxAllocationsConfig | null>(null);
  // On for everyone, or for this person as a pilot (null until loaded).
  const allocations =
    allocationsConfig === null
      ? null
      : allocationsConfig.enabled || allocationsConfig.pilotEmails.includes(normalizeEmail(email));
  const [allocated, setAllocated] = useState<{ email: string; ids: string[] } | null>(null);

  // Subscribe once signed in (a signed-out read is denied and would stick).
  useEffect(() => {
    if (!email) return;
    return subscribeToDashboardAccess(setConfig);
  }, [email]);

  useEffect(() => {
    if (!email) return;
    return subscribeToMediaboxAllocations(setAllocationsConfig);
  }, [email]);

  // Their MediaBox allocations — only readable (and only needed) while the
  // switch is on. A failure leaves them with none.
  useEffect(() => {
    if (!email || isAdmin || disabled || !allocations) return;
    let cancelled = false;
    fetchAllocatedClientIds(email)
      .then((ids) => {
        if (!cancelled) setAllocated({ email, ids });
      })
      .catch((err) => {
        console.error("Failed to load MediaBox allocations:", err);
        if (!cancelled) setAllocated({ email, ids: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [email, isAdmin, disabled, allocations]);

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
        if (!cancelled) setTeam({ email, clients: clients.map((c) => ({ cl_id: c.cl_id, CL_MediaBox_IDs: c.CL_MediaBox_IDs })) });
      })
      .catch((err) => {
        console.error("Failed to load team clients:", err);
        if (!cancelled) setTeam({ email, clients: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [email, isAdmin, disabled]);

  const value = useMemo<AccessState>(
    () =>
      buildAccessState({
        email,
        isAdmin,
        disabled,
        config,
        mapping,
        allocationsConfig,
        grants: grants?.email === email ? grants.tabs : null,
        teamClients: isAdmin || disabled ? [] : team?.email === email ? team.clients : null,
        allocatedIds: allocated?.email === email ? allocated.ids : null,
        pending: profileLoading,
        viewAs: null,
      }),
    [config, grants, mapping, team, allocationsConfig, allocated, email, isAdmin, disabled, profileLoading]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** Everything one person's access is resolved from (null = still loading). */
interface AccessInputs {
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  config: DashboardAccessConfig | null;
  mapping: AgencyMapping | null;
  allocationsConfig: MediaboxAllocationsConfig | null;
  grants: DashboardGrantDoc["tabs"] | null;
  /** [] for admins / disabled (not needed). */
  teamClients: TeamClient[] | null;
  /** Only needed while allocations are on for them. */
  allocatedIds: string[] | null;
  /** Something else is still loading. */
  pending: boolean;
  /** Set when an admin previews this person's dashboard (ViewAsProvider). */
  viewAs: string | null;
}

/** The resolved access of one person — the signed-in one, or the one an admin views as. */
function buildAccessState(i: AccessInputs): AccessState {
  const dashboardAccess = i.config ?? normalizeDashboardAccess(null);
  const myGrants = i.grants ?? {};
  const teamClients = i.teamClients ?? [];
  const teamClientIds = teamClients.map((c) => c.cl_id).sort();
  const teamClientCount = teamClientIds.length;
  // On for everyone, or for this person as a pilot (unknown until loaded).
  const allocationsKnown = i.allocationsConfig !== null;
  const mediaboxAllocations =
    !!i.allocationsConfig &&
    (i.allocationsConfig.enabled || i.allocationsConfig.pilotEmails.includes(normalizeEmail(i.email)));
  const allocatedReady = i.isAdmin || i.disabled || !mediaboxAllocations || i.allocatedIds !== null;
  const allocatedClientIds = mediaboxAllocations ? i.allocatedIds ?? [] : [];
  const ctx: AccessCtx = {
    email: i.email,
    isAdmin: i.isAdmin,
    disabled: i.disabled,
    agencyDomains: i.mapping?.agencyDomains ?? {},
    companyDomains: i.mapping?.companyDomains ?? [],
    grants: myGrants,
    dashboardAccess,
    mediaboxAllocations,
  };
  const open = resolveOpenTabs(ctx, teamClientCount, allocatedClientIds.length);
  const hasTeamSpaces = canOpenTeamSpaces(ctx, teamClientCount);
  return {
    loading:
      i.pending ||
      !i.config ||
      !i.mapping ||
      i.teamClients === null ||
      !allocationsKnown ||
      !allocatedReady ||
      (!!i.email && i.grants === null),
    teamClientCount,
    teamClientIds,
    dashboardAccess,
    grants: myGrants,
    openTabs: open,
    hasTeamSpaces,
    hasAnyAccess: hasTeamSpaces || open.length > 0,
    ctx,
    tabCovers: (tab, client) => tabCoversClient(ctx, tab, client),
    canReadData: (client) => canReadClient(ctx, client),
    mediaboxAllocations,
    allocatedClientIds,
    allocationsConfig: i.allocationsConfig,
    mapping: i.mapping,
    viewAs: i.viewAs,
    tabAgencyScope: (tab) => tabAgencyScope(ctx, tab),
    tabClientIds: (tab) => resolveTabClientIds(ctx, tab, teamClients, allocatedClientIds),
    readable: readableAgencyScope(ctx),
    readableQueries: readableClientQueries(ctx),
    editGrant: resolveEditGrant(ctx),
    editQueries: editableClientQueries(ctx),
    hiddenSubtabs: hiddenPagesFor(ctx),
  };
}

// ─── View as (admin preview) ──────────────────────────────────────────────────

/**
 * Re-resolves access for `email` — the person an admin previews — for the
 * subtree (the dashboard): their tabs, client universe per tab, agency scope
 * and per-client reads, from their own users row, grants, team and MediaBox
 * allocations, with the same reference logic. The admin's own reads still
 * reach everything (admins may read it all), so what the subtree loads is
 * exactly that person's scope. Presentation only and dashboard-only: the
 * protected shell, team spaces and admin pages keep the admin's access.
 */
export function ViewAsProvider({ email, children }: { email: string; children: ReactNode }) {
  const outer = useAccess();
  const target = normalizeEmail(email);
  const [user, setUser] = useState<{ email: string; isAdmin: boolean; disabled: boolean; exists: boolean } | null>(null);
  const [grants, setGrants] = useState<{ email: string; tabs: DashboardGrantDoc["tabs"] } | null>(null);
  const [team, setTeam] = useState<{ email: string; clients: TeamClient[] } | null>(null);
  const [allocated, setAllocated] = useState<{ email: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    fetchUserRecord(target)
      .then((u) => {
        if (!cancelled)
          setUser({ email: target, isAdmin: u?.role === "ADMIN", disabled: !!u?.disabled, exists: !!u });
      })
      .catch(() => {
        if (!cancelled) setUser({ email: target, isAdmin: false, disabled: false, exists: false });
      });
    const unsubGrants = subscribeToMyGrants(target, (tabs) => setGrants({ email: target, tabs }));
    fetchAccessibleClients({ email: target, disabled: false }, false)
      .then((clients) => {
        if (!cancelled)
          setTeam({ email: target, clients: clients.map((c) => ({ cl_id: c.cl_id, CL_MediaBox_IDs: c.CL_MediaBox_IDs })) });
      })
      .catch(() => {
        if (!cancelled) setTeam({ email: target, clients: [] });
      });
    fetchAllocatedClientIds(target)
      .then((ids) => {
        if (!cancelled) setAllocated({ email: target, ids });
      })
      .catch(() => {
        if (!cancelled) setAllocated({ email: target, ids: [] });
      });
    return () => {
      cancelled = true;
      unsubGrants();
    };
  }, [target]);

  const value = useMemo<AccessState>(() => {
    const u = user?.email === target ? user : null;
    return buildAccessState({
      email: target,
      isAdmin: !!u?.isAdmin,
      disabled: !!u?.disabled,
      config: outer.dashboardAccess,
      mapping: outer.mapping,
      allocationsConfig: outer.allocationsConfig,
      grants: grants?.email === target ? grants.tabs : null,
      teamClients: team?.email === target ? team.clients : null,
      allocatedIds: allocated?.email === target ? allocated.ids : null,
      pending: outer.loading || !u,
      viewAs: target,
    });
  }, [outer.dashboardAccess, outer.mapping, outer.allocationsConfig, outer.loading, user, grants, team, allocated, target]);

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
