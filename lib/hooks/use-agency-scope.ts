// lib/hooks/use-agency-scope.ts

import { useMemo } from "react";
import { useAccess, useDashboardTab } from "./use-access";
import { agencyScopeKey, type AgencyScope } from "../format/agency-scope";

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
  const resolved = tab ? access.tabAgencyScope(tab) : access.readable;
  const key = agencyScopeKey(resolved);
  // Re-memoize on the key so consumers get a referentially stable object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => resolved, [key]);
  return { scope, key, loading: access.loading };
}

/**
 * Where per-client agency-tagged docs (mo_kpi_by_client, keyed by client id)
 * (and per-client rows: mediaocean_investment_mix, social_partner_mix) come
 * from on the current dashboard tab: the tab's agency scope (`scope`, as
 * useAgencyScope) and the clients read one by one (`clientIds`,
 * tabClientIds in lib/format/access.ts — a non-admin's team clients on the
 * Forecaster tab; their allocated clients on an allocation tab while MediaBox
 * allocations are on). The rules let them read those clients' data whatever
 * the agency. `key` changes only when either does.
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
  const ids = tab ? access.tabClientIds(tab) : null;
  // "" (none) vs "ids:…" (a list, possibly empty) — one key covers both.
  const idsKey = ids ? `ids:${ids.join("|")}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clientIds = useMemo(() => ids, [idsKey]);
  return {
    scope,
    clientIds,
    key: ids ? `${scopeKey}+${idsKey}` : scopeKey,
    loading,
  };
}
