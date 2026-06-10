// filepath: app/(protected)/page.tsx
"use client";

/**
 * Dashboard — visualizes forecast data (ratios / charts) aggregated across the
 * filtered client scope for the globally-selected Year + RFQ.
 *
 * Composition:
 * [Context bar]  Year · RFQ (global submission context)
 * [Filter bar]   dynamic, cascading multi-select facets → client scope
 * [Grid]         widgets from the registry, rendered against that scope
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashboardContextBar from "../../components/dashboard/dashboard-context-bar";
import DashboardFilterBar from "../../components/dashboard/filters/dashboard-filter-bar";
import {
  DASHBOARD_TABS,
  type DashboardTab,
} from "../../components/dashboard/tabs/dashboard-tabs.config";
import MediaSpendTab from "../../components/dashboard/tabs/media-spend-tab";
import RevenueTab from "../../components/dashboard/tabs/revenue-tab";
import LabsTab from "../../components/dashboard/tabs/labs-tab";
import { useAccessibleClients } from "../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../lib/dashboard/filters/use-dashboard-filters";
import { useScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../lib/stores/comparison-selection.store";
import type { DashboardScope } from "../../lib/dashboard/widgets/widget.types";

export default function DashboardPage() {
  const { clients, loading, error } = useAccessibleClients();
  const usersMap = useUsersMap();
  
  // Primary Context
  const { selectedYear, selectedRFQ } = useForecastSelection();
  
  // Comparison Context
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const {
    facetViews,
    filteredClientIds,
    totalAccessible,
    hasActiveFilters,
    reset,
  } = useDashboardFilters(clients, usersMap);

  // Primary Scope
  const scope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: selectedYear, rfq: selectedRFQ }),
    [filteredClientIds, selectedYear, selectedRFQ]
  );

  // Comparison Scope
  const comparisonScope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: comparisonYear, rfq: comparisonRFQ }),
    [filteredClientIds, comparisonYear, comparisonRFQ]
  );

  // Active analysis tab + the forecast data for both scopes. The data is
  // fetched once here (not per tab) so switching tabs doesn't refetch.
  const [tab, setTab] = useState<DashboardTab>("media");
  
  const forecastData = useScopeForecastData(scope);
  const comparisonData = useScopeForecastData(comparisonScope);

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.CL_Name])),
    [clients]
  );
  
  const fileLabel =
    selectedYear && selectedRFQ ? `${selectedYear}-${selectedRFQ.type}` : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-20 flex flex-col bg-white">
        <DashboardContextBar />
        <DashboardFilterBar
          facetViews={facetViews}
          filteredCount={filteredClientIds.length}
          totalAccessible={totalAccessible}
          hasActiveFilters={hasActiveFilters}
          onReset={reset}
        />

        {/* Analysis tabs — sit directly under the filters. */}
        <div className="flex items-center gap-1 border-b border-gray-200 px-6">
          {DASHBOARD_TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} className={active ? "text-primary" : ""} />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 p-6 md:p-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : loading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : totalAccessible === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            No clients are available for your account yet.
          </div>
        ) : forecastData.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {forecastData.error}
          </div>
        ) : tab === "media" ? (
          <MediaSpendTab
            data={forecastData}
            comparisonData={comparisonData}
            clientNameById={clientNameById}
            fileLabel={fileLabel}
          />
        ) : tab === "revenue" ? (
          <RevenueTab
            data={forecastData}
            comparisonData={comparisonData}
            clientNameById={clientNameById}
            fileLabel={fileLabel}
          />
        ) : (
          <LabsTab
            data={forecastData}
            comparisonData={comparisonData}
            clientNameById={clientNameById}
            fileLabel={fileLabel}
          />
        )}
      </main>
    </div>
  );
}