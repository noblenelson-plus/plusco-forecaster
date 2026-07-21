// app/(protected)/progression-recap/page.tsx
"use client";

/**
 * Progression and flag recap — a per-client table (one row per client) showing,
 * for the globally-selected Year + RFQ: the Business Lead, a ticked column for
 * each confirmation step, and the raised flags with their justifications.
 * Downloadable as CSV.
 *
 * Reuses the dashboard's client scope: the same accessible-clients set, the same
 * faceted filter bar, and the same global Year + RFQ selectors. Accessible to
 * every authenticated user (no admin guard).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ClipboardCheck, MousePointerClick } from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import DashboardFilterBar from "../../../components/dashboard/filters/dashboard-filter-bar";
import ProgressionRecapTable, {
  type RecapDisplayRow,
} from "../../../components/progression/progression-recap-table";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../lib/dashboard/filters/use-dashboard-filters";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useProgressionRecap } from "../../../lib/hooks/use-progression-recap";
import { subscribeToRFQs } from "../../../lib/services/rfq-service";
import { subscribeToLabsPartners } from "../../../lib/services/labs-partner-service";
import type { RFQ } from "../../../lib/types/rfq.types";
import type { LabsPartner } from "../../../lib/types/labs.types";

export default function ProgressionRecapPage() {
  const { clients, loading: clientsLoading, error: clientsError } = useAccessibleClients();
  const usersMap = useUsersMap();
  const { selectedYear, selectedRFQ } = useForecastSelection();

  // Same faceted filters as the dashboard.
  const {
    facetViews,
    filteredClients,
    filteredClientIds,
    totalAccessible,
    hasActiveFilters,
    reset,
  } = useDashboardFilters(clients, usersMap, selectedYear ?? new Date().getFullYear());

  // All RFQs — needed to resolve the previous submission for the flag engine.
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);
  const allRfqs = useMemo(
    () => rfqs.map((r) => ({ year: r.year, type: r.type })),
    [rfqs]
  );

  // Lab partners — resolve a labs flag's partnerId to a display name.
  const [labsPartners, setLabsPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setLabsPartners);
    return () => unsubscribe();
  }, []);
  const partnerLabel = useCallback(
    (partnerId: string) =>
      labsPartners.find((p) => p.partnerId === partnerId)?.name ?? partnerId,
    [labsPartners]
  );

  const recap = useProgressionRecap({
    clientIds: filteredClientIds,
    year: selectedYear,
    rfq: selectedRFQ,
    allRfqs,
    partnerLabel,
  });

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
          confirmed: r?.confirmed ?? new Set<string>(),
          flags: r?.flags ?? [],
          reviews: r?.reviews ?? {},
        };
      }),
    [filteredClients, recapByClient, usersMap]
  );

  const fileLabel =
    selectedYear && selectedRFQ ? `${selectedYear}-${selectedRFQ.type}` : undefined;
  const contextReady = !!selectedYear && !!selectedRFQ;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header — title + global Year/RFQ selectors */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <span className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ClipboardCheck size={18} className="text-yellow-500" />
            BL Forecast Validation - Flags
          </span>
          <div className="h-7 w-px bg-gray-200" aria-hidden="true" />
          <ForecastSelectors orientation="horizontal" theme="light" fields={["year", "rfq"]} />
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
            <p className="mb-1 text-sm font-medium text-gray-500">Select a Year and RFQ</p>
            <p className="flex items-center gap-1 text-xs">
              <MousePointerClick size={12} />
              Use the selectors at the top of the page to load the recap.
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
