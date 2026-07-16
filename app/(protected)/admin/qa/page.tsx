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
import DashboardFilterBar from "../../../../components/dashboard/filters/dashboard-filter-bar";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useAccessibleClients } from "../../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../../../lib/dashboard/filters/use-dashboard-filters";
import { useForecastSelection } from "../../../../lib/stores/forecast-selection.store";
import { useCurrencyRates } from "../../../../lib/hooks/use-currency-rates";
import { getCurrencyRateForYear } from "../../../../lib/services/currency-service";
import { useScopeForecastData } from "../../../../lib/dashboard/data/use-scope-forecast-data";
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

  const { clients, loading: clientsLoading, error } = useAccessibleClients();
  const usersMap = useUsersMap();
  const { selectedYear, selectedRFQ } = useForecastSelection();

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
    <div className="flex min-h-screen flex-col bg-muted">
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
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {data.error}
          </div>
        ) : (
          <QaChecksPanel
            data={data}
            clientNameById={clientNameById}
            commissionRatesByClient={commissionRatesByClient}
            rfqLocked={selectedRFQ?.status === "LOCKED"}
          />
        )}
      </main>
    </div>
  );
}
