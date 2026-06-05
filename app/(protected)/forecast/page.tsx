// app/(protected)/forecast/page.tsx
"use client";

/**
 * Unified forecast page — a single page with three switchable tabs
 * (Media Spend / Revenue / Labs), all powered by the same generic grid engine.
 *
 * Layout:
 *   [Context bar]  Client · Year · Submission selectors + comparison selector
 *   [Tabs]         Media Spend · Revenue · Labs (free switching)
 *   [Content]      the active axis grid (Media), or a "coming soon" placeholder
 *
 * The Client/Year/RFQ selectors used to live in the sidebar; they now sit at
 * the top of this page (the sidebar only keeps navigation). The comparison
 * selector, formerly inside the grid toolbar, also lives here and drives the
 * active grid.
 */

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  FlaskConical,
  MousePointerClick,
  GitCompareArrows,
  ChevronDown,
  Loader2,
} from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import ForecastGrid from "../../../components/forecaster/forecast-grid";
import ComparisonPanel from "../../../components/forecaster/comparison-panel";
import { useForecasterGrid } from "../../../lib/hooks/use-forecaster-grid";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { MEDIA_AXIS_CONFIG } from "../../../lib/types/forecaster.types";
import type { ComparisonSide } from "../../../lib/types/forecaster.types";
import { subscribeToRFQs, getRFQsForYear } from "../../../lib/services/rfq-service";
import type { RFQ, RFQType } from "../../../lib/types/rfq.types";

type Tab = "media" | "revenue" | "labs";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "labs", label: "Labs", icon: FlaskConical },
];

export default function ForecastPage() {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const [tab, setTab] = useState<Tab>("media");

  // Only the Media axis is implemented for now; Revenue & Labs are placeholders.
  const grid = useForecasterGrid(MEDIA_AXIS_CONFIG);

  // Comparison only applies to the active axis grid. Today that's Media only.
  const compareActive = tab === "media";

  // RFQs of the year — to feed the reference-RFQ selector (includes current).
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);

  const rfqOptions = useMemo(() => {
    if (!selectedYear || !selectedRFQ) return [];
    return getRFQsForYear(rfqs, selectedYear).map((r) => ({
      value: r.type,
      label: r.type === selectedRFQ.type ? `${r.type} (current)` : r.type,
    }));
  }, [rfqs, selectedYear, selectedRFQ]);

  // Picking a reference RFQ opens the live comparison panel beside the grid;
  // clearing closes it. The chosen side defaults to BL Input.
  function selectRefRfq(rfq: RFQType | null) {
    if (!rfq) {
      grid.setCompareRef(null);
      return;
    }
    grid.setCompareRef({ rfq, side: grid.compareRef?.side ?? "BL_INPUT" });
  }

  function selectRefSide(side: ComparisonSide) {
    if (!grid.compareRef) return;
    grid.setCompareRef({ rfq: grid.compareRef.rfq, side });
  }

  const hasComparison = compareActive && !!grid.compareRef;

  return (
    <div>
      {/* ─── Context bar — selectors + comparison ─── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <ForecastSelectors orientation="horizontal" theme="light" />

          <ComparisonSelector
            rfqOptions={rfqOptions}
            refRfq={compareActive ? grid.compareRef?.rfq ?? null : null}
            refSide={grid.compareRef?.side ?? "BL_INPUT"}
            onSelectRfq={selectRefRfq}
            onSelectSide={selectRefSide}
            actualsLabel={MEDIA_AXIS_CONFIG.actualsLabel}
            loading={compareActive && grid.referenceLoading}
            disabled={!compareActive}
          />
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex items-center gap-1 px-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-yellow-400 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon size={16} className={active ? "text-yellow-500" : ""} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="p-6 max-w-[1700px] mx-auto">
        {tab === "media" ? (
          !grid.selectionReady ? (
            <SelectionPrompt />
          ) : (
            <div className="flex items-start gap-4">
              {/* Editing grid — always editable, even while comparing */}
              <div className="flex-1 min-w-0">
                <ForecastGrid config={MEDIA_AXIS_CONFIG} grid={grid} />
              </div>

              {/* Live comparison panel — sticks beside the grid while editing */}
              {hasComparison && (
                <div className="w-[320px] flex-shrink-0 self-start sticky top-32">
                  <ComparisonPanel
                    config={MEDIA_AXIS_CONFIG}
                    grid={grid}
                    currentRfq={selectedRFQ!.type}
                  />
                </div>
              )}
            </div>
          )
        ) : (
          <ComingSoon label={TABS.find((t) => t.id === tab)!.label} />
        )}
      </div>
    </div>
  );
}

// ─── Comparison selector — reference RFQ + side ──────────────────────────────
// The base is always "this RFQ — BL Input"; the user picks what to compare it
// against: any RFQ of the year (including the current one) and a side. The
// actuals side label is axis-driven (MediaOcean for Media, GAIA for Revenue).

function ComparisonSelector({
  rfqOptions,
  refRfq,
  refSide,
  onSelectRfq,
  onSelectSide,
  actualsLabel,
  loading,
  disabled,
}: {
  rfqOptions: { value: RFQType; label: string }[];
  refRfq: RFQType | null;
  refSide: ComparisonSide;
  onSelectRfq: (rfq: RFQType | null) => void;
  onSelectSide: (side: ComparisonSide) => void;
  actualsLabel: string;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Vertical divider — sets the comparison group apart from the
          Client/Year/RFQ selectors so the two dropdowns aren't mistaken for
          part of the active selection. */}
      <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

      {/* Comparison group — labelled box wrapping the two reference dropdowns. */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/70 pl-2.5 pr-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none">
          <GitCompareArrows size={13} />
          Comparison
        </span>

        {/* Reference RFQ */}
        <div className="relative">
          <select
            value={refRfq ?? ""}
            onChange={(e) => onSelectRfq((e.target.value || null) as RFQType | null)}
            disabled={disabled || rfqOptions.length === 0}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer disabled:opacity-50"
          >
            <option value="">Compare with...</option>
            {rfqOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>

        {/* Reference side */}
        <div className="relative">
          <select
            value={refSide}
            onChange={(e) => onSelectSide(e.target.value as ComparisonSide)}
            disabled={disabled || !refRfq}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer disabled:opacity-50"
          >
            <option value="BL_INPUT">BL Input</option>
            <option value="ADMIN_INPUT">{actualsLabel}</option>
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>

        {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
      </div>
    </div>
  );
}

// ─── Empty state — incomplete triplet ────────────────────────────────────────

function SelectionPrompt() {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();

  const steps = [
    { label: "Client", done: !!selectedClient },
    { label: "Year", done: !!selectedYear },
    { label: "RFQ", done: !!selectedRFQ },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white border border-gray-200 rounded-xl">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <TrendingUp size={24} className="opacity-40" />
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">
        Select a forecasting context
      </p>
      <p className="text-xs text-gray-400 mb-5 flex items-center gap-1">
        <MousePointerClick size={12} />
        Use the selectors at the top of the page to get started.
      </p>

      {/* Selection progress */}
      <div className="flex items-center gap-2">
        {steps.map((step) => (
          <span
            key={step.label}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              step.done
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-gray-50 text-gray-400 border-gray-200"
            }`}
          >
            {step.done ? "✓ " : ""}
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Placeholder for axes not yet implemented (Revenue / Labs) ───────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white border border-gray-200 rounded-xl">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <FlaskConical size={24} className="opacity-40" />
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label} — coming soon</p>
      <p className="text-xs text-gray-400">
        This forecast axis isn&apos;t available yet.
      </p>
    </div>
  );
}
