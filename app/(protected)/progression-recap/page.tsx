// app/(protected)/progression-recap/page.tsx
"use client";

/**
 * Milestones — a dashboard of the BL forecast validation for the globally
 * selected Year, for GMs and MDs:
 *
 *   Filters    Checkpoint (one milestone, defaults to the latest one due),
 *              GM Pod / Agency / Region / Business Lead, and the status at the
 *              checkpoint (multi-select). Always limited to the clients ACTIVE
 *              in the selected year (resolveClientStatus), test clients
 *              excluded — no status/tier filter.
 *   Section 1  Milestone tracking — status totals, breakdown by GM, clients
 *              left to validate (milestone-tracking-summary.tsx).
 *   Table      Every milestone per client (progression-recap-table.tsx).
 *   Section 2  Insights by flag type — the current flags of the checkpoint's
 *              RFQ by type / category, overall or by GM / Agency / Region
 *              (flag-insights-section.tsx). The flag filters (category, flag)
 *              only narrow this section and Section 3.
 *   Section 3  Flags by client — every current flag with its justification
 *              verbatim (flag-detail-table.tsx).
 *
 * Validation lives at the {client, year} level (no RFQ dimension). The "Re-run
 * check" batch (writable clients only) re-runs the selected checkpoint.
 * Accessible to every authenticated user (no admin guard).
 */

import { useMemo, useState } from "react";
import { Loader2, ClipboardCheck, MousePointerClick } from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import MilestoneFilters from "../../../components/progression/milestone-filters";
import MilestoneTrackingSummary from "../../../components/progression/milestone-tracking-summary";
import ProgressionRecapTable from "../../../components/progression/progression-recap-table";
import MilestoneBatchRunner from "../../../components/progression/milestone-batch-runner";
import FlagInsightsSection from "../../../components/progression/flag-insights-section";
import FlagDetailTable from "../../../components/progression/flag-detail-table";
import { useCheckpointFlags } from "../../../lib/hooks/use-checkpoint-flags";
import { resolveFlagTypes, type ClientFlags } from "../../../lib/format/flag-insights";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { useAccess } from "../../../lib/hooks/use-access";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../lib/dashboard/filters/use-dashboard-filters";
import type { FacetKey } from "../../../lib/dashboard/filters/filter.types";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useProgressionRecap } from "../../../lib/hooks/use-progression-recap";
import { filterWritableClients } from "../../../lib/services/assignment-service";
import { isTestClient, resolveClientStatus } from "../../../lib/format/client";
import { CLIENT_GM_PODS } from "../../../lib/constants/client.constants";
import { defaultCheckpointStep, stepById } from "../../../lib/constants/confirmation-steps";
import { statusAt, type MilestoneClientRow } from "../../../lib/format/milestone-summary";
import type { RfqValidationStatus } from "../../../lib/types/forecast-flags.types";

/** The client facets this page offers, in display order. */
const PAGE_FACETS: FacetKey[] = ["gmPods", "agencies", "regions", "businessLeads"];

const gmLabel = (v: string | undefined) =>
  v ? CLIENT_GM_PODS.find((g) => g.value === v)?.label ?? v : "";

