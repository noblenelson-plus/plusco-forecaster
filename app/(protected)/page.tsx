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
import { useScopeMediaboxTotals } from "../../lib/dashboard/data/use-scope-mediabox-totals";
import { useCurrencyRates } from "../../lib/hooks/use-currency-rates";
import { getCurrencyRateForYear } from "../../lib/services/currency-service";
import type { ClientDimensions } from "../../components/dashboard/dimension-breakdown";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../lib/stores/comparison-selection.store";
import type { DashboardScope } from "../../lib/dashboard/widgets/widget.types";
import type { Currency } from "../../lib/types/client.types";

export default function DashboardPage() {
  const { clients, loading, error } = useAccessibleClients();
  const usersMap = useUsersMap();
  
  // Primary Context
  const { selectedYear, selectedRFQ } = useForecastSelection();
  
  // Comparison Context
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  // Status facet resolves per year — fallback to the current year when no
  // year is selected yet (same convention as the Clients page).
  const {
    facetViews,
    filteredClientIds,
    totalAccessible,
    hasActiveFilters,
    reset,
  } = useDashboardFilters(
    clients,
    usersMap,
    selectedYear ?? new Date().getFullYear()
  );

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

  // Currency normalization — every client's amounts are reported in CAD. USD
  // clients are converted with their year's admin-managed rate (primary and
  // comparison scopes can target different years).
  const rates = useCurrencyRates();
  const usdToCad = useMemo(
    () => (selectedYear ? getCurrencyRateForYear(rates, selectedYear) : undefined),
    [rates, selectedYear]
  );
  const comparisonUsdToCad = useMemo(
    () => (comparisonYear ? getCurrencyRateForYear(rates, comparisonYear) : undefined),
    [rates, comparisonYear]
  );
  const currencyByClient = useMemo(
    () =>
      Object.fromEntries(
        clients.map((c) => [c.cl_id, c.CL_Currency ?? "CAD"])
      ) as Record<string, Currency>,
    [clients]
  );

  // Month filter — restricts every aggregation (both scopes, so variances stay
  // apples-to-apples) to the selected months. Empty = all 12.
  const [selMonths, setSelMonths] = useState<number[]>([]);

  // Active analysis tab + the forecast data for both scopes. The data is
  // fetched once here (not per tab) so switching tabs doesn't refetch.
  const [tab, setTab] = useState<DashboardTab>("media");
  const forecastData = useScopeForecastData(
    scope,
    currencyByClient,
    usdToCad,
    selMonths
  );
  const comparisonData = useScopeForecastData(
    comparisonScope,
    currencyByClient,
    comparisonUsdToCad,
    selMonths
  );
  // MediaBox totals for the same scope — feeds the coverage card (Media tab).
  const mediaboxData = useScopeMediaboxTotals(scope, usdToCad, selMonths);

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.CL_Name])),
    [clients]
  );

  // Resolved display labels per client for the Region / Business Lead
  // breakdowns rendered on every tab (BL UIDs resolve through the users map).
  const clientDimensions = useMemo<ClientDimensions>(() => {
    const regionByClient: Record<string, string> = {};
    const businessLeadByClient: Record<string, string> = {};
    for (const c of clients) {
      regionByClient[c.cl_id] = c.CL_Business_Unit_Region || "No region";
      businessLeadByClient[c.cl_id] = c.CL_Business_Lead
        ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
        : "Unassigned";
    }
    return { regionByClient, businessLeadByClient };
  }, [clients, usersMap]);
  
  const fileLabel =
    selectedYear && selectedRFQ ? `${selectedYear}-${selectedRFQ.type}` : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-20 flex flex-col bg-white">
        <DashboardContextBar
          usdToCad={usdToCad}
          usdClientCount={forecastData.usdClientCount}
          missingRate={forecastData.missingRate}
          months={selMonths}
          onMonthsChange={setSelMonths}
        />
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
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
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
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {forecastData.error}
          </div>
        ) : tab === "media" ? (
          <MediaSpendTab
            data={forecastData}
            comparisonData={comparisonData}
            mediabox={mediaboxData}
            clientNameById={clientNameById}
            clientDimensions={clientDimensions}
            fileLabel={fileLabel}
          />
        ) : tab === "revenue" ? (
          <RevenueTab
            data={forecastData}
            comparisonData={comparisonData}
            clientNameById={clientNameById}
            clientDimensions={clientDimensions}
            fileLabel={fileLabel}
          />
        ) : (
          <LabsTab
            data={forecastData}
            comparisonData={comparisonData}
            clientNameById={clientNameById}
            clientDimensions={clientDimensions}
            fileLabel={fileLabel}
          />
        )}
      </main>
    </div>
  );
}