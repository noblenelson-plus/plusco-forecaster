// app/(protected)/forecaster/page.tsx
"use client";

/**
 * Forecaster — read-only comparison dashboard (Looker replica).
 * Shared header + filters + 3 tabs. Media & Labs is live; Revenue and Product
 * remain placeholders until their sections are built.
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashboardContextBar from "../../../components/dashboard/dashboard-context-bar";
import DashboardFilterBar from "../../../components/dashboard/filters/dashboard-filter-bar";
import {
  FORECASTER_TABS,
  type ForecasterTab,
} from "../../../components/forecaster/forecaster-tabs.config";
import MediaLabsTab from "../../../components/forecaster/tabs/media-labs-tab";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../lib/dashboard/filters/use-dashboard-filters";
import { useScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import { useCurrencyRates } from "../../../lib/hooks/use-currency-rates";
import { getCurrencyRateForYear } from "../../../lib/services/currency-service";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import type { DashboardScope } from "../../../lib/dashboard/widgets/widget.types";
import type { Currency } from "../../../lib/types/client.types";

export default function ForecasterPage() {
  const { clients, loading, error } = useAccessibleClients();
  const usersMap = useUsersMap();

  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const { facetViews, filteredClientIds, totalAccessible, hasActiveFilters, reset } =
    useDashboardFilters(clients, usersMap, selectedYear ?? new Date().getFullYear());

  const scope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: selectedYear, rfq: selectedRFQ }),
    [filteredClientIds, selectedYear, selectedRFQ]
  );
  const comparisonScope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: comparisonYear, rfq: comparisonRFQ }),
    [filteredClientIds, comparisonYear, comparisonRFQ]
  );

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

  const [selMonths, setSelMonths] = useState<number[]>([]);
  const [tab, setTab] = useState<ForecasterTab>("media-labs");

  const forecastData = useScopeForecastData(scope, currencyByClient, usdToCad, selMonths);
  const comparisonData = useScopeForecastData(
    comparisonScope,
    currencyByClient,
    comparisonUsdToCad,
    selMonths
  );

  const activeLabel = FORECASTER_TABS.find((t) => t.id === tab)?.label ?? "";

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

        <div className="flex items-center gap-1 border-b border-gray-200 px-6">
          {FORECASTER_TABS.map((t) => {
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
        ) : tab === "media-labs" ? (
          <MediaLabsTab data={forecastData} comparisonData={comparisonData} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            {activeLabel} — coming soon
          </div>
        )}
      </main>
    </div>
  );
}