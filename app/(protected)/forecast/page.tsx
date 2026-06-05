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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  FlaskConical,
  MousePointerClick,
  GitCompareArrows,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Percent,
} from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import ForecastGrid, { type RowMeta } from "../../../components/forecaster/forecast-grid";
import ComparisonPanel from "../../../components/forecaster/comparison-panel";
import LabsPenetrationPanel from "../../../components/forecaster/labs-penetration-panel";
import LabsCoverageSplitDialog, {
  type ProjectShareTarget,
} from "../../../components/forecaster/labs-coverage-split-dialog";
import { useForecasterGrid } from "../../../lib/hooks/use-forecaster-grid";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import {
  MEDIA_AXIS_CONFIG,
  MEDIA_TYPE_LABELS,
  buildLabsAxisConfig,
  emptyMonthly,
} from "../../../lib/types/forecaster.types";
import type { ComparisonSide, CellCoord } from "../../../lib/types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../../lib/types/common.types";
import { distribute } from "../../../lib/format/distribute";
import {
  computeLabsPenetration,
  type LabsPenetrationResult,
} from "../../../lib/format/labs-penetration";
import { subscribeToRFQs, getRFQsForYear } from "../../../lib/services/rfq-service";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import type { LabsPartner } from "../../../lib/types/labs.types";
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

  // One grid engine per axis; only the active tab's grid is rendered. Revenue is
  // still a placeholder.
  const mediaGrid = useForecasterGrid(MEDIA_AXIS_CONFIG);
  const labsGrid = useForecasterGrid(labsConfig);

  // Active axis — Media and Labs are implemented; Revenue is "coming soon".
  const compareActive = tab === "media" || tab === "labs";
  const activeGrid = tab === "labs" ? labsGrid : mediaGrid;
  const activeConfig = tab === "labs" ? labsConfig : MEDIA_AXIS_CONFIG;

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
      activeGrid.setCompareRef(null);
      return;
    }
    activeGrid.setCompareRef({ rfq, side: activeGrid.compareRef?.side ?? "BL_INPUT" });
  }

  function selectRefSide(side: ComparisonSide) {
    if (!activeGrid.compareRef) return;
    activeGrid.setCompareRef({ rfq: activeGrid.compareRef.rfq, side });
  }

  const hasComparison = compareActive && !!activeGrid.compareRef;

  return (
    <div>
      {/* ─── Context bar — selectors + comparison ─── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <ForecastSelectors orientation="horizontal" theme="light" />

          <ComparisonSelector
            rfqOptions={rfqOptions}
            refRfq={compareActive ? activeGrid.compareRef?.rfq ?? null : null}
            refSide={activeGrid.compareRef?.side ?? "BL_INPUT"}
            onSelectRfq={selectRefRfq}
            onSelectSide={selectRefSide}
            actualsLabel={activeConfig.actualsLabel}
            loading={compareActive && activeGrid.referenceLoading}
            disabled={!compareActive}
          />

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
              Penetration
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
        {compareActive ? (
          !activeGrid.selectionReady ? (
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

                <ForecastGrid
                  config={activeConfig}
                  grid={activeGrid}
                  rowMeta={tab === "labs" ? labsRowMeta : undefined}
                />
              </div>

              {/* Right column — penetration (Labs) and/or comparison panels. */}
              {(showPenetration || hasComparison) && (
                <div className="w-[360px] flex-shrink-0 self-start sticky top-32 space-y-4">
                  {showPenetration && (
                    <LabsPenetrationPanel
                      result={penetration}
                      canEdit={canEditPenetration}
                      onSetCoverage={setPartnerCoverage}
                    />
                  )}
                  {hasComparison && (
                    <ComparisonPanel
                      config={activeConfig}
                      grid={activeGrid}
                      currentRfq={selectedRFQ!.type}
                    />
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          <ComingSoon label={TABS.find((t) => t.id === tab)!.label} />
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
