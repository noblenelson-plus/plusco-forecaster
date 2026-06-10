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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  FlaskConical,
  MousePointerClick,
  AlertTriangle,
  Percent,
  BookOpen,
} from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import HowToGuide from "../../../components/forecaster/how-to-guide";
import ForecastGrid, { type RowMeta } from "../../../components/forecaster/forecast-grid";
import RevenueGrid from "../../../components/forecaster/revenue-grid";
import ComparisonPanel from "../../../components/forecaster/comparison-panel";
import LabsPenetrationPanel from "../../../components/forecaster/labs-penetration-panel";
import LabsCoverageSplitDialog, {
  type ProjectShareTarget,
} from "../../../components/forecaster/labs-coverage-split-dialog";
import { useForecasterGrid } from "../../../lib/hooks/use-forecaster-grid";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { subscribeToClient } from "../../../lib/services/client-service";
import { syncRevenueCommission } from "../../../lib/services/data-entry-service";
import type { CommissionsConfig, Currency } from "../../../lib/types/client.types";
import {
  computeCommission,
  ensureRevenueShape,
} from "../../../lib/format/revenue-commission";
import {
  MEDIA_AXIS_CONFIG,
  MEDIA_TYPE_LABELS,
  REVENUE_AXIS_CONFIG,
  REVENUE_COMMISSION_TYPE,
  buildLabsAxisConfig,
  defaultComparisonRef,
  emptyMonthly,
} from "../../../lib/types/forecaster.types";
import type { ComparisonRef, CellCoord } from "../../../lib/types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../../lib/types/common.types";
import { distribute } from "../../../lib/format/distribute";
import {
  computeLabsPenetration,
  type LabsPenetrationResult,
} from "../../../lib/format/labs-penetration";
import { subscribeToRFQs } from "../../../lib/services/rfq-service";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { RFQ } from "../../../lib/types/rfq.types";

type Tab = "media" | "revenue" | "labs" | "howto";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "labs", label: "Labs", icon: FlaskConical },
  { id: "howto", label: "How to", icon: BookOpen },
];

