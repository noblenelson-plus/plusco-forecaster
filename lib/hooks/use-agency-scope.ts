// lib/hooks/use-agency-scope.ts

import { useMemo } from "react";
import { useAccess, useDashboardTab } from "./use-access";
import { isClientScopedDashboard } from "../format/access";
import { EMPTY_AGENCY_SCOPE, agencyScopeKey, type AgencyScope } from "../format/agency-scope";

/**
 * The agency scope for agency-partitioned data (MediaOcean collections,
 * Reports snapshots) — see lib/format/agency-scope.ts. Inside a dashboard tab
 * (DashboardTabScope) it is that dashboard's Global / Agency scope; elsewhere
 * the union of every dashboard open to the person. Resolved live from
 * config/dashboard_access and the agencies ↔ domains mapping (the rules read
 * the same docs). `key` changes only when the scope does, so it is safe as an
 * effect dependency.
 */
export function useAgencyScope(): {
  scope: AgencyScope;
  key: string;
  loading: boolean;
} {
  const access = useAccess();
  const tab = useDashboardTab();
  const resolved = tab ? (access.scopeFor(tab) ?? EMPTY_AGENCY_SCOPE) : access.readable;
  const key = agencyScopeKey(resolved);
  // Re-memoize on the key so consumers get a referentially stable object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => resolved, [key]);
  return { scope, key, loading: access.loading };
}

/**
 * Where per-client agency-tagged docs (mo_kpi_by_client, keyed by client id)
 * come from on the current dashboard:
 *   - `clientIds` set → a client-scoped dashboard viewed by a non-admin: read
 *     exactly those clients' docs (the rules let a team member get their own
 *     client's doc, whatever its agency);
 *   - `clientIds` null → the agency scope (`scope`), as useAgencyScope.
 * `key` changes only when either does.
 */
export function useDashboardDocScope(): {
  scope: AgencyScope;
  clientIds: string[] | null;
  key: string;
  loading: boolean;
} {
  const access = useAccess();
  const tab = useDashboardTab();
  const { scope, key: scopeKey, loading } = useAgencyScope();
  const byClient = !access.ctx.isAdmin && isClientScopedDashboard(tab);
  const idsKey = byClient ? access.teamClientIds.join("|") : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clientIds = useMemo(() => (byClient ? access.teamClientIds : null), [byClient, idsKey]);
  return {
    scope,
    clientIds,
    key: byClient ? `clients:${idsKey}` : scopeKey,
    loading,
  };
}
