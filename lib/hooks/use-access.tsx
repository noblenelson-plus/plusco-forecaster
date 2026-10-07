// lib/hooks/use-access.tsx
"use client";

/**
 * The signed-in person's access, resolved once for the protected shell (the
 * layout gate and the sidebar) — see lib/format/access.ts:
 *   - `hasTeamSpaces`: admin or on ≥1 client team → Forecast, Flags,
 *     Milestones, Clients and the Forecaster dashboard;
 *   - `openDashboards`: the grantable dashboards opened to them;
 *   - `hasAnyAccess`: either of the above (else "Access pending").
 * Presentation only — the security rules enforce the same model.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserProfile } from "./use-user-profile";
import { fetchAccessibleClients } from "../services/assignment-service";
import { subscribeToDashboardAccess } from "../services/dashboard-access-service";
import { normalizeDashboardAccess, openDashboards as resolveOpenDashboards } from "../format/access";
import type { DashboardAccessConfig, GrantableDashboardId } from "../types/access.types";

interface AccessState {
  loading: boolean;
  /** Clients whose team lists the person (0 for admins — they see all anyway). */
  teamClientCount: number;
  dashboardAccess: DashboardAccessConfig;
  openDashboards: GrantableDashboardId[];
  hasTeamSpaces: boolean;
  hasAnyAccess: boolean;
}

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin, email, loading: profileLoading } = useUserProfile();
  const disabled = !!profile?.disabled;
  const [config, setConfig] = useState<DashboardAccessConfig | null>(null);
  const [team, setTeam] = useState<{ email: string; count: number } | null>(null);

  // Subscribe once signed in (a signed-out read is denied and would stick).
  useEffect(() => {
    if (!email) return;
    return subscribeToDashboardAccess(setConfig);
  }, [email]);

  useEffect(() => {
    if (!email || isAdmin || disabled) return;
    let cancelled = false;
    fetchAccessibleClients({ email, disabled }, false)
      .then((clients) => {
        if (!cancelled) setTeam({ email, count: clients.length });
      })
      .catch((err) => {
        console.error("Failed to load team clients:", err);
        if (!cancelled) setTeam({ email, count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [email, isAdmin, disabled]);

  const value = useMemo<AccessState>(() => {
    const dashboardAccess = config ?? normalizeDashboardAccess(null);
    const teamReady = isAdmin || disabled || team?.email === email;
    const teamClientCount = team?.email === email ? team.count : 0;
    const open = resolveOpenDashboards({
      email,
      isAdmin,
      disabled,
      agencyDomains: {},
      companyDomains: [],
      dashboardAccess,
    });
    const hasTeamSpaces = !disabled && (isAdmin || teamClientCount > 0);
    return {
      loading: profileLoading || !config || !teamReady,
      teamClientCount,
      dashboardAccess,
      openDashboards: open,
      hasTeamSpaces,
      hasAnyAccess: hasTeamSpaces || open.length > 0,
    };
  }, [config, team, email, isAdmin, disabled, profileLoading]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessState {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}