export default function ForecastPage() {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const [tab, setTab] = useState<Tab>("media");
  // Labs penetration panel — open by default on the Labs tab, toggleable.
  const [penetrationOpen, setPenetrationOpen] = useState(true);

  // Lab partners (global, all years) — drive the Labs grid's row types. The
  // grid for the Labs axis lists the partners configured for the selected year
  // in admin/labs, instead of a static list like Media's media types.
  const [labsPartners, setLabsPartners] = useState<LabsPartner[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners((partners) => {
      setLabsPartners(partners);
      setPartnersLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  const partnersForYear = useMemo(
    () => (selectedYear ? getLabsPartnersForYear(labsPartners, selectedYear) : []),
    [labsPartners, selectedYear]
  );
  // Rebuilt whenever the year's partner set changes; safe to rebuild often since
  // the grid's load effect keys on config.axisId (a stable string), not options.
  const labsConfig = useMemo(
    () => buildLabsAxisConfig(partnersForYear),
    [partnersForYear]
  );

  // Commission (BL) is derived from the Media spend forecast (same submission)
  // and the client's commission rates. The store only carries a ClientSummary,
  // so the client's commissionsConfig is subscribed here in real time — a rate
  // change reflects immediately in the displayed (and synced) commission.
  const [clientConfig, setClientConfig] = useState<CommissionsConfig | null>(null);
  useEffect(() => {
    if (!selectedClient) {
      setClientConfig(null);
      return;
    }
    const unsubscribe = subscribeToClient(selectedClient.cl_id, (client) => {
      setClientConfig(client?.commissionsConfig ?? {});
    });
    return () => unsubscribe();
  }, [selectedClient?.cl_id]);
  const yearRates = useMemo(
    () => (selectedYear ? clientConfig?.[selectedYear] : undefined),
    [clientConfig, selectedYear]
  );

  // One grid engine per axis; only the active tab's grid is rendered. Saving
  // Media re-syncs the derived Revenue commission for the same submission.
  const mediaGrid = useForecasterGrid(MEDIA_AXIS_CONFIG, {
    onSaved: () => {
      if (!selectedClient || !selectedYear || !selectedRFQ) return;
      syncRevenueCommission(
        selectedClient.cl_id,
        selectedYear,
        selectedRFQ.type,
        yearRates
      ).catch((err) =>
        console.error("Revenue commission sync failed:", err)
      );
    },
  });
  const labsGrid = useForecasterGrid(labsConfig);

  const commission = useMemo(
    () => computeCommission(mediaGrid.data, yearRates),
    [mediaGrid.data, yearRates]
  );
  // Stable overlay array — the hook treats this Commission row as read-only and
  // persists it on Save.
  const revenueComputedRows = useMemo(
    () => [{ rowType: REVENUE_COMMISSION_TYPE, months: commission.months }],
    [commission.months]
  );
  const revenueGrid = useForecasterGrid(REVENUE_AXIS_CONFIG, {
    normalizeLoaded: ensureRevenueShape,
    computedRows: revenueComputedRows,
  });
  const revenueNoRates = !yearRates || Object.keys(yearRates).length === 0;

  // Active axis — all three are implemented; comparison is available on each.
  const activeGrid =
    tab === "labs" ? labsGrid : tab === "revenue" ? revenueGrid : mediaGrid;
  const activeConfig =
    tab === "labs"
      ? labsConfig
      : tab === "revenue"
      ? REVENUE_AXIS_CONFIG
      : MEDIA_AXIS_CONFIG;

  // Partner lookup by id — resolves a Labs row's media type/description and
  // attributes Labs spend to a media type for the penetration breakdown.
  const partnerById = useMemo(() => {
    const map = new Map<string, LabsPartner>();
    for (const p of labsPartners) map.set(p.partnerId, p);
    return map;
  }, [labsPartners]);

  // Labs penetration — per media type, what the partners cover of the planned
  // Media BL budget (same submission), plus the global Labs/Media ratio.
  const penetration = useMemo(
    () => computeLabsPenetration(labsGrid.data, mediaGrid.data, partnersForYear),
    [labsGrid.data, mediaGrid.data, partnersForYear]
  );

  // Per-row extras for the Labs grid: media type chip + description tooltip.
  // (Over-cap flagging lives in the penetration panel, not on the rows, since a
  // media type may hold several partners.)
  const labsRowMeta = useCallback(
    (rowType: string): RowMeta | undefined => {
      const partner = partnerById.get(rowType);
      if (!partner) return undefined;
      return {
        badge: MEDIA_TYPE_LABELS[partner.mediaType],
        tooltip: partner.description,
      };
    },
    [partnerById]
  );

  // Coverage-split modal — opened when a partner spans several projects.
  const [coverageSplit, setCoverageSplit] = useState<{
    partnerName: string;
    mediaTypeLabel: string;
    pct: number;
    targetAnnual: number;
    planned: MonthlyMap;
    projects: ProjectShareTarget[];
  } | null>(null);

  // Write p% of the planned media into the given partner rows, month by month
  // (follows the media curve), splitting each month across the rows by `shares`
  // (one percent per row). distribute() absorbs the rounding remainder so the
  // monthly totals land exactly on the target.
  const writeCoverage = useCallback(
    (
      planned: MonthlyMap,
      pct: number,
      rows: { bucketId: string; rowId: string }[],
      shares: number[]
    ) => {
      const updates: { coord: CellCoord; value: number }[] = [];
      for (const m of MONTHS) {
        const goal = Math.round((pct / 100) * (planned[m] ?? 0));
        const parts = distribute(goal, shares);
        rows.forEach((r, i) => {
          updates.push({
            coord: { category: "BL_INPUT", bucketId: r.bucketId, rowId: r.rowId, month: m },
            value: Math.max(0, parts[i] ?? 0),
          });
        });
      }
      labsGrid.setCells(updates);
    },
    [labsGrid]
  );

  // Set a partner's desired coverage of its media type. One row → write it; no
  // row yet → seed one in the first project; several projects → ask the user how
  // to split the target across them (modal).
  const setPartnerCoverage = useCallback(
    (partnerId: string, pct: number) => {
      const partner = partnerById.get(partnerId);
      if (!partner) return;
      const typeEntry = penetration.byType.find(
        (t) => t.mediaType === partner.mediaType
      );
      const planned = typeEntry?.plannedMonths ?? emptyMonthly();
      const plannedAnnual = typeEntry?.plannedAnnual ?? 0;

      // The partner's rows across every project.
      const rows = labsGrid.data.buckets.flatMap((b) =>
        b.rows
          .filter((r) => r.rowType === partnerId)
          .map((r) => ({
            bucketId: b.bucketId,
            rowId: r.rowId,
            name: b.name,
            currentAnnual: MONTHS.reduce((acc, m) => acc + (r.months[m] ?? 0), 0),
          }))
      );

      // No row yet — seed one in the first project (none → nothing to do).
      if (rows.length === 0) {
        const bucketId = labsGrid.data.buckets[0]?.bucketId;
        if (!bucketId) return;
        labsGrid.addToCells(
          MONTHS.map((m) => ({
            bucketId,
            rowType: partnerId,
            month: m,
            delta: Math.round((pct / 100) * (planned[m] ?? 0)),
          }))
        );
        return;
      }

      // Single project — apply directly.
      if (rows.length === 1) {
        writeCoverage(planned, pct, [{ bucketId: rows[0].bucketId, rowId: rows[0].rowId }], [100]);
        return;
      }

      // Several projects — let the user split the target across them.
      setCoverageSplit({
        partnerName: partner.name,
        mediaTypeLabel: MEDIA_TYPE_LABELS[partner.mediaType],
        pct,
        targetAnnual: Math.round((pct / 100) * plannedAnnual),
        planned,
        projects: rows.map((r) => ({
          bucketId: r.bucketId,
          rowId: r.rowId,
          name: r.name,
          currentAnnual: r.currentAnnual,
        })),
      });
    },
    [partnerById, penetration, labsGrid, writeCoverage]
  );

  const applyCoverageSplit = useCallback(
    (shares: Record<string, number>) => {
      if (!coverageSplit) return;
      const { planned, pct, projects } = coverageSplit;
      writeCoverage(
        planned,
        pct,
        projects.map((p) => ({ bucketId: p.bucketId, rowId: p.rowId })),
        projects.map((p) => shares[p.bucketId] ?? 0)
      );
    },
    [coverageSplit, writeCoverage]
  );

  // Penetration editing needs an unlocked RFQ and a project to write into.
  const canEditPenetration =
    !labsGrid.locked && labsGrid.data.buckets.length > 0;
  const showPenetration =
    tab === "labs" && penetrationOpen && labsGrid.selectionReady;

  // All RFQs across every year — feeds the reference year/submission dropdowns
  // (comparison can now target any submission of any year, not just this year).
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);

  const allRfqs = useMemo(
    () => rfqs.map((r) => ({ year: r.year, type: r.type })),
    [rfqs]
  );

  // Default comparison = the previous submission (BL for Media/Labs, GAIA for
  // Revenue). Applied to every axis whenever the selection context changes —
  // not on every rfqs snapshot, so a user's manual choice survives lock/unlock
  // updates. A ref tracks the last context the default was applied for.
  const appliedContextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedClient || !selectedYear || !selectedRFQ) {
      appliedContextRef.current = null;
      return;
    }
    const key = `${selectedClient.cl_id}_${selectedYear}_${selectedRFQ.type}`;
    if (appliedContextRef.current === key) return; // context unchanged
    if (allRfqs.length === 0) return; // wait until RFQs are loaded
    appliedContextRef.current = key;
    mediaGrid.setCompareRef(
      defaultComparisonRef(MEDIA_AXIS_CONFIG, selectedYear, selectedRFQ.type, allRfqs)
    );
    labsGrid.setCompareRef(
      defaultComparisonRef(labsConfig, selectedYear, selectedRFQ.type, allRfqs)
    );
    revenueGrid.setCompareRef(
      defaultComparisonRef(REVENUE_AXIS_CONFIG, selectedYear, selectedRFQ.type, allRfqs)
    );
  }, [
    selectedClient?.cl_id,
    selectedYear,
    selectedRFQ?.type,
    allRfqs,
    labsConfig,
    mediaGrid.setCompareRef,
    labsGrid.setCompareRef,
    revenueGrid.setCompareRef,
  ]);

  // Default reference for the active axis — drives the panel's "Default" button.
  const activeDefaultRef: ComparisonRef | null = useMemo(
    () =>
      selectedYear && selectedRFQ
        ? defaultComparisonRef(activeConfig, selectedYear, selectedRFQ.type, allRfqs)
        : null,
    [activeConfig, selectedYear, selectedRFQ?.type, allRfqs]
  );
  const resetActiveDefault = useCallback(() => {
    activeGrid.setCompareRef(activeDefaultRef);
  }, [activeGrid, activeDefaultRef]);

  return (
    <div>
      {/* ─── Context bar — selectors ─── */}
      {/* The comparison controls now live inside the comparison panel beside the
          grid, not here in the header. */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <ForecastSelectors orientation="horizontal" theme="light" />

          {/* Currency this client forecasts in — amounts entered are in this
              currency (the dashboard converts everything to CAD). */}
          {selectedClient && (
            <ForecastCurrencyBadge currency={selectedClient.CL_Currency ?? "CAD"} />
          )}

          {/* Labs penetration panel toggle (Labs tab only). */}
          {tab === "labs" && (
            <button
              type="button"
              onClick={() => setPenetrationOpen((v) => !v)}
              aria-pressed={penetrationOpen}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                penetrationOpen
                  ? "border-yellow-300 bg-yellow-50 text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Percent size={14} />
              Share
            </button>
          )}
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
        {tab === "howto" ? (
          // Standalone guide — no submission required, jumps to the axis tabs.
          <HowToGuide onJump={setTab} />
        ) : !activeGrid.selectionReady ? (
          <SelectionPrompt />
        ) : (
          <div className="flex items-start gap-4">
            {/* Editing grid — always editable, even while comparing */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Labs with no partner configured for the year — the partner
                  dropdown is empty, so hint where to configure them. */}
              {tab === "labs" &&
                partnersLoaded &&
                partnersForYear.length === 0 && <NoPartnersBanner year={selectedYear} />}

              {/* Labs over-cap — partners exceed 100% of a planned media type. */}
              {tab === "labs" && penetration.hasOver && (
                <LabsOverCapBanner result={penetration} />
              )}

              {tab === "revenue" ? (
                <RevenueGrid
                  grid={revenueGrid}
                  commission={commission}
                  noRates={revenueNoRates}
                />
              ) : (
                <ForecastGrid
                  config={activeConfig}
                  grid={activeGrid}
                  rowMeta={tab === "labs" ? labsRowMeta : undefined}
                />
              )}
            </div>

            {/* Right column — penetration (Labs) + the always-visible comparison
                panel (its reference selector lives inside it). */}
            <div className="w-[360px] flex-shrink-0 self-start sticky top-32 space-y-4">
              {showPenetration && (
                <LabsPenetrationPanel
                  result={penetration}
                  canEdit={canEditPenetration}
                  onSetCoverage={setPartnerCoverage}
                />
              )}
              <ComparisonPanel
                config={activeConfig}
                grid={activeGrid}
                currentYear={selectedYear!}
                currentRfq={selectedRFQ!.type}
                allRfqs={allRfqs}
                onSelectRef={activeGrid.setCompareRef}
                onResetDefault={resetActiveDefault}
                canResetDefault={!!activeDefaultRef}
                disableDistributeFor={
                  tab === "revenue"
                    ? new Set([REVENUE_COMMISSION_TYPE])
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Coverage split — partner present in several projects */}
      {coverageSplit && (
        <LabsCoverageSplitDialog
          partnerName={coverageSplit.partnerName}
          mediaTypeLabel={coverageSplit.mediaTypeLabel}
          pct={coverageSplit.pct}
          targetAnnual={coverageSplit.targetAnnual}
          projects={coverageSplit.projects}
          onApply={applyCoverageSplit}
          onClose={() => setCoverageSplit(null)}
        />
      )}
    </div>
  );
}

// ─── Currency indicator ──────────────────────────────────────────────────────
// Shows which currency the selected client forecasts in. USD is highlighted
// since CAD is the default; the dashboard converts everything to CAD.

function ForecastCurrencyBadge({ currency }: { currency: Currency }) {
  const isUsd = currency === "USD";
  return (
    <span
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg border ${
        isUsd
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-gray-50 text-gray-600"
      }`}
      title={`This client forecasts in ${currency}.`}
    >
      <DollarSign size={14} />
      Forecasting in {currency}
    </span>
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

// ─── Labs: no partner configured for the selected year ───────────────────────

function NoPartnersBanner({ year }: { year: number | null }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <FlaskConical size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
      <p>
        No lab partner is configured{year ? ` for ${year}` : ""}. Add partners in{" "}
        <span className="font-semibold">Admin → Labs</span> to populate the partner
        list before forecasting.
      </p>
    </div>
  );
}

// ─── Labs: media-type over 100% ──────────────────────────────────────────────
// Surfaces every media type whose Labs partners together cover more than the
// planned media budget in the same submission. Details (per partner) live in
// the penetration panel; this is the top-of-grid summary.

function LabsOverCapBanner({ result }: { result: LabsPenetrationResult }) {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-CA");
  const over = result.byType.filter((t) => t.over);
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0 text-red-500" />
        Labs investment exceeds the planned media budget
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-7 text-[13px]">
        {over.map((t) => (
          <li key={t.mediaType}>
            <span className="font-semibold">{MEDIA_TYPE_LABELS[t.mediaType]}</span>
            {" — "}
            <span className="font-semibold tabular-nums">
              {t.coverage !== null && isFinite(t.coverage)
                ? `${Math.round(t.coverage * 100)}%`
                : ">100%"}
            </span>
            {" of planned ("}
            <span className="tabular-nums">{fmt(t.labsAnnual)}</span>
            {" vs "}
            <span className="tabular-nums">{fmt(t.plannedAnnual)}</span>
            {")"}
          </li>
        ))}
      </ul>
    </div>
  );
}
