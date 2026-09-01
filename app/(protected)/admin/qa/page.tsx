// app/(protected)/admin/qa/page.tsx
"use client";

/**
 * Admin QA page — runs the data-consistency checks over the filtered client
 * scope for the globally selected Year + RFQ. Reuses the dashboard's data
 * pipeline (per-client, CAD-normalized) and its faceted filter bar (agency,
 * pod, region, office, tier, status, business lead, client).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import ForecastSelectors from "../../../../components/_shared/forecast-selectors";
import MultiSelectDropdown from "../../../../components/_shared/multi-select-dropdown";
import QaChecksPanel from "../../../../components/qa/qa-checks-panel";
import TotalsReconciliationPanel from "../../../../components/qa/totals-reconciliation-panel";
import DashboardFilterBar from "../../../../components/dashboard/filters/dashboard-filter-bar";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useAccessibleClients } from "../../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../../lib/dashboard/filters/use-dashboard-filters";
import { useForecastSelection } from "../../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../../lib/stores/comparison-selection.store";
import { useCurrencyRates } from "../../../../lib/hooks/use-currency-rates";
import { getCurrencyRateForYear } from "../../../../lib/services/currency-service";
import { useScopeForecastData } from "../../../../lib/dashboard/data/use-scope-forecast-data";
import { isTestClient } from "../../../../lib/format/client";
import type { DashboardScope } from "../../../../lib/dashboard/widgets/widget.types";
import type { Currency } from "../../../../lib/types/client.types";

const MONTH_OPTIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].map((label, i) => ({ value: String(i + 1), label }));

export default function AdminQaPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  // Guard — redirect non-admins (client-side UX only, like other admin pages).
  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  const { clients: allClients, loading: clientsLoading, error } = useAccessibleClients();
  // Test clients are excluded here too, exactly as the dashboard does (shared
  // isTestClient), so the reconciliation scope matches the dashboard's and their
  // totals agree. They remain available in the Forecast editing grid.
  const clients = useMemo(
    () => allClients.filter((c) => !isTestClient(c.CL_Name)),
    [allClients]
  );
  const usersMap = useUsersMap();
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const {
    comparisonYear,
    comparisonRFQ,
    setComparisonYear,
    setComparisonRFQ,
  } = useComparisonSelection();

  // Same faceted, cascading filter bar as the dashboard — the checks run on
  // the clients passing every active facet. Status resolves per year.
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

  const scope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: selectedYear, rfq: selectedRFQ }),
    [filteredClientIds, selectedYear, selectedRFQ]
  );

  // Same CAD-normalization convention as the dashboard: USD clients convert
  // with the selected year's admin-managed rate.
  const rates = useCurrencyRates();
  const usdToCad = useMemo(
    () => (selectedYear ? getCurrencyRateForYear(rates, selectedYear) : undefined),
    [rates, selectedYear]
  );
  const currencyByClient = useMemo(
    () =>
      Object.fromEntries(
        clients.map((c) => [c.cl_id, c.CL_Currency ?? "CAD"])
      ) as Record<string, Currency>,
    [clients]
  );

  // Month filter — restricts every check to the ticked months (values outside
  // the selection are masked to zero, so the checks skip them). Empty = all 12.
  const [selMonths, setSelMonths] = useState<number[]>([]);

  const data = useScopeForecastData(scope, currencyByClient, usdToCad, selMonths);

  // Comparison scope — its own Year + RFQ (may differ from the primary, e.g.
  // RFQ0 · 2027 base vs RFQ3 · 2026), so it uses the comparison year's own rate.
  const comparisonUsdToCad = useMemo(
    () => (comparisonYear ? getCurrencyRateForYear(rates, comparisonYear) : undefined),
    [rates, comparisonYear]
  );
  const comparisonScope = useMemo<DashboardScope>(
    () => ({ clientIds: filteredClientIds, year: comparisonYear, rfq: comparisonRFQ }),
    [filteredClientIds, comparisonYear, comparisonRFQ]
  );
  const comparisonData = useScopeForecastData(
    comparisonScope,
    currencyByClient,
    comparisonUsdToCad,
    selMonths
  );

  const primaryLabel = selectedRFQ ? `${selectedRFQ.type} · ${selectedYear}` : "Primary";
  const comparisonLabel = comparisonRFQ
    ? `${comparisonRFQ.type} · ${comparisonYear}`
    : "Comparison";

  const [qaTab, setQaTab] = useState<"reconcile" | "checks">("reconcile");

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.CL_Name])),
    [clients]
  );

  // Selected year's commission rates per client — the reference side of the
  // "Commission matches media forecast" check (rates are %, currency-neutral).
  const commissionRatesByClient = useMemo(
    () =>
      Object.fromEntries(
        clients.map((c) => [
          c.cl_id,
          selectedYear ? c.commissionsConfig?.[selectedYear] : undefined,
        ])
      ),
    [clients, selectedYear]
  );

  if (profileLoading || !isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      {/* Sticky header stack — page title + selectors, then the filter bar
          (same pattern as the dashboard's header). */}
      <header className="sticky top-14 lg:top-0 z-20 flex flex-col bg-white">
        {/* PageHeader and the filter bar are both sticky z-10, so the later
            sibling paints on top — this wrapper lifts the Year/RFQ dropdowns
            above the filter bar. */}
        <div className="relative z-20">
          <PageHeader
            title="QA"
            description="Data-consistency checks across the filtered clients for the selected Year + RFQ. All amounts in CAD."
            actions={
              <>
                <ForecastSelectors
                  orientation="horizontal"
                  theme="light"
                  fields={["year", "rfq"]}
                />
                <MultiSelectDropdown
                  label="Months"
                  options={MONTH_OPTIONS}
                  selectedValues={selMonths.map(String)}
                  onChange={(vals) => setSelMonths(vals.map(Number))}
                />
              </>
            }
          />
        </div>
        <DashboardFilterBar
          facetViews={facetViews}
          filteredCount={filteredClientIds.length}
          totalAccessible={totalAccessible}
          hasActiveFilters={hasActiveFilters}
          onReset={reset}
        />
      </header>
      <main className="mx-auto w-full max-w-[1700px] flex-1 p-6 md:p-8">
        {error ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {error}
          </div>
        ) : clientsLoading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : totalAccessible === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            No clients are available for your account yet.
          </div>
        ) : data.error ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {data.error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sub-tab strip — Reconciliation (attestation) vs the existing
                consistency checks (violation cards). */}
            <div className="flex items-center gap-1 border-b border-gray-200">
              {([
                { id: "reconcile", label: "Reconciliation" },
                { id: "checks", label: "Consistency checks" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setQaTab(t.id)}
                  className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    qaTab === t.id
                      ? "border-primary text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {qaTab === "reconcile" ? (
              <div className="space-y-4">
                {/* Both sides pick their own Year + RFQ, so any base RFQ can be
                    reconciled against any comparison (e.g. RFQ0 · 2027 vs RFQ3 · 2026). */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Primary</span>
                    <ForecastSelectors
                      orientation="horizontal"
                      theme="light"
                      fields={["year", "rfq"]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Compare to</span>
                    <ForecastSelectors
                      orientation="horizontal"
                      theme="light"
                      fields={["year", "rfq"]}
                      override={{
                        year: comparisonYear,
                        rfq: comparisonRFQ,
                        setYear: setComparisonYear,
                        setRFQ: setComparisonRFQ,
                      }}
                    />
                  </div>
                </div>
                <TotalsReconciliationPanel
                  primary={data}
                  comparison={comparisonData}
                  scopedClientIds={filteredClientIds}
                  clientNameById={clientNameById}
                  primaryLabel={primaryLabel}
                  comparisonLabel={comparisonLabel}
                />
              </div>
            ) : (
              <QaChecksPanel
                data={data}
                clientNameById={clientNameById}
                commissionRatesByClient={commissionRatesByClient}
                rfqLocked={selectedRFQ?.status === "LOCKED"}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}