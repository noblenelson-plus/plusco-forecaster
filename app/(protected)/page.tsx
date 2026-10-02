// app/(protected)/page.tsx
"use client";

/**
 * Dashboard — the app's home. A read-only comparison dashboard (Looker replica)
 * over the filtered client scope for the globally-selected Year + RFQ.
 * CAD/USD view toggle in the header (USD = USD clients, native values).
 * Revenue also exposes two BL/OF "Type" dropdowns: the primary Type applies to
 * the primary Year/RFQ, the secondary Type to the comparison (VS) Year/RFQ.
 * These are dashboard-local (the context bar is untouched).
 *
 * Clicking a client row focuses the page on that client: the charts and KPIs
 * re-read from a single-client scope while the tables keep every row, with the
 * focused one highlighted. Focus is shared across tabs and cleared by clicking
 * the same row again or the header chip.
 *
 * This page absorbed the former standalone Dashboard: its charts (monthly
 * trends, Labs recap, MediaBox coverage, Region / Business Lead breakdowns,
 * best/worst ratios, expected timings) now live inside the tabs below.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, Flag } from "lucide-react";
import DashboardContextBar from "../../components/dashboard/dashboard-context-bar";
import DashboardFilterBar from "../../components/dashboard/filters/dashboard-filter-bar";
import {
  FORECASTER_TABS,
  type ForecasterTab,
} from "../../components/forecaster/forecaster-tabs.config";
import ExecSummaryTab from "../../components/forecaster/tabs/exec-summary-tab";
import MediaSpendTab from "../../components/forecaster/tabs/media-spend-tab";
import LabsTab from "../../components/forecaster/tabs/labs-tab";
import RevenueTab from "../../components/forecaster/tabs/revenue-tab";
import ProductTab from "../../components/forecaster/tabs/product-tab";
import MediaboxTab from "../../components/forecaster/tabs/mediabox-tab";
import ClientNoteCard from "../../components/forecaster/sections/client-note-card";
import ReportsTabs from "../../components/forecaster/sections/reports-tabs";
import BillupsSection from "../../components/forecaster/sections/billups-section";
import ExecKpisTabs from "../../components/forecaster/sections/exec-kpis-tabs";
import MediaOceanTabs, { type MediaOceanSubTab } from "../../components/forecaster/sections/mediaocean-tabs";
import LabsPacingPage from "../../components/forecaster/sections/labs-pacing-page";
import SubTabBar from "../../components/forecaster/sub-tab-bar";
import {
  FORECASTER_SUBTABS,
  hiddenPagesForRole,
  isTabVisible,
  visibleSubtabs,
  type ForecasterSubTab,
} from "../../components/forecaster/dashboard-pages.config";
import { useDashboardPageSettings } from "../../lib/hooks/use-dashboard-page-settings";
import SectionScrollNav from "../../components/_shared/section-scroll-nav";
import FlagsDrawer from "../../components/flags/flags-drawer";
import { useScopeProductTracking } from "../../lib/dashboard/data/use-scope-product-tracking";
import { useProducts } from "../../lib/hooks/use-products";
import { useAccessibleClients } from "../../lib/hooks/use-accessible-clients";
import { useAgencyScope } from "../../lib/hooks/use-agency-scope";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import { useUsersMap } from "../../lib/hooks/use-users-map";
import { useDashboardFilters } from "../../lib/dashboard/filters/use-dashboard-filters";
import { useScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";
import { isTestClient } from "../../lib/format/client";
import { useScopeMediaboxTotals } from "../../lib/dashboard/data/use-scope-mediabox-totals";
import { useScopeFlags } from "../../lib/dashboard/data/use-scope-flags";
import { useCurrencyRates } from "../../lib/hooks/use-currency-rates";
import { getCurrencyRateForYear } from "../../lib/services/currency-service";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../lib/stores/comparison-selection.store";
import { subscribeToRFQs } from "../../lib/services/rfq-service";
import { pickDefaultSubmissions } from "../../lib/dashboard/default-submissions";
import type { ClientDimensions } from "../../components/dashboard/dimension-breakdown";
import type { RFQ } from "../../lib/types/rfq.types";
import type { DashboardScope } from "../../lib/dashboard/widgets/widget.types";
import type { Currency } from "../../lib/types/client.types";
import type { RevenueMode } from "../../lib/dashboard/data/use-scope-forecast-data";
import { allStreamKeys } from "../../components/forecaster/sections/revenue-types-data";

// Header Type options → the hook's RevenueMode.
const MODE_OPTIONS: { label: string; value: RevenueMode }[] = [
  { label: "BL", value: "blSubmission" },
  { label: "OF", value: "official" },
];

/** BL/OF segmented control for the Revenue tab's primary/secondary Type. */
function ModeToggle({
  value,
  onChange,
}: {
  value: RevenueMode;
  onChange: (m: RevenueMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px] font-semibold">
      {MODE_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2 py-1 transition-colors ${
            value === o.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Test clients are excluded from the dashboard only — they remain available in
 * the Forecast editing grid. A client counts as a test client when the word
 * "TEST" appears in its name as a standalone token, which catches names like
 * "1_TEST CLIENT" and "TEST CLIENT" while leaving real names such as "Contest"
 * or "Latest" untouched. Adjust TEST_CLIENT_PATTERN if the naming convention
 * differs.
 */
// isTestClient + TEST_CLIENT_PATTERN now live in lib/format/client.ts so the
// dashboard and the QA reconciliation share one definition (imported above).

export default function DashboardPage() {
  const { clients: allClients, loading, error } = useAccessibleClients();
  const { profile, isAdmin } = useUserProfile();
  const { scope: agencyScope } = useAgencyScope();
  // Top-level tab — declared up here because it picks the client universe.
  const [topTab, setTopTab] = useState<ForecasterTab>("forecaster");
  // Test clients are hidden from the dashboard only (they stay in the editing
  // grid). Filtering here removes them from every tab, chart, KPI and table,
  // since the whole dashboard scope derives from this list.
  const dashboardClients = useMemo(
    () => allClients.filter((c) => !isTestClient(c.CL_Name)),
    [allClients]
  );
  // Each tab group has its own client universe (presentation only — the
  // security rules still govern what can be read):
  //   - Forecaster Dashboard → the clients explicitly assigned to the user
  //     (Admin: all). Agency-wide access does not widen it.
  //   - Every other tab → the agencies the user's email domain maps to
  //     (Admin and company-wide domains: all), like the agency-partitioned
  //     Media Investments / Reports data.
  // The filter bar, forecast data and charts all derive from this list.
  const assignedClientIds = profile?.assignedClients;
  const clients = useMemo(() => {
    if (topTab === "forecaster") {
      if (isAdmin) return dashboardClients;
      const assigned = new Set(assignedClientIds ?? []);
      return dashboardClients.filter((c) => assigned.has(c.cl_id));
    }
    if (agencyScope.all) return dashboardClients;
    const agencies = new Set(agencyScope.agencies);
    return dashboardClients.filter((c) => agencies.has(c.CL_Agency));
  }, [topTab, isAdmin, assignedClientIds, agencyScope, dashboardClients]);
  const usersMap = useUsersMap();

  const { selectedYear, selectedRFQ, setRFQ } = useForecastSelection();
  const {
    comparisonYear,
    comparisonRFQ,
    setComparisonYear,
    setComparisonRFQ,
  } = useComparisonSelection();

  const [viewCurrency, setViewCurrency] = useState<Currency>("CAD");
  // BL/OF Type per side (Revenue only). Defaults match the common case.
  const [primaryMode, setPrimaryMode] = useState<RevenueMode>("blSubmission");
  const [secondaryMode, setSecondaryMode] = useState<RevenueMode>("official");
  const [focusedClientId, setFocusedClientId] = useState<string | null>(null);
  // Revenue-types filter selection (merged-commission keys). null until seeded
  // from the primary breakdown, then "all on".
  const [selectedStreams, setSelectedStreams] = useState<Set<string> | null>(null);

  // ─── Default Time & Context to the current submission ─────────────────────
  // Subscribe to the RFQ list (the same source the selectors use) so the
  // default can be derived from whichever submissions actually exist.
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);

  // Set the default Time & Context once the RFQ list has arrived. A reporting
  // dashboard should open on the latest submission, so we FORCE the current
  // submission on each mount rather than only filling an empty selection —
  // otherwise a previously-persisted (localStorage) primary would pin an older
  // round. Primary → current submission (latest year + highest round);
  // comparison → the round immediately before it. A manual change made after
  // mount still sticks, because the ref stops this from running again.
  const seededDefaultsRef = useRef(false);
  useEffect(() => {
    if (seededDefaultsRef.current || rfqs.length === 0) return;

    const { primary: current, comparison } = pickDefaultSubmissions(rfqs);

    if (current) {
      setRFQ(current); // also aligns the primary year
    }

    if (comparison) {
      setComparisonYear(comparison.year);
      setComparisonRFQ(comparison);
    } else {
      // No earlier round exists — clear any stale comparison.
      setComparisonYear(null);
    }

    seededDefaultsRef.current = true;
  }, [rfqs, setRFQ, setComparisonYear, setComparisonRFQ]);

  const currencyByClient = useMemo(
    () =>
      Object.fromEntries(
        clients.map((c) => [c.cl_id, c.CL_Currency ?? "CAD"])
      ) as Record<string, Currency>,
    [clients]
  );

  // Resolved display labels, computed once here and fed to the scope-wide
  // charts (MediaBox coverage, Region / Business Lead breakdowns, timings).
  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.CL_Name])),
    [clients]
  );
  const clientDimensions = useMemo<ClientDimensions>(() => {
    const regionByClient: Record<string, string> = {};
    const businessLeadByClient: Record<string, string> = {};
    const agencyRegionByClient: Record<string, string> = {};
    for (const c of clients) {
      regionByClient[c.cl_id] = c.CL_Business_Unit_Region || "No region";
      businessLeadByClient[c.cl_id] = c.CL_Business_Lead
        ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
        : "Unassigned";
      agencyRegionByClient[c.cl_id] =
        `${c.CL_Agency || "No agency"} ${c.CL_Business_Unit_Region || "No region"}`;
    }
    return { regionByClient, businessLeadByClient, agencyRegionByClient };
  }, [clients, usersMap]);

  // In USD mode, feed only USD clients into the (already dynamic) filter engine
  // so every dropdown cascades to USD clients — matching Looker's behavior.
  const currencyClients = useMemo(
    () => (viewCurrency === "USD" ? clients.filter((c) => (c.CL_Currency ?? "CAD") === "USD") : clients),
    [viewCurrency, clients]
  );

  const { facetViews, filteredClientIds, totalAccessible, hasActiveFilters, reset } =
    useDashboardFilters(currencyClients, usersMap, selectedYear ?? new Date().getFullYear());

  // Filters already run on the currency-scoped set, so this IS the final scope.
  const scopedClientIds = filteredClientIds;

  // A focused client that leaves the scope (filter change, CAD→USD) is ignored
  // rather than cleared, so the focus returns if the scope widens again.
  const activeFocusId = useMemo(
    () =>
      focusedClientId && scopedClientIds.includes(focusedClientId)
        ? focusedClientId
        : null,
    [focusedClientId, scopedClientIds]
  );

  const scope = useMemo<DashboardScope>(
    () => ({ clientIds: scopedClientIds, year: selectedYear, rfq: selectedRFQ }),
    [scopedClientIds, selectedYear, selectedRFQ]
  );
  const comparisonScope = useMemo<DashboardScope>(
    () => ({ clientIds: scopedClientIds, year: comparisonYear, rfq: comparisonRFQ }),
    [scopedClientIds, comparisonYear, comparisonRFQ]
  );

  // Single-client scopes. Empty while nothing is focused, which disables the
  // hook entirely — no reads until a row is actually clicked.
  const focusScope = useMemo<DashboardScope>(
    () => ({
      clientIds: activeFocusId ? [activeFocusId] : [],
      year: selectedYear,
      rfq: selectedRFQ,
    }),
    [activeFocusId, selectedYear, selectedRFQ]
  );
  const focusComparisonScope = useMemo<DashboardScope>(
    () => ({
      clientIds: activeFocusId ? [activeFocusId] : [],
      year: comparisonYear,
      rfq: comparisonRFQ,
    }),
    [activeFocusId, comparisonYear, comparisonRFQ]
  );

  const rates = useCurrencyRates();
  const usdToCad = useMemo(
    () => (viewCurrency === "USD" ? 1 : selectedYear ? getCurrencyRateForYear(rates, selectedYear) : undefined),
    [viewCurrency, rates, selectedYear]
  );
  const comparisonUsdToCad = useMemo(
    () => (viewCurrency === "USD" ? 1 : comparisonYear ? getCurrencyRateForYear(rates, comparisonYear) : undefined),
    [viewCurrency, rates, comparisonYear]
  );

  const [selMonths, setSelMonths] = useState<number[]>([]);
  // The sub-tab chosen inside the Forecaster Dashboard (top tab: see above).
  const [forecasterSub, setForecasterSub] = useState<ForecasterSubTab>("exec");
  const [mediaOceanSub, setMediaOceanSub] = useState<MediaOceanSubTab>("investments");
  // The pages this user's role does not see — the per-role access set in
  // Admin → Dashboard Pages, live. Until the profile loads, treat the user as a
  // Viewer (fewest pages) so nothing flashes that they may not see.
  const { settings: pageSettings } = useDashboardPageSettings();
  const hiddenPages = useMemo(
    () =>
      hiddenPagesForRole(
        profile?.role ?? "VIEWER",
        pageSettings.access,
        new Set(pageSettings.hidden)
      ),
    [profile?.role, pageSettings]
  );
  const visibleTabs = useMemo(
    () => FORECASTER_TABS.filter((t) => isTabVisible(t.id, hiddenPages)),
    [hiddenPages]
  );
  const forecasterSubtabs = useMemo(
    () => visibleSubtabs("forecaster", FORECASTER_SUBTABS, hiddenPages),
    [hiddenPages]
  );
  // If the active tab isn't visible for this role, fall back to the first tab
  // they can see. Wait for the profile to load first, else the
  // provisional Viewer view would bounce an admin off their tab.
  useEffect(() => {
    if (!profile) return;
    if (visibleTabs.length && !visibleTabs.some((t) => t.id === topTab)) {
      setTopTab(visibleTabs[0].id);
    }
  }, [profile, visibleTabs, topTab]);
  // A hidden / role-blocked sub-tab (e.g. a Viewer on the Summary) shows the
  // first visible one instead — derived, so the choice returns once allowed.
  const activeForecasterSub = forecasterSubtabs.some((t) => t.id === forecasterSub)
    ? forecasterSub
    : (forecasterSubtabs[0]?.id ?? forecasterSub);
  // The page on screen: a Forecaster Dashboard sub-tab, or the top-level tab.
  const tab: ForecasterSubTab | Exclude<ForecasterTab, "forecaster"> =
    topTab === "forecaster" ? activeForecasterSub : topTab;
  // Read-only flags drawer — available on the per-axis pages only.
  const [flagsOpen, setFlagsOpen] = useState(false);
  const isFlagView = (v: string) => v === "media" || v === "labs" || v === "revenue";
  const isFlagTab = isFlagView(tab);
  const flagAxis = tab === "labs" ? "labs" : tab === "revenue" ? "revenue" : "media";

  // Switch pages and close the flags drawer when leaving a per-axis page (it
  // has no meaning on Forecast Summary / Product / the other tabs).
  const selectTab = (id: ForecasterTab) => {
    setTopTab(id);
    if (!isFlagView(id === "forecaster" ? activeForecasterSub : id)) setFlagsOpen(false);
  };
  const selectForecasterSub = (id: ForecasterSubTab) => {
    setForecasterSub(id);
    if (!isFlagView(id)) setFlagsOpen(false);
  };

  const forecastData = useScopeForecastData(scope, currencyByClient, usdToCad, selMonths);
  const comparisonData = useScopeForecastData(comparisonScope, currencyByClient, comparisonUsdToCad, selMonths);
  // MediaBox totals for the same scope — feeds the coverage card (Media & Labs).
  const mediaboxData = useScopeMediaboxTotals(scope, usdToCad, selMonths);
  // Flags for the scope on the active axis — feeds the tab's Flags button
  // count and the read-only drawer. Only loads on the per-axis tabs.
  const scopeFlags = useScopeFlags(
    scopedClientIds,
    selectedYear,
    selectedRFQ?.type ?? null,
    flagAxis,
    clientNameById,
    isFlagTab
  );
  // Default the revenue-types filter to every stream. Derived, not an effect:
  // until the user changes it, the selection IS the full set for current data.
  const primaryStreamSlices = forecastData.revenueByMode.blSubmission.breakdown.byStream;
  const allStreams = useMemo(() => allStreamKeys(primaryStreamSlices), [primaryStreamSlices]);
  const activeStreams = selectedStreams ?? allStreams;
  const focusData = useScopeForecastData(focusScope, currencyByClient, usdToCad, selMonths);
  const focusComparisonData = useScopeForecastData(
    focusComparisonScope,
    currencyByClient,
    comparisonUsdToCad,
    selMonths
  );
  const productData = useScopeProductTracking(scopedClientIds);
  const { products, loading: productsLoading } = useProducts();

  const focusLoading = activeFocusId
    ? focusData.loading || focusComparisonData.loading
    : false;
  const focusedClientName = useMemo(
    () => clients.find((c) => c.cl_id === activeFocusId)?.CL_Name ?? activeFocusId ?? "",
    [clients, activeFocusId]
  );

  const activeLabel =
    [...FORECASTER_SUBTABS, ...FORECASTER_TABS].find((t) => t.id === tab)?.label ?? "";
  const showTypeControls = tab === "revenue";

  return (
    <div
      className={`flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted transition-[margin] duration-200 ease-in-out ${
        flagsOpen && isFlagTab ? "lg:mr-96" : ""
      }`}
    >
      <header className="sticky top-0 z-40 flex flex-col bg-white">
        <div className="relative">
          <DashboardContextBar
            usdToCad={usdToCad}
            usdClientCount={forecastData.usdClientCount}
            missingRate={forecastData.missingRate}
            months={selMonths}
            onMonthsChange={setSelMonths}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
              {(["CAD", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setViewCurrency(c)}
                  className={`px-3 py-1.5 transition-colors ${
                    viewCurrency === c ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue only: BL/OF Type per side. */}
        {showTypeControls && (
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50/60 px-6 py-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-gray-400">Type</span>
            <span className="text-gray-500">Primary</span>
            <ModeToggle value={primaryMode} onChange={setPrimaryMode} />
            <span className="mx-1 font-semibold uppercase tracking-wide text-gray-400">vs</span>
            <span className="text-gray-500">Secondary</span>
            <ModeToggle value={secondaryMode} onChange={setSecondaryMode} />
          </div>
        )}

        {(tab !== "mediaocean" || mediaOceanSub === "kpis" || mediaOceanSub === "investments") && (
          <DashboardFilterBar
            facetViews={facetViews}
            filteredCount={scopedClientIds.length}
            totalAccessible={totalAccessible}
            hasActiveFilters={hasActiveFilters}
            onReset={reset}
          />
        )}

        {activeFocusId && (
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50/60 px-6 py-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-gray-400">
              Focused
            </span>
            <button
              onClick={() => setFocusedClientId(null)}
              title="Clear focus"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-2 py-1 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {focusedClientName}
              <X size={12} />
            </button>
            <span className="text-gray-500">
              Charts and KPIs show this client only.
            </span>
            {focusLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
          </div>
        )}

        <div className="flex items-center gap-2 border-y border-purple-700 bg-purple-600 px-6">
          {/* Tabs scroll horizontally when the viewport is too narrow (high
              display scaling), so the Flags button on the right stays reachable
              instead of being pushed off-screen. */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = topTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTab(t.id)}
                  className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary text-white"
                      : "border-transparent text-white/70 hover:text-white"
                  }`}
                >
                  <Icon size={16} className={active ? "text-primary" : ""} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Read-only flags viewer — per-axis tabs only. Turns yellow with a
              count when the scope has flags still to justify. */}
          {isFlagTab && (
            <button
              onClick={() => setFlagsOpen((v) => !v)}
              title="View flags for the clients in scope"
              aria-pressed={flagsOpen}
              className={`flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-colors ${
                scopeFlags.unjustified > 0
                  ? "border-yellow-400 bg-yellow-400 text-gray-900 hover:bg-yellow-300"
                  : "border-white/30 text-white hover:bg-white/10"
              }`}
            >
              <Flag size={14} />
              Flags
              {scopeFlags.total > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    scopeFlags.unjustified > 0 ? "bg-gray-900 text-white" : "bg-white/20 text-white"
                  }`}
                >
                  {scopeFlags.total}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 p-6 md:p-8 lg:pr-16">
        {/* Forecaster sub-tabs. The other grouped tabs render their
            own bar inside their container. */}
        {topTab === "forecaster" && (
          <div className="mb-6">
            <SubTabBar
              tabs={forecasterSubtabs}
              active={activeForecasterSub}
              onSelect={selectForecasterSub}
            />
          </div>
        )}
        {/* Focused-client notes — the same submission note BLs edit on the
            Forecast page, shown for the primary Year/RFQ on Media & Labs and
            Revenue. Appears when a client is focused; closing clears focus. */}
        {activeFocusId &&
          selectedYear !== null &&
          selectedRFQ !== null &&
          (tab === "exec" || tab === "media" || tab === "labs" || tab === "revenue") && (
            <ClientNoteCard
              clientId={activeFocusId}
              clientName={focusedClientName}
              year={selectedYear}
              rfq={selectedRFQ.type}
              onClose={() => setFocusedClientId(null)}
            />
          )}
        {tab === "mediaocean" ? (
          <MediaOceanTabs
            sub={mediaOceanSub}
            onSubChange={setMediaOceanSub}
            scopedClientIds={scopedClientIds}
            clients={clients}
            year={selectedYear ?? new Date().getFullYear()}
            selMonths={selMonths}
            hidden={hiddenPages}
          />
        ) : tab === "labs-pacing" ? (
          <LabsPacingPage
            scopedClientIds={scopedClientIds}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
          />
        ) : tab === "exec-kpis" ? (
          <ExecKpisTabs
            forecastData={forecastData}
            comparisonData={comparisonData}
            clients={clients}
            usersMap={usersMap}
            scopedClientIds={scopedClientIds}
            year={selectedYear ?? new Date().getFullYear()}
            rfqLabel={selectedRFQ?.type ?? undefined}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
            hidden={hiddenPages}
          />
        ) : error ? (
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
              : topTab === "forecaster"
                ? "The Forecaster tab shows the clients assigned to you, and none are assigned yet."
                : "No clients are available for your account yet."}
          </div>
        ) : forecastData.error ? (
          <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {forecastData.error}
          </div>
        ) : tab === "exec" ? (
          <ExecSummaryTab
            data={forecastData}
            comparisonData={comparisonData}
            focusData={focusData}
            focusComparisonData={focusComparisonData}
            focusedClientId={activeFocusId}
            focusLoading={focusLoading}
            mediabox={mediaboxData}
            scopedClientIds={scopedClientIds}
            clientDimensions={clientDimensions}
            clientNameById={clientNameById}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
            selMonths={selMonths}
          />
        ) : tab === "media" ? (
          <MediaSpendTab
            data={forecastData}
            comparisonData={comparisonData}
            scopedClientIds={scopedClientIds}
            focusData={focusData}
            focusComparisonData={focusComparisonData}
            focusedClientId={activeFocusId}
            focusLoading={focusLoading}
            onFocusChange={setFocusedClientId}
            clientNameById={clientNameById}
          />
        ) : tab === "labs" ? (
          <LabsTab
            data={forecastData}
            comparisonData={comparisonData}
            scopedClientIds={scopedClientIds}
            focusData={focusData}
            focusComparisonData={focusComparisonData}
            focusedClientId={activeFocusId}
            focusLoading={focusLoading}
            onFocusChange={setFocusedClientId}
            clientNameById={clientNameById}
          />
        ) : tab === "revenue" ? (
          <RevenueTab
            data={forecastData}
            comparisonData={comparisonData}
            scopedClientIds={scopedClientIds}
            primaryMode={primaryMode}
            secondaryMode={secondaryMode}
            focusData={focusData}
            focusComparisonData={focusComparisonData}
            focusedClientId={activeFocusId}
            onFocusChange={setFocusedClientId}
            streamSlices={primaryStreamSlices}
            selectedStreams={activeStreams}
            onStreamsChange={setSelectedStreams}
            currencyByClient={currencyByClient}
            usdToCad={usdToCad}
            comparisonUsdToCad={comparisonUsdToCad}
            selMonths={selMonths}
            clientNameById={clientNameById}
            clientDimensions={clientDimensions}
          />
        ) : tab === "product" ? (
          <ProductTab
            productData={productData}
            products={products}
            productsLoading={productsLoading}
            scopedClientIds={scopedClientIds}
            clientNameById={clientNameById}
          />
        ) : tab === "mediabox" ? (
          <MediaboxTab
            data={forecastData}
            mediabox={mediaboxData}
            clientNameById={clientNameById}
          />
        ) : tab === "reports" ? (
          <ReportsTabs hidden={hiddenPages} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            {activeLabel} — coming soon
          </div>
        )}
      </main>

      {/* Right-edge section navigator — reads the `data-scroll-section`
          markers rendered by the active tab. */}
      <SectionScrollNav />

      {/* Read-only flags viewer for the clients in scope (per-axis tabs). */}
      <FlagsDrawer
        open={flagsOpen && isFlagTab}
        onClose={() => setFlagsOpen(false)}
        axis={flagAxis}
        year={selectedYear}
        rfq={selectedRFQ?.type ?? null}
        clientCount={scopedClientIds.length}
        data={scopeFlags}
        userNameById={usersMap}
      />
    </div>
  );
}
