// lib/hooks/use-access.tsx
"use client";

/**
 * The signed-in person's access, resolved once for the protected shell — see
 * lib/format/access.ts:
 *   - `hasTeamSpaces`: admin or on ≥1 client team → Forecast, Flags,
 *     Milestones, Clients and the Forecaster dashboard;
 *   - `openDashboards`: the grantable dashboards opened to them;
 *   - `hasAnyAccess`: either of the above (else "Access pending");
 *   - `teamClientIds`: the clients they are allocated to — what the Forecaster
 *     dashboard and the client-scoped dashboards (CLIENT_SCOPED_DASHBOARDS) show;
 *   - `ctx` / `scopeFor` / `readable`: the agency scope of agency-partitioned
 *     data (Mediaocean, Reports), and the union the rules let them read.
 * Presentation only — the security rules enforce the same model.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserProfile } from "./use-user-profile";
import { fetchAccessibleClients } from "../services/assignment-service";
import { subscribeToDashboardAccess } from "../services/dashboard-access-service";
import { fetchAgencies, fetchCompanyDomains } from "../services/agency-service";
import {
  dashboardScope,
  hiddenSubtabsFor,
  normalizeDashboardAccess,
  openDashboards as resolveOpenDashboards,
  readableScope,
  type AccessContext as AccessCtx,
  type DashboardScope,
} from "../format/access";
import type { DashboardAccessConfig, GrantableDashboardId } from "../types/access.types";

interface AccessState {
  loading: boolean;
  /** Clients whose team lists the person (0 for admins — they see all anyway). */
  teamClientCount: number;
  /** Their ids (empty for admins). Client-scoped dashboards show these. */
  teamClientIds: string[];
  dashboardAccess: DashboardAccessConfig;
  openDashboards: GrantableDashboardId[];
  hasTeamSpaces: boolean;
  hasAnyAccess: boolean;
  /** Everything lib/format/access.ts needs to resolve this person's access. */
  ctx: AccessCtx;
  /** Clients dashboard `id` shows; null when it isn't open to them. */
  scopeFor: (id: GrantableDashboardId) => DashboardScope | null;
  /** Union of every open dashboard's scope (what the rules let them read). */
  readable: DashboardScope;
  /** Sub-tab page ids hidden for them (none for admins). */
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
  const [team, setTeam] = useState<{ email: string; ids: string[] } | null>(null);
  const [mapping, setMapping] = useState<AgencyMapping | null>(null);

  // Subscribe once signed in (a signed-out read is denied and would stick).
  useEffect(() => {
    if (!email) return;
    return subscribeToDashboardAccess(setConfig);
  }, [email]);

  // The agency ↔ domain mapping, read live once per session (the rules read
  // the same docs). A failure leaves Agency-mode dashboards with no agency.
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
    const teamReady = isAdmin || disabled || team?.email === email;
    const teamClientIds = team?.email === email ? team.ids : [];
    const teamClientCount = teamClientIds.length;
    const ctx: AccessCtx = {
      email,
      isAdmin,
      disabled,
      agencyDomains: mapping?.agencyDomains ?? {},
      companyDomains: mapping?.companyDomains ?? [],
      dashboardAccess,
    };
    const open = resolveOpenDashboards(ctx);
    const hasTeamSpaces = !disabled && (isAdmin || teamClientCount > 0);
    return {
      loading: profileLoading || !config || !mapping || !teamReady,
      teamClientCount,
      teamClientIds,
      dashboardAccess,
      openDashboards: open,
      hasTeamSpaces,
      hasAnyAccess: hasTeamSpaces || open.length > 0,
      ctx,
      scopeFor: (id) => dashboardScope(ctx, id),
      readable: readableScope(ctx),
      hiddenSubtabs: hiddenSubtabsFor(ctx),
    };
  }, [config, mapping, team, email, isAdmin, disabled, profileLoading]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessState {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}

// ─── Per-dashboard scope ──────────────────────────────────────────────────────

const DashboardTabContext = createContext<GrantableDashboardId | null>(null);

/**
 * Marks the dashboard a subtree renders, so agency-partitioned data hooks
 * (useAgencyScope) read that dashboard's Global / Agency scope.
 */
export function DashboardTabScope({
  tab,
  children,
}: {
  tab: GrantableDashboardId | null;
  children: ReactNode;
}) {
  return <DashboardTabContext.Provider value={tab}>{children}</DashboardTabContext.Provider>;
}

/** The dashboard id set by the nearest DashboardTabScope (null outside one). */
export function useDashboardTab(): GrantableDashboardId | null {
  return useContext(DashboardTabContext);
}
