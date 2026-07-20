// filepath: app/(protected)/forecaster/page.tsx

"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/_shared/page-header";
import { ForecasterContextBar } from "./forecaster-context-bar";
import {
  DASHBOARD_TABS,
  type DashboardTab,
} from "@/components/dashboard/tabs/dashboard-tabs.config";
import MediaSpendTab from "@/components/dashboard/tabs/media-spend-tab";
import RevenueTab from "@/components/dashboard/tabs/revenue-tab";
import LabsTab from "@/components/dashboard/tabs/labs-tab";
import { useAccessibleClients } from "@/lib/hooks/use-accessible-clients";
import { useScopeForecastData } from "@/lib/dashboard/data/use-scope-forecast-data";
import { useForecastSelection } from "@/lib/stores/forecast-selection.store";
import type { DashboardScope } from "@/lib/dashboard/widgets/widget.types";
import type { Client } from "@/lib/types/client.types";
import type { RFQ } from "@/lib/types/rfq.types";
import { Loader2 } from "lucide-react";

function ForecasterDashboardShell() {
  const searchParams = useSearchParams();
  const defaultTabParam = (searchParams.get("tab") as DashboardTab) || "media";
  const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTabParam);

  // Global Context & Accessible Clients
  const { clients, loading: clientsLoading, error: clientsError } = useAccessibleClients();
  const { selectedYear, selectedRFQ } = useForecastSelection();

  // Primary Selection States
  const [primaryYear, setPrimaryYear] = useState<string>(
    selectedYear ? String(selectedYear) : "2026"
  );
  const [primaryRfq, setPrimaryRfq] = useState<string>(
    selectedRFQ ? selectedRFQ.type : "RFQ1"
  );
  const [primaryType, setPrimaryType] = useState<string>("Bottom Line");

  // Comparison / Benchmark Selection States
  const [comparisonYear, setComparisonYear] = useState<string>("2025");
  const [comparisonRfq, setComparisonRfq] = useState<string>("RFQ4");
  const [comparisonType, setComparisonType] = useState<string>("Official");

  // Derive client scope and fetch primary forecast data
  const clientIds = useMemo(
    () => clients.map((c: Client) => c.cl_id),
    [clients]
  );

  const scope = useMemo<DashboardScope>(
    () => ({
      clientIds,
      year: selectedYear,
      rfq: selectedRFQ,
    }),
    [clientIds, selectedYear, selectedRFQ]
  );

  const forecastData = useScopeForecastData(scope);

  // Derive comparison scope and fetch benchmark data
  const comparisonScope = useMemo<DashboardScope>(
    () => ({
      clientIds,
      year: comparisonYear ? Number(comparisonYear) : null,
      rfq: comparisonRfq ? ({ type: comparisonRfq } as RFQ) : null,
    }),
    [clientIds, comparisonYear, comparisonRfq]
  );

  const comparisonData = useScopeForecastData(comparisonScope);

  const clientNameById = useMemo<Record<string, string>>(
    () => Object.fromEntries(clients.map((c: Client) => [c.cl_id, c.CL_Name])),
    [clients]
  );

  const fileLabel =
    selectedYear && selectedRFQ ? `${selectedYear}-${selectedRFQ.type}` : undefined;

  const mediabox = useMemo(() => ({}), []);
  const clientDimensions = useMemo(() => ({}), []);

  const tabProps = {
    data: forecastData,
    comparisonData,
    mediabox: mediabox as any,
    clientNameById,
    clientDimensions: clientDimensions as any,
    fileLabel,
  };

  const renderActiveTabContent = () => {
    if (clientsError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {clientsError}
        </div>
      );
    }

    if (clientsLoading) {
      return (
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

    switch (activeTab) {
      case "media":
        return <MediaSpendTab {...tabProps} />;
      case "revenue":
        return <RevenueTab {...tabProps} />;
      case "labs":
        return <LabsTab {...tabProps} />;
      default:
        return (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
            View for this tab is under construction.
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PageHeader title="Forecaster 2.0" />

      {/* Interactive Context Controls */}
      <ForecasterContextBar
        primaryYear={primaryYear}
        onPrimaryYearChange={setPrimaryYear}
        primaryRfq={primaryRfq}
        onPrimaryRfqChange={setPrimaryRfq}
        primaryType={primaryType}
        onPrimaryTypeChange={setPrimaryType}
        comparisonYear={comparisonYear}
        onComparisonYearChange={setComparisonYear}
        comparisonRfq={comparisonRfq}
        onComparisonRfqChange={setComparisonRfq}
        comparisonType={comparisonType}
        onComparisonTypeChange={setComparisonType}
        showComparison={true}
      />

      {/* Main Workspace Navigation & Active Tab Slot */}
      <header className="flex flex-col border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1 border-b border-gray-200 px-6">
          {DASHBOARD_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-y-auto p-6 md:p-8">
        {renderActiveTabContent()}
      </main>
    </div>
  );
}

export default function ForecasterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center p-8 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading Forecaster...
        </div>
      }
    >
      <ForecasterDashboardShell />
    </Suspense>
  );
}