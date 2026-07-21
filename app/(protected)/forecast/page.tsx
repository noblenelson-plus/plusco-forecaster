// app/(protected)/forecast/page.tsx
"use client";

/**
 * Unified forecast page — a single page with four switchable tabs.
 * Media Spend / Revenue / Labs are powered by the same generic grid engine;
 * Product is a standalone always-on status grid (client-only, no year/RFQ).
 *
 * Layout:
 *   [Context bar]  Client · Year · Submission selectors + panel toggles
 *   [Tabs]         Media Spend · Labs · Revenue (free switching)
 *   [Content]      the active axis grid + side panels
 *
 * The Client/Year/RFQ selectors used to live in the sidebar; they now sit at
 * the top of this page (the sidebar only keeps navigation). The comparison
 * selector, formerly inside the grid toolbar, also lives here and drives the
 * active grid.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  FlaskConical,
  MousePointerClick,
  AlertTriangle,
  Percent,
  GitCompare,
  StickyNote,
  Package,
  Flag,
} from "lucide-react";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import SubmissionNote from "../../../components/forecaster/submission-note";
import SubmissionReadyMonths from "../../../components/forecaster/submission-ready-months";
import ForecastGrid, { type RowMeta } from "../../../components/forecaster/forecast-grid";
import CopyToast from "../../../components/forecaster/copy-toast";
import RevenueGrid from "../../../components/forecaster/revenue-grid";
import ProductGrid from "../../../components/forecaster/product-grid";
import ComparisonPanel from "../../../components/forecaster/comparison-panel";
import LabsPenetrationPanel from "../../../components/forecaster/labs-penetration-panel";
import FlagsDrawer from "../../../components/forecaster/flags-drawer";
import RFQTimelineBar from "../../../components/forecaster/rfq-timeline-bar";
import LabsCoverageSplitDialog, {
  type ProjectShareTarget,
} from "../../../components/forecaster/labs-coverage-split-dialog";
import {
  useForecasterGrid,
  monthTotals,
  grandMonthTotals,
} from "../../../lib/hooks/use-forecaster-grid";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { subscribeToClient } from "../../../lib/services/client-service";
import { syncRevenueCommission } from "../../../lib/services/data-entry-service";
import type { CommissionsConfig, Currency } from "../../../lib/types/client.types";
import {
  applyCommissionOverwrite,
  commissionOverwriteMonths,
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
  ensureSingleProjectGeneral,
} from "../../../lib/types/forecaster.types";
import type {
  AxisData,
  ComparisonRef,
  CellCoord,
} from "../../../lib/types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../../lib/types/common.types";
import { distribute } from "../../../lib/format/distribute";
import {
  computeLabsPenetration,
  type LabsPenetrationResult,
} from "../../../lib/format/labs-penetration";
import { useFlags } from "../../../lib/hooks/use-flags";
import { subscribeToRFQs, getRFQYears } from "../../../lib/services/rfq-service";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { RFQ } from "../../../lib/types/rfq.types";

type Tab = "media" | "revenue" | "labs" | "product";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "media", label: "Media Spend", icon: TrendingUp },
  { id: "labs", label: "Labs", icon: FlaskConical },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "product", label: "Product", icon: Package },
];

// useSearchParams requires a Suspense boundary for static prerendering.
export default function ForecastPage() {
  return (
    <Suspense>
      <ForecastPageContent />
    </Suspense>
  );
}

function ForecastPageContent() {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  // Deep link from the How-to guide (main nav): /forecast?tab=media|labs|revenue
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return t === "media" || t === "labs" || t === "revenue" || t === "product"
      ? t
      : "media";
  });
  // Labs penetration panel — open by default on the Labs tab, toggleable.
  const [penetrationOpen, setPenetrationOpen] = useState(true);
  // Comparison panel (Media & Labs) — open by default, toggleable.
  const [compareOpen, setCompareOpen] = useState(true);
  // Submission notes card — shared per submission, open by default, toggleable.
  const [notesOpen, setNotesOpen] = useState(true);
  // Flags drawer — opened from the top-bar flag button, closed by default.
  const [flagsOpen, setFlagsOpen] = useState(false);

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
    normalizeLoaded: ensureSingleProjectGeneral,
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
  const labsGrid = useForecasterGrid(labsConfig, {
    normalizeLoaded: ensureSingleProjectGeneral,
  });

  // Base commission from the Media plan — the Commission Overwrite rule (a
  // month with an overwrite value suppresses the calculation) is applied
  // against the Revenue axis's own working copy below.
  const commissionBase = useMemo(
    () => computeCommission(mediaGrid.data, yearRates),
    [mediaGrid.data, yearRates]
  );
  // Stable overlay callback — resolved by the hook against the live Revenue
  // data, so typing a Commission Overwrite value zeroes the Commission row
  // (displayed AND persisted on Save) for that month instantly.
  const revenueComputedRows = useCallback(
    (revenueData: AxisData) => [
      {
        rowType: REVENUE_COMMISSION_TYPE,
        months: applyCommissionOverwrite(
          commissionBase,
          commissionOverwriteMonths(revenueData)
        ).months,
      },
    ],
    [commissionBase]
  );
  const revenueGrid = useForecasterGrid(REVENUE_AXIS_CONFIG, {
    normalizeLoaded: ensureRevenueShape,
    computedRows: revenueComputedRows,
  });
  // Final breakdown (overwrite applied) — drives the grid's Commission row
  // rendering and its hover explanations.
  const commission = useMemo(
    () =>
      applyCommissionOverwrite(
        commissionBase,
        commissionOverwriteMonths(revenueGrid.data)
      ),
    [commissionBase, revenueGrid.data]
  );
  const revenueNoRates = !yearRates || Object.keys(yearRates).length === 0;

  // Active axis (grid tabs only — Product has no grid engine, no year/RFQ).
  // On the Product tab these fall back to Media but are never rendered.
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

  // Stable partner-name resolver for the Flags engine (a previous-RFQ partner
  // may belong to another year, so we look it up across every partner).
  const partnerLabel = useCallback(
    (partnerId: string) => partnerById.get(partnerId)?.name ?? partnerId,
    [partnerById]
  );

  // Labs penetration — per media type, what the partners cover of the planned
  // Media BL budget (same submission), plus the global Labs/Media ratio.
  const penetration = useMemo(
    () => computeLabsPenetration(labsGrid.data, mediaGrid.data, partnersForYear),
    [labsGrid.data, mediaGrid.data, partnersForYear]
  );

  // MediaOcean vs BL — months where the booked actuals total exceeds the BL
  // Input total, flagged with a banner on the Media and Labs tabs.
  const mediaOverBooked = useMemo(
    () => actualsOverBLMonths(mediaGrid.data),
    [mediaGrid.data]
  );
  const labsOverBooked = useMemo(
    () => actualsOverBLMonths(labsGrid.data),
    [labsGrid.data]
  );

  // Per-row extras for the Labs grid: media type chip + inline description.
  // The description disambiguates two partners that share a name and media type.
  // (Over-cap flagging lives in the penetration panel, not on the rows, since a
  // media type may hold several partners.)
  const labsRowMeta = useCallback(
    (rowType: string): RowMeta | undefined => {
      const partner = partnerById.get(rowType);
      if (!partner) return undefined;
      return {
        badge: MEDIA_TYPE_LABELS[partner.mediaType],
        description: partner.description,
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

  // Flags — auto-raised warnings vs the previous RFQ across all three axes for
  // the selected submission. Computed live from the grid working copies (all
  // three engines are mounted regardless of the active tab) and surfaced by the
  // floating flag button + drawer below.
  const flags = useFlags({
    media: mediaGrid.data,
    labs: labsGrid.data,
    revenue: revenueGrid.data,
    allRfqs,
    partnerLabel,
  });

  // Years with at least one RFQ — offered by the grid's reference-year selector
  // so a user can peek at another year's MediaOcean/MediaBox while editing.
  const referenceYears = useMemo(() => getRFQYears(rfqs), [rfqs]);

  // Timeline periods of the selected RFQ — resolved from the live `rfqs`
  // subscription (not the store's snapshot) so admin edits reflect instantly.
  const timelinePeriods = useMemo(() => {
    if (!selectedRFQ) return [];
    const live = rfqs.find((r) => r.rfq_id === selectedRFQ.rfq_id);
    return (live ?? selectedRFQ).periods ?? [];
  }, [rfqs, selectedRFQ]);

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
    // Full-height flex column so the timeline bar can stick to the bottom of
    // the viewport even when the grid is short: the content area grows
    // (flex-1) and pushes the sticky bar down.
    <div className="flex flex-col min-h-screen">
      {/* Global toast for click-to-copy on read-only cells. */}
      <CopyToast />
      {/* ─── Context bar — selectors ─── */}
      {/* The comparison controls now live inside the comparison panel beside the
          grid, not here in the header. */}
      {/* z-40 keeps this bar (and its open dropdowns) above the grid's sticky
          cells: row headers (z-10), column headers (z-20) and the frozen corner
          cell (z-30). The dropdown panels live in this bar's stacking context,
          so an equal z-index would let the later-in-DOM corner header ("Stream")
          paint over the open dropdowns. */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <ForecastSelectors orientation="horizontal" theme="light" />

          {/* Currency this client forecasts in — amounts entered are in this
              currency (the dashboard converts everything to CAD). Hidden on
              the Product tab, which carries no dollar amounts. */}
          {selectedClient && tab !== "product" && (
            <ForecastCurrencyBadge currency={selectedClient.CL_Currency ?? "CAD"} />
          )}

          {/* Labs penetration panel toggle (Labs tab only). */}
          {tab === "labs" && (
            <button
              type="button"
              onClick={() => setPenetrationOpen((v) => !v)}
              aria-pressed={penetrationOpen}
              title={penetrationOpen ? "Hide the % share panel" : "Show the % share panel"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                penetrationOpen
                  ? "border-yellow-400 bg-yellow-400 text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Percent size={14} />
              Share
            </button>
          )}

          {/* Submission notes toggle (grid tabs — the note is per submission,
              which the Product tab doesn't have). */}
          {tab !== "product" && (
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            aria-pressed={notesOpen}
            title={notesOpen ? "Hide the submission notes" : "Show the submission notes"}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              notesOpen
                ? "border-yellow-400 bg-yellow-400 text-gray-900"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <StickyNote size={14} />
            Notes
          </button>
          )}

          {/* Comparison panel toggle (Media & Labs tabs). */}
          {tab !== "revenue" && tab !== "product" && (
            <button
              type="button"
              onClick={() => setCompareOpen((v) => !v)}
              aria-pressed={compareOpen}
              title={compareOpen ? "Hide the comparison panel" : "Show the comparison panel"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                compareOpen
                  ? "border-yellow-400 bg-yellow-400 text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <GitCompare size={14} />
              Compare
            </button>
          )}

          {/* Right-aligned pair — BL Forecast Validation (green) then Flags (red
              when the submission has flags still to review). All three axes are
              considered together. */}
          {tab !== "product" && flags.ready && (
            <div className="ml-auto flex items-center gap-3">
              <SubmissionReadyMonths
                blocked={flags.unacknowledgedCount > 0}
                blockedCount={flags.unacknowledgedCount}
              />
              <button
                type="button"
                onClick={() => setFlagsOpen(true)}
                aria-label={`Open flags (${flags.flags.length})`}
                title={
                  flags.unacknowledgedCount > 0
                    ? `${flags.unacknowledgedCount} flag(s) to review`
                    : "Flags"
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  flags.unacknowledgedCount > 0
                    ? "border-red-500 bg-red-500 text-white hover:bg-red-600"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Flag size={14} />
                Flags
                {flags.unacknowledgedCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center bg-white px-1.5 text-xs font-bold text-red-600">
                    {flags.unacknowledgedCount}
                  </span>
                )}
              </button>
            </div>
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
      {/* flex-1 lets this area fill the remaining height so the timeline bar
          below stays pinned to the bottom of the screen. */}
      <div className="flex-1 w-full p-6 max-w-[1700px] mx-auto">
        {tab === "product" ? (
          // Product is always-on per client — only a client is required.
          selectedClient ? (
            <ProductGrid clientId={selectedClient.cl_id} />
          ) : (
            <SelectionPrompt clientOnly />
          )
        ) : !activeGrid.selectionReady ? (
          <SelectionPrompt />
        ) : (
          <div className="space-y-4">
            {/* Submission-wide notes — same card on every axis tab. */}
            {notesOpen && <SubmissionNote />}

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

              {/* MediaOcean booked total exceeds the BL forecast in ≥1 month.
                  Hidden when the RFQ is locked: the submission is frozen, so
                  there is nothing left to act on. */}
              {tab === "media" &&
                selectedRFQ?.status !== "LOCKED" &&
                mediaOverBooked.length > 0 && (
                  <ActualsOverBLBanner
                    months={mediaOverBooked}
                    actualsLabel={MEDIA_AXIS_CONFIG.actualsLabel}
                  />
                )}
              {tab === "labs" &&
                selectedRFQ?.status !== "LOCKED" &&
                labsOverBooked.length > 0 && (
                  <ActualsOverBLBanner
                    months={labsOverBooked}
                    actualsLabel={labsConfig.actualsLabel}
                  />
                )}

              {tab === "revenue" ? (
                <RevenueGrid
                  grid={revenueGrid}
                  commission={commission}
                  noRates={revenueNoRates}
                  hideGaia={selectedRFQ?.type === "RFQ0"}
                />
              ) : (
                <ForecastGrid
                  config={activeConfig}
                  grid={activeGrid}
                  rowMeta={tab === "labs" ? labsRowMeta : undefined}
                  referenceYears={referenceYears}
                />
              )}
            </div>

            {/* Right column — penetration (Labs) + the comparison panel (its
                reference selector lives inside it). Hidden on the Revenue tab,
                and collapsed entirely when both panels are toggled off so the
                grid takes the full width. */}
            {tab !== "revenue" && (showPenetration || compareOpen) && (
              <div className="w-[360px] flex-shrink-0 self-start sticky top-32 space-y-4">
                {showPenetration && (
                  <LabsPenetrationPanel
                    result={penetration}
                    canEdit={canEditPenetration}
                    onSetCoverage={setPartnerCoverage}
                  />
                )}
                {compareOpen && (
                  <ComparisonPanel
                    config={activeConfig}
                    grid={activeGrid}
                    currentYear={selectedYear!}
                    currentRfq={selectedRFQ!.type}
                    allRfqs={allRfqs}
                    onSelectRef={activeGrid.setCompareRef}
                    onResetDefault={resetActiveDefault}
                    canResetDefault={!!activeDefaultRef}
                  />
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky timeline (échéancier) — shown with a full context selected.
          Renders nothing when the RFQ has no periods. The Product tab has no
          RFQ selectors of its own but still shows the timeline of the
          globally selected RFQ (empty selection → no periods → nothing). */}
      {(tab === "product" || activeGrid.selectionReady) && (
        <RFQTimelineBar periods={timelinePeriods} />
      )}

      {/* Flags drawer (trigger lives in the top bar) — all three axes for the
          selected submission. Grid tabs only (Product has no year/RFQ). */}
      {tab !== "product" && flags.ready && (
        <FlagsDrawer
          // Remount on submission change so local note drafts never bleed
          // across clients/RFQs (flag keys are identical across submissions).
          key={`${selectedClient?.cl_id}_${selectedYear}_${selectedRFQ?.type}`}
          open={flagsOpen}
          onClose={() => setFlagsOpen(false)}
          flags={flags.flags}
          reviews={flags.reviews}
          unacknowledgedCount={flags.unacknowledgedCount}
          loadingReference={flags.loadingReference}
          currency={selectedClient?.CL_Currency ?? "CAD"}
          saveReview={flags.saveReview}
        />
      )}

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
          ? "border-blue-300 bg-blue-200 text-gray-900"
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

function SelectionPrompt({ clientOnly = false }: { clientOnly?: boolean }) {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();

  // The Product tab is always-on: it only needs a client, not a year/RFQ.
  const steps = clientOnly
    ? [{ label: "Client", done: !!selectedClient }]
    : [
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
            className={`px-2.5 py-1 text-xs font-medium border ${
              step.done
                ? "bg-green-500 text-white border-green-500"
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
    <div className="flex items-start gap-2.5 rounded-lg border border-yellow-400 bg-yellow-400 px-4 py-3 text-sm text-gray-900">
      <FlaskConical size={16} className="mt-0.5 flex-shrink-0 text-gray-800" />
      <p>
        No lab partner is configured{year ? ` for ${year}` : ""}. Add partners in{" "}
        <span className="font-semibold">Admin → Labs</span> to populate the partner
        list before forecasting.
      </p>
    </div>
  );
}

// ─── MediaOcean booked total > BL forecast ───────────────────────────────────
// Per-month check on the Media and Labs axes: any month whose MediaOcean
// (admin) total exceeds the BL Input total means the booked spend has outgrown
// the forecast — surfaced as a top-of-grid banner, like the Labs over-cap one.

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface OverBookedMonth {
  month: number;
  booked: number;
  planned: number;
}

/** Months (1-12) where the actuals total exceeds the BL Input total. */
function actualsOverBLMonths(data: AxisData): OverBookedMonth[] {
  const planned = grandMonthTotals(data);
  const booked = monthTotals(data.actuals);
  const out: OverBookedMonth[] = [];
  for (const m of MONTHS) {
    const b = Math.round(booked[m] ?? 0);
    const p = Math.round(planned[m] ?? 0);
    if (b > 0 && b > p) out.push({ month: m, booked: b, planned: p });
  }
  return out;
}

function ActualsOverBLBanner({
  months,
  actualsLabel,
}: {
  months: OverBookedMonth[];
  actualsLabel: string;
}) {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-CA");
  return (
    <div className="rounded-lg border border-yellow-400 bg-yellow-400 px-4 py-3 text-sm text-gray-900">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-800">
        ALERT: UNDER-FORECASTING
      </div>
      <div className="mt-0.5 flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0 text-gray-800" />
        {actualsLabel} booked spend exceeds the BL Input forecast
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-7 text-[13px]">
        {months.map((m) => (
          <li key={m.month}>
            <span className="font-semibold">{MONTH_SHORT[m.month - 1]}</span>
            {" — "}
            <span className="font-semibold tabular-nums">{fmt(m.booked)}</span>
            {" booked vs "}
            <span className="tabular-nums">{fmt(m.planned)}</span>
            {" planned"}
          </li>
        ))}
      </ul>
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
    <div className="rounded-lg border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0 text-white" />
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
