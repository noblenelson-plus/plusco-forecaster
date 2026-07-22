// app/(protected)/forecaster/page.tsx
"use client";

/**
 * Forecaster — read-only comparison dashboard (Looker replica).
 * A CAD/USD view toggle sits in the header: CAD keeps every client (converted
 * to CAD, the default). USD narrows the scope to USD clients and shows their
 * native FO_Value (no conversion) by passing a rate of 1 — so the whole
 * dashboard reports in pure USD for the USD-client review meeting.
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

  // View currency: CAD (default) or USD (USD clients only, native values).
  const [viewCurrency, setViewCurrency] = useState<Currency>("CAD");

  const { facetViews, filteredClientIds, totalAccessible, hasActiveFilters, reset } =
    useDashboardFilters(clients, usersMap, selectedYear ?? new Date().getFullYear());

  const currencyByClient = useMemo(
    () =>
      Object.fromEntries(
        clients.map((c) => [c.cl_id, c.CL_Currency ?? "CAD"])
      ) as Record<string, Currency>,
    [clients]
  );

  // In USD mode, narrow the scope to USD clients only.
  const scopedClientIds = useMemo(
    () =>
      viewCurrency === "USD"
        ? filteredClientIds.filter((id) => currencyByClient[id] === "USD")
        : filteredClientIds,
    [viewCurrency, filteredClientIds, currencyByClient]
  );

  const scope = useMemo<DashboardScope>(
    () => ({ clientIds: scopedClientIds, year: selectedYear, rfq: selectedRFQ }),
    [scopedClientIds, selectedYear, selectedRFQ]
  );
  const comparisonScope = useMemo<DashboardScope>(
    () => ({ clientIds: scopedClientIds, year: comparisonYear, rfq: comparisonRFQ }),
    [scopedClientIds, comparisonYear, comparisonRFQ]
  );

  const rates = useCurrencyRates();
  // USD mode: rate = 1 (no conversion → native USD). CAD mode: the year's rate.
  const usdToCad = useMemo(
    () => (viewCurrency === "USD" ? 1 : selectedYear ? getCurrencyRateForYear(rates, selectedYear) : undefined),
    [viewCurrency, rates, selectedYear]
  );
  const comparisonUsdToCad = useMemo(
    () => (viewCurrency === "USD" ? 1 : comparisonYear ? getCurrencyRateForYear(rates, comparisonYear) : undefined),
    [viewCurrency, rates, comparisonYear]
  );

  const [selMonths, setSelMonths] = useState<number[]>([]);
  const [tab, setTab] = useState<ForecasterTab>("media-labs");

  const forecastData = useScopeForecastData(scope, currencyByClient, usdToCad, selMonths);
  const comparisonData = useScopeForecastData(comparisonScope, currencyByClient, comparisonUsdToCad, selMonths);

  const activeLabel = FORECASTER_TABS.find((t) => t.id === tab)?.label ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-20 flex flex-col bg-white">
        <div className="relative">
          <DashboardContextBar
            usdToCad={usdToCad}
            usdClientCount={forecastData.usdClientCount}
            missingRate={forecastData.missingRate}
            months={selMonths}
            onMonthsChange={setSelMonths}
          />
          {/* Forecaster-only CAD / USD view toggle. */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
              {(["CAD", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setViewCurrency(c)}
                  className={`px-3 py-1.5 transition-colors ${
                    viewCurrency === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DashboardFilterBar
          facetViews={facetViews}
          filteredCount={scopedClientIds.length}
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
        ) : scopedClientIds.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            {viewCurrency === "USD"
              ? "No USD clients are in scope for this selection."
              : "No clients are available for your account yet."}
          </div>
        ) : forecastData.error ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {forecastData.error}
          </div>
        ) : tab === "media-labs" ? (
        <MediaLabsTab data={forecastData} comparisonData={comparisonData} scopedClientIds={scopedClientIds} />  
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            {activeLabel} — coming soon
          </div>
        )}
      </main>
    </div>
  );
}