export default function ProgressionRecapPage() {
  const { clients, loading: clientsLoading, error: clientsError } = useAccessibleClients();
  const { profile, isAdmin } = useUserProfile();
  const { editGrant } = useAccess();
  const usersMap = useUsersMap();
  const { selectedYear } = useForecastSelection();
  const year = selectedYear ?? new Date().getFullYear();

  // Bumped after a batch run to force the (one-shot) recap reads to reload.
  const [refreshKey, setRefreshKey] = useState(0);

  // Always the clients ACTIVE in the selected year (per-year status), test
  // clients excluded (same rule as the dashboard).
  const activeClients = useMemo(
    () =>
      clients.filter(
        (c) => resolveClientStatus(c, year) === "ACTIVE" && !isTestClient(c.CL_Name)
      ),
    [clients, year]
  );

  // Same cascading facet engine as the dashboard, shown for PAGE_FACETS only
  // (the hidden ones never get a selection, so they never filter).
  const {
    facetViews,
    filteredClients,
    filteredClientIds,
    hasActiveFilters: hasFacetFilters,
    reset: resetFacets,
  } = useDashboardFilters(activeClients, usersMap, year);
  const pageFacetViews = useMemo(
    () =>
      PAGE_FACETS.map((k) => facetViews.find((v) => v.key === k)).filter(
        (v): v is NonNullable<typeof v> => !!v
      ),
    [facetViews]
  );

  // Checkpoint: follows the year (latest milestone due) until the user picks one.
  const [pickedCheckpoint, setPickedCheckpoint] = useState<{ year: number; id: string } | null>(null);
  const checkpoint =
    (pickedCheckpoint?.year === year ? stepById(pickedCheckpoint.id) : undefined) ??
    defaultCheckpointStep(year);

  const [statuses, setStatuses] = useState<RfqValidationStatus[]>([]);
  const [flagCategories, setFlagCategories] = useState<string[]>([]);
  const [flagTypeIds, setFlagTypeIds] = useState<string[]>([]);
  const selectedFlagTypes = useMemo(
    () => resolveFlagTypes(flagCategories, flagTypeIds),
    [flagCategories, flagTypeIds]
  );

  const recap = useProgressionRecap({
    clientIds: filteredClientIds,
    year: selectedYear,
    refreshKey,
  });

  // Section 2 — current flags of the checkpoint's RFQ for the filtered clients.
  const checkpointFlags = useCheckpointFlags({
    clientIds: filteredClientIds,
    year: selectedYear,
    rfq: checkpoint.targetRfq,
    refreshKey,
  });
  const hasUsdClients = filteredClients.some((c) => c.CL_Currency === "USD");
  const clientFlags = useMemo<ClientFlags[]>(
    () =>
      filteredClients.map((c) => ({
        clientId: c.cl_id,
        clientName: c.CL_Name,
        gm: gmLabel(c.GM_Pod),
        agency: c.CL_Agency ?? "",
        region: c.CL_Business_Unit_Region ?? "",
        bl: c.CL_Business_Lead
          ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
          : "Unassigned",
        currency: c.CL_Currency ?? "CAD",
        toCad: c.CL_Currency === "USD" ? checkpointFlags.usdToCad ?? 1 : 1,
        flags: checkpointFlags.flagsByClient.get(c.cl_id) ?? [],
      })),
    [filteredClients, checkpointFlags, usersMap]
  );

  // The filtered clients the current user may WRITE to — the batch check writes
  // flags + validations, so it can only target the editable subset.
  const writableClientIds = useMemo(
    () =>
      filterWritableClients(filteredClients, profile, isAdmin, editGrant).map((c) => c.cl_id),
    [filteredClients, profile, isAdmin, editGrant]
  );

  // One row per filtered client (keeps the accessible-clients sort order).
  const rows = useMemo<MilestoneClientRow[]>(() => {
    const byClient = new Map(recap.rows.map((r) => [r.clientId, r]));
    return filteredClients.map((c) => ({
      clientId: c.cl_id,
      clientName: c.CL_Name,
      gm: gmLabel(c.GM_Pod),
      bl: c.CL_Business_Lead
        ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
        : "Unassigned",
      statusByStep: byClient.get(c.cl_id)?.statusByStep ?? {},
    }));
  }, [filteredClients, recap.rows, usersMap]);

  // Status chips narrow the table (status at the checkpoint).
  const tableRows = useMemo(
    () =>
      statuses.length === 0
        ? rows
        : rows.filter((r) => statuses.includes(statusAt(r, checkpoint.id))),
    [rows, statuses, checkpoint.id]
  );

  const hasActiveFilters =
    hasFacetFilters || statuses.length > 0 || flagCategories.length > 0 || flagTypeIds.length > 0;
  const resetAll = () => {
    resetFacets();
    setStatuses([]);
    setFlagCategories([]);
    setFlagTypeIds([]);
  };

  const contextReady = !!selectedYear;

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col">
      <header className="sticky top-0 z-30 bg-white">
        {/* Title + global Year selector + batch re-run */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-6 py-3">
          <span className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ClipboardCheck size={18} className="text-yellow-500" />
            Milestones
          </span>
          <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
          <ForecastSelectors orientation="horizontal" theme="light" fields={["year"]} />

          {writableClientIds.length > 0 && (
            <div className="ml-auto">
              <MilestoneBatchRunner
                writableClientIds={writableClientIds}
                year={selectedYear}
                step={checkpoint}
                onComplete={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          )}
        </div>

        <MilestoneFilters
          checkpointId={checkpoint.id}
          onCheckpointChange={(id) => setPickedCheckpoint({ year, id })}
          facetViews={pageFacetViews}
          statuses={statuses}
          onStatusesChange={setStatuses}
          shownCount={tableRows.length}
          activeCount={activeClients.length}
          year={selectedYear}
          hasActiveFilters={hasActiveFilters}
          onReset={resetAll}
          flagCategories={flagCategories}
          onFlagCategoriesChange={setFlagCategories}
          flagTypes={flagTypeIds}
          onFlagTypesChange={setFlagTypeIds}
        />
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 space-y-8 p-6">
        {clientsError ? (
          <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {clientsError}
          </div>
        ) : !contextReady ? (
          <div className="flex h-64 flex-col items-center justify-center border border-dashed border-gray-200 text-gray-400">
            <p className="mb-1 text-sm font-medium text-gray-500">Select a Year</p>
            <p className="flex items-center gap-1 text-xs">
              <MousePointerClick size={12} />
              Use the selector at the top of the page to load the milestones.
            </p>
          </div>
        ) : clientsLoading || recap.loading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : recap.error ? (
          <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {recap.error}
          </div>
        ) : activeClients.length === 0 ? (
          <div className="flex h-64 items-center justify-center border border-dashed border-gray-200 text-sm text-gray-400">
            No active clients for {selectedYear} in your scope.
          </div>
        ) : (
          <>
            <MilestoneTrackingSummary rows={rows} checkpoint={checkpoint} statuses={statuses} />
            <ProgressionRecapTable
              rows={tableRows}
              checkpointId={checkpoint.id}
              fileLabel={String(selectedYear)}
            />
            {checkpointFlags.error ? (
              <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
                {checkpointFlags.error}
              </div>
            ) : checkpointFlags.loading ? (
              <div className="flex h-40 items-center justify-center text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <FlagInsightsSection
                clients={clientFlags}
                activeClientCount={rows.length}
                types={selectedFlagTypes}
                checkpoint={checkpoint}
                year={year}
                missingUsdRate={hasUsdClients && checkpointFlags.usdToCad === undefined}
              />
            )}
            {!checkpointFlags.loading && !checkpointFlags.error && (
              <FlagDetailTable
                clients={clientFlags}
                types={selectedFlagTypes}
                checkpoint={checkpoint}
                year={year}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

