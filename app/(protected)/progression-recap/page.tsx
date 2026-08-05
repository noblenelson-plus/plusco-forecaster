// app/(protected)/progression-recap/page.tsx
"use client";

/**
 * BL Forecast Validation — a per-client table (one row per client) showing, for
 * the globally-selected Year, the Business Lead and a ticked column for each
 * confirmation step. Validation lives at the {client, year} level (no RFQ
 * dimension). Downloadable as CSV.
 *
 * Reuses the dashboard's client scope: the same accessible-clients set, the same
 * faceted filter bar, and the same global Year selector. Accessible to every
 * authenticated user (no admin guard).
 */

import { useMemo, useState } from "react";
import { Loader2, ClipboardCheck, MousePointerClick } from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import DashboardFilterBar from "../../../components/dashboard/filters/dashboard-filter-bar";
import ProgressionRecapTable, {
  type RecapDisplayRow,
} from "../../../components/progression/progression-recap-table";
import MilestoneBatchRunner from "../../../components/progression/milestone-batch-runner";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../lib/dashboard/filters/use-dashboard-filters";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useProgressionRecap } from "../../../lib/hooks/use-progression-recap";
import { filterWritableClients } from "../../../lib/services/assignment-service";

export default function ProgressionRecapPage() {
  const { clients, loading: clientsLoading, error: clientsError } = useAccessibleClients();
  const { profile, isAdmin, permissions } = useUserProfile();
  const usersMap = useUsersMap();
  const { selectedYear } = useForecastSelection();

  // Bumped after a batch run to force the (one-shot) recap reads to reload.
  const [refreshKey, setRefreshKey] = useState(0);

  // Same faceted filters as the dashboard.
  const {
    facetViews,
    filteredClients,
    filteredClientIds,
    totalAccessible,
    hasActiveFilters,
    reset,
  } = useDashboardFilters(clients, usersMap, selectedYear ?? new Date().getFullYear());

  const recap = useProgressionRecap({
    clientIds: filteredClientIds,
    year: selectedYear,
    refreshKey,
  });

  // The filtered clients the current user may WRITE to — the batch check writes
  // flags + validations, so it can only target the editable subset (read scope
  // is broader). Read-only users (Viewers) get no runner.
  const writableClientIds = useMemo(
    () =>
      filterWritableClients(filteredClients, profile, isAdmin).map((c) => c.cl_id),
    [filteredClients, profile, isAdmin]
  );

  const recapByClient = useMemo(() => {
    const map = new Map(recap.rows.map((r) => [r.clientId, r]));
    return map;
  }, [recap.rows]);

  // One display row per filtered client (keeps the accessible-clients sort order).
  const displayRows = useMemo<RecapDisplayRow[]>(
    () =>
      filteredClients.map((c) => {
        const r = recapByClient.get(c.cl_id);
        return {
          clientId: c.cl_id,
          clientName: c.CL_Name,
          bl: c.CL_Business_Lead
            ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
            : "Unassigned",
          currency: c.CL_Currency ?? "CAD",
          statusByStep: r?.statusByStep ?? {},
        };
      }),
    [filteredClients, recapByClient, usersMap]
  );

  const fileLabel = selectedYear ? String(selectedYear) : undefined;
  const contextReady = !!selectedYear;

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col">
      {/* Header — title + global Year selector */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <span className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ClipboardCheck size={18} className="text-yellow-500" />
            Milestones
          </span>
          <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
          <ForecastSelectors orientation="horizontal" theme="light" fields={["year"]} />

          {/* Batch milestone check — run one step for every editable, filtered
              client at once. Only for users who can edit forecasts. */}
          {permissions.canEditForecast && (
            <>
              <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
              <MilestoneBatchRunner
                writableClientIds={writableClientIds}
                year={selectedYear}
                onComplete={() => setRefreshKey((k) => k + 1)}
              />
            </>
          )}
        </div>

        {/* Same faceted filter bar as the dashboard */}
        <DashboardFilterBar
          facetViews={facetViews}
          filteredCount={filteredClientIds.length}
          totalAccessible={totalAccessible}
          hasActiveFilters={hasActiveFilters}
          onReset={reset}
        />
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 p-6">
        {clientsError ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {clientsError}
          </div>
        ) : !contextReady ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 text-gray-400">
            <p className="mb-1 text-sm font-medium text-gray-500">Select a Year</p>
            <p className="flex items-center gap-1 text-xs">
              <MousePointerClick size={12} />
              Use the selector at the top of the page to load the recap.
            </p>
          </div>
        ) : clientsLoading || recap.loading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : recap.error ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {recap.error}
          </div>
        ) : totalAccessible === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            No clients are available for your account yet.
          </div>
        ) : (
          <ProgressionRecapTable rows={displayRows} fileLabel={fileLabel} />
        )}
      </main>
    </div>
  );
}
