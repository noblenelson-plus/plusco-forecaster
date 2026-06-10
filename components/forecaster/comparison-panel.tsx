// components/forecaster/comparison-panel.tsx
"use client";

/**
 * Live comparison panel — a vertical side panel docked to the right of the
 * editing grid. The base (left) is always the current RFQ's BL_INPUT working
 * copy, so the panel updates in real time as the user edits the forecast.
 *
 * The reference (right) is `(rfq, side)` chosen in the context bar. The actuals
 * side carries the per-axis source label (MediaOcean for Media, GAIA for
 * Revenue), so the same shapes read as:
 *   another RFQ + BL Input   → BL vs BL
 *   this RFQ   + actuals     → BL vs actuals (same RFQ)
 *   another RFQ + actuals    → BL vs actuals (other RFQ)
 *
 * Aggregated to the annual total per row type (media type) — projects excluded.
 *
 * Revenue is the exception: it mirrors the grid's source-of-truth logic instead
 * of a per-stream table — one "Official Revenue" line comparing the current
 * submission's per-month source of truth (GAIA Revenue > GAIA detail > BL) to
 * the reference's, with the variance. The side picker and view toggle are hidden
 * for it.
 *
 * Three view modes (non-Revenue), switchable from the header toggle:
 *   list   → the numeric table (default)
 *   bars   → a diverging horizontal bar chart of the variance per type
 *   donut  → a nested double donut, inner ring = reference (comparison),
 *            outer ring = current RFQ
 */

import { useMemo, useState } from "react";
import {
  Loader2,
  GitCompareArrows,
  List,
  BarChartHorizontal,
  ChartPie,
  SplitSquareHorizontal,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import type {
  AxisConfig,
  AxisData,
  ComparisonRef,
  ComparisonSide,
} from "../../lib/types/forecaster.types";
import {
  aggregateByType,
  computeVariance,
  emptyMonthly,
  REVENUE_GAIA_FORECAST_TYPE,
} from "../../lib/types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import type { UseForecasterGridResult } from "../../lib/hooks/use-forecaster-grid";
import { sumMonths } from "../../lib/hooks/use-forecaster-grid";
import type { RFQType } from "../../lib/types/rfq.types";
import { RFQ_TYPE_ORDER } from "../../lib/types/rfq.types";
import { formatMoney } from "./editable-cell";
import DistributeDifferenceDialog, {
  type ProjectTarget,
} from "./distribute-difference-dialog";

interface ComparisonPanelProps {
  config: AxisConfig;
  grid: UseForecasterGridResult;
  /** Year currently being edited — the base operand. */
  currentYear: number;
  /** RFQ currently being edited — the base operand. */
  currentRfq: RFQType;
  /** All RFQs across years — feeds the reference year/submission dropdowns. */
  allRfqs: { year: number; type: RFQType }[];
  /** Apply a reference (or clear it with null). */
  onSelectRef: (ref: ComparisonRef | null) => void;
  /** Reset to the default (previous submission) comparison. */
  onResetDefault: () => void;
  /** Is a default comparison available (a previous submission exists)? */
  canResetDefault: boolean;
  /**
   * Row types that must not offer the "distribute the difference" action —
   * e.g. Revenue's computed Commission row, which can't be hand-adjusted.
   */
  disableDistributeFor?: Set<string>;
}

type ViewMode = "list" | "bars" | "donut";

/** One aggregated row type, with the color used across the chart views. */
interface PanelRowData {
  /** rowType value — used to target this media type when distributing. */
  type: string;
  label: string;
  current: number;
  reference: number;
  /** Per-month profile of the base (BL Input) — drives the expandable detail. */
  currentMonths: MonthlyMap;
  /** Per-month profile of the reference side. */
  referenceMonths: MonthlyMap;
  color: string;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Stable color palette assigned by row order so list/bars/donut agree. */
const PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#f97316", // orange
  "#84cc16", // lime
  "#14b8a6", // teal
  "#ef4444", // red
];

function sideLabel(side: ComparisonSide, config: AxisConfig): string {
  return side === "ADMIN_INPUT" ? config.actualsLabel : "BL Input";
}

function signed(n: number): string {
  const a = Math.round(Math.abs(n)).toLocaleString("en-CA");
  return n >= 0 ? `+${a}` : `−${a}`;
}

export default function ComparisonPanel({
  config,
  grid,
  currentYear,
  currentRfq,
  allRfqs,
  onSelectRef,
  onResetDefault,
  canResetDefault,
  disableDistributeFor,
}: ComparisonPanelProps) {
  const ref = grid.compareRef;
  const [view, setView] = useState<ViewMode>("list");
  // Difference currently being distributed (null = dialog closed). `month` is the
  // targeted month (1–12) when distributing a single month, or null for the
  // whole-year gap.
  const [target, setTarget] = useState<{
    type: string;
    month: number | null;
  } | null>(null);

  // Revenue compares within the current submission: BL Input vs the GAIA detail
  // lines, per revenue type — not against another submission. The other axes
  // compare BL Input against the chosen reference submission/side.
  const revenueDetail = config.axisId === "revenue";

  const baseAgg = useMemo(
    () => aggregateByType(grid.data, "BL_INPUT"),
    [grid.data]
  );
  const refAgg = useMemo(() => {
    if (revenueDetail) {
      // GAIA detail of the same submission — the roll-up "GAIA Revenue" line is
      // not a detail type, so it is excluded.
      const admin = aggregateByType(grid.data, "ADMIN_INPUT");
      delete admin[REVENUE_GAIA_FORECAST_TYPE];
      return admin;
    }
    return ref && grid.referenceData
      ? aggregateByType(grid.referenceData, ref.side)
      : {};
  }, [revenueDetail, grid.data, ref, grid.referenceData]);

  // rowType → display label, recovered from the live data rows. Lets orphaned
  // types (e.g. a Labs partner removed from the year's config) show their stored
  // name instead of the raw rowType id when aggregation drops the label.
  const labelByType = useMemo(() => {
    const map = new Map<string, string>();
    const collect = (d: AxisData | null) => {
      if (!d) return;
      for (const b of d.buckets)
        for (const r of b.rows) if (!map.has(r.rowType)) map.set(r.rowType, r.label);
      for (const r of d.actuals) if (!map.has(r.rowType)) map.set(r.rowType, r.label);
    };
    collect(grid.data);
    collect(grid.referenceData);
    return map;
  }, [grid.data, grid.referenceData]);

  const rows = useMemo<PanelRowData[]>(() => {
    const present = new Set([...Object.keys(baseAgg), ...Object.keys(refAgg)]);
    const ordered = config.rowTypeOptions
      .filter((o) => present.has(o.value))
      .map((o) => ({ type: o.value, label: o.label }));
    const extras = [...present]
      .filter((t) => !config.rowTypeOptions.some((o) => o.value === t))
      .map((t) => ({ type: t, label: labelByType.get(t) ?? t }));
    return [...ordered, ...extras].map(({ type, label }, i) => {
      const currentMonths = baseAgg[type] ?? emptyMonthly();
      const referenceMonths = refAgg[type] ?? emptyMonthly();
      return {
        type,
        label,
        current: sumMonths(currentMonths),
        reference: sumMonths(referenceMonths),
        currentMonths,
        referenceMonths,
        color: PALETTE[i % PALETTE.length],
      };
    });
  }, [baseAgg, refAgg, config.rowTypeOptions, labelByType]);

  const grand = useMemo(
    () => ({
      current: rows.reduce((acc, r) => acc + r.current, 0),
      reference: rows.reduce((acc, r) => acc + r.reference, 0),
    }),
    [rows]
  );

  const loading = grid.referenceLoading && !grid.referenceData;

  // A difference can only be pushed into projects when the grid is editable and
  // there is at least one project (bucket) to receive it. Revenue's panel is
  // read-only (it just shows the BL vs GAIA-detail gaps), so distribution is off.
  const canDistribute =
    !grid.locked && grid.data.buckets.length > 0 && !revenueDetail;

  const distributeRow = target
    ? rows.find((r) => r.type === target.type)
    : null;
  // Month-scoped operands when a single month is targeted, else the annual totals.
  const targetMonth = target?.month ?? null;
  const distCurrent =
    distributeRow && targetMonth != null
      ? distributeRow.currentMonths[targetMonth] ?? 0
      : distributeRow?.current ?? 0;
  const distReference =
    distributeRow && targetMonth != null
      ? distributeRow.referenceMonths[targetMonth] ?? 0
      : distributeRow?.reference ?? 0;

  // Human label for the reference operand. Revenue compares against this
  // submission's GAIA detail; the other axes name the reference submission (or,
  // for an annual-actuals ADMIN side, just the year + source).
  const refLabelText = revenueDetail
    ? `${config.actualsLabel} detail`
    : ref
    ? config.annualActuals && ref.side === "ADMIN_INPUT"
      ? `${ref.year} — ${config.actualsLabel} (annual)`
      : `${ref.year} ${ref.rfq} — ${sideLabel(ref.side, config)}`
    : null;

  // Base label for the bars/donut legends (current submission's BL Input).
  const baseLabel = `${currentYear} ${currentRfq} — BL Input`;

  // What the "Default" button restores, spelled out for its tooltip: the
  // previous submission, on the axis's natural side.
  const defaultSideText = config.annualActuals
    ? "BL Input"
    : `${config.actualsLabel} (Admin Input)`;

  // The active view, shared by both the reference and Revenue-detail bodies.
  const viewBody =
    view === "list" ? (
      <ListView
        rows={rows}
        grand={grand}
        onDistribute={
          canDistribute ? (type, month) => setTarget({ type, month }) : undefined
        }
        disableDistributeFor={disableDistributeFor}
      />
    ) : view === "bars" ? (
      <BarsView
        rows={rows}
        grand={grand}
        baseLabel={baseLabel}
        refLabel={refLabelText!}
      />
    ) : (
      <DonutView
        rows={rows}
        grand={grand}
        baseLabel={baseLabel}
        refLabel={refLabelText!}
      />
    );

  return (
    <>
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header — comparison controls only (the selectors say what is compared). */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <GitCompareArrows size={13} />
              Comparison
            </span>
            {/* Reset to the default comparison (previous submission). Revenue
                compares within the submission, so there is nothing to reset. */}
            {!revenueDetail && (
              <button
                type="button"
                onClick={onResetDefault}
                disabled={!canResetDefault}
                title={`Reset to the default comparison: the previous submission (the RFQ just before this one, across years), compared on its ${defaultSideText}.`}
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40"
              >
                <RotateCcw size={11} />
                Default
              </button>
            )}
          </div>
          {(revenueDetail ? rows.length > 0 : !!ref) && (
            <ViewToggle view={view} onChange={setView} />
          )}
        </div>

        {revenueDetail ? (
          // Revenue compares BL Input against the GAIA detail of this same
          // submission — no reference submission to pick.
          <p className="text-[11px] text-gray-500">
            BL Input vs{" "}
            <span className="font-medium text-gray-700">
              {config.actualsLabel} detail
            </span>{" "}
            · this submission, per type
          </p>
        ) : (
          <ReferenceSelector
            config={config}
            refValue={ref}
            allRfqs={allRfqs}
            onSelectRef={onSelectRef}
            loading={grid.referenceLoading}
          />
        )}
      </div>

      {revenueDetail ? (
        rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-gray-400">
            No revenue entered yet.
          </div>
        ) : (
          viewBody
        )
      ) : !ref ? (
        <div className="px-4 py-10 text-center text-xs text-gray-400">
          Pick a reference above to compare against.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-gray-400">
          Nothing to compare yet.
        </div>
      ) : (
        viewBody
      )}
    </div>

    {distributeRow && (
      <DistributeDifferenceDialog
        typeLabel={
          targetMonth != null
            ? `${distributeRow.label} · ${MONTH_LABELS[targetMonth - 1]}`
            : distributeRow.label
        }
        bucketLabel={config.bucketLabel}
        current={distCurrent}
        reference={distReference}
        initialMonth={targetMonth ?? undefined}
        lockedMonths={grid.canEditClosed ? undefined : grid.closedMonths}
        currentLabel={baseLabel}
        referenceLabel={refLabelText ?? ""}
        monthProfile={baseAgg[distributeRow.type] ?? emptyMonthly()}
        projects={grid.data.buckets.map<ProjectTarget>((b) => {
          const row = b.rows.find((r) => r.rowType === distributeRow.type);
          return {
            bucketId: b.bucketId,
            name: b.name,
            existing: row?.months ?? emptyMonthly(),
            hasType: !!row,
          };
        })}
        onApply={(updates) =>
          grid.addToCells(
            updates.map((u) => ({
              bucketId: u.bucketId,
              rowType: distributeRow.type,
              month: u.month,
              delta: u.delta,
            }))
          )
        }
        onClose={() => setTarget(null)}
      />
    )}
    </>
  );
}

// ─── View toggle (segmented control) ─────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const items: { mode: ViewMode; icon: typeof List; title: string }[] = [
    { mode: "list", icon: List, title: "List" },
    { mode: "bars", icon: BarChartHorizontal, title: "Variance bars" },
    { mode: "donut", icon: ChartPie, title: "Double donut" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-200/70 p-0.5">
      {items.map(({ mode, icon: Icon, title }) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={view === mode}
          onClick={() => onChange(mode)}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
            view === mode
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

// ─── Reference selector (year + submission + side, in the panel) ─────────────
// The base is always the current submission's BL Input; this picks the
// reference: any submission of any year (cross-year) and a side. For an
// annual-actuals axis (Media, Labs) the ADMIN side is the year's single annual
// MediaOcean, so the submission dropdown is disabled there (year alone matters).
// "Reset" returns to the default (previous submission) comparison in one click.

function ReferenceSelector({
  config,
  refValue,
  allRfqs,
  onSelectRef,
  loading,
}: {
  config: AxisConfig;
  refValue: ComparisonRef | null;
  allRfqs: { year: number; type: RFQType }[];
  onSelectRef: (ref: ComparisonRef | null) => void;
  loading: boolean;
}) {
  const years = useMemo(
    () => [...new Set(allRfqs.map((r) => r.year))].sort((a, b) => b - a),
    [allRfqs]
  );
  const refYear = refValue?.year ?? null;
  const submissions = useMemo(() => {
    if (refYear == null) return [];
    return allRfqs
      .filter((r) => r.year === refYear)
      .map((r) => r.type)
      .sort((a, b) => RFQ_TYPE_ORDER[a] - RFQ_TYPE_ORDER[b]);
  }, [allRfqs, refYear]);

  // The latest submission of a year — the sensible default when switching year.
  function latestRfqOf(year: number): RFQType | null {
    const types = allRfqs.filter((r) => r.year === year).map((r) => r.type);
    if (types.length === 0) return null;
    return types.reduce((a, b) => (RFQ_TYPE_ORDER[b] > RFQ_TYPE_ORDER[a] ? b : a));
  }

  // When starting from no reference, default the side to the axis's natural one
  // (BL Input for Media/Labs, GAIA for Revenue), matching defaultComparisonRef.
  const initialSide: ComparisonSide = config.annualActuals
    ? "BL_INPUT"
    : "ADMIN_INPUT";

  // The submission dropdown is meaningless for an annual MediaOcean reference.
  const submissionDisabled =
    !refValue || (config.annualActuals && refValue.side === "ADMIN_INPUT");

  function pickYear(value: string) {
    if (!value) {
      onSelectRef(null);
      return;
    }
    const year = Number(value);
    const side = refValue?.side ?? initialSide;
    // Keep the current submission if that year has it, else its latest one.
    const keep =
      refValue && allRfqs.some((r) => r.year === year && r.type === refValue.rfq);
    const rfq = keep ? refValue!.rfq : latestRfqOf(year);
    if (!rfq) return;
    onSelectRef({ year, rfq, side });
  }

  function pickRfq(rfq: RFQType) {
    if (!refValue) return;
    onSelectRef({ ...refValue, rfq });
  }

  function pickSide(side: ComparisonSide) {
    if (!refValue) return;
    onSelectRef({ ...refValue, side });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Reference selectors — year · submission · side */}
      <SelectControl
        value={refValue ? String(refValue.year) : ""}
        onChange={pickYear}
        disabled={years.length === 0}
        ariaLabel="Reference year"
      >
        <option value="">Compare with…</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </SelectControl>

      <SelectControl
        value={refValue?.rfq ?? ""}
        onChange={(v) => pickRfq(v as RFQType)}
        disabled={submissionDisabled}
        ariaLabel="Reference submission"
      >
        {submissions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </SelectControl>

      {/* Side is meaningless for Revenue — its comparison is the per-month
          source of truth (drawn from both BL and GAIA), so the picker is hidden. */}
      {config.axisId !== "revenue" && (
        <SelectControl
          value={refValue?.side ?? initialSide}
          onChange={(v) => pickSide(v as ComparisonSide)}
          disabled={!refValue}
          ariaLabel="Reference side"
        >
          <option value="BL_INPUT">BL Input</option>
          <option value="ADMIN_INPUT">
            {config.annualActuals
              ? `${config.actualsLabel} (annual)`
              : config.actualsLabel}
          </option>
        </SelectControl>
      )}

      {loading && <Loader2 size={13} className="animate-spin text-gray-400" />}
    </div>
  );
}

/** Compact native <select> styled like the rest of the panel. */
function SelectControl({
  value,
  onChange,
  disabled,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none rounded-lg border border-gray-200 bg-white py-1 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

// ─── List view (numeric table) ───────────────────────────────────────────────

function ListView({
  rows,
  grand,
  onDistribute,
  disableDistributeFor,
}: {
  rows: PanelRowData[];
  grand: { current: number; reference: number };
  /**
   * When set, a type row (month = null) or a single month (month = 1–12) is
   * clickable to distribute its difference.
   */
  onDistribute?: (type: string, month: number | null) => void;
  /** Row types excluded from distribution (e.g. the computed Commission row). */
  disableDistributeFor?: Set<string>;
}) {
  // Set of type rows whose monthly detail is expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(type: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <>
      {/* Column hint — what the two numbers on the right mean. */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
        <span>Type</span>
        <span>BL Input · Δ</span>
      </div>

      <div className="px-4">
        {rows.map((r) => (
          <ListTypeRow
            key={r.type}
            row={r}
            expanded={expanded.has(r.type)}
            onToggle={() => toggle(r.type)}
            onDistribute={
              onDistribute && !disableDistributeFor?.has(r.type)
                ? (month) => onDistribute(r.type, month)
                : undefined
            }
          />
        ))}
      </div>

      <GrandTotalBar grand={grand} />
    </>
  );
}

/**
 * A type row in the list view: a chevron toggles the 12-month detail, and the
 * rest of the row stays the annual "distribute the gap" target. Each expanded
 * month is itself a distribute target scoped to that month.
 */
function ListTypeRow({
  row,
  expanded,
  onToggle,
  onDistribute,
}: {
  row: PanelRowData;
  expanded: boolean;
  onToggle: () => void;
  /** month = null distributes the annual gap; 1–12 targets that month. */
  onDistribute?: (month: number | null) => void;
}) {
  const clickable = !!onDistribute;
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="group flex items-center gap-1.5 py-2.5">
        {/* Chevron — expand/collapse only, never distributes. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse months" : "Expand months"}
          className="-ml-1 shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>

        {/* Row body — clickable to distribute the annual difference. */}
        <div
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onDistribute!(null) : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDistribute!(null);
                  }
                }
              : undefined
          }
          title={
            clickable
              ? `Distribute ${row.label} difference into projects`
              : undefined
          }
          className={`flex min-w-0 flex-1 items-center justify-between gap-3 ${
            clickable
              ? "-mx-1 cursor-pointer rounded-lg px-1 transition-colors hover:bg-gray-50"
              : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: row.color }}
            />
            <span className="truncate text-sm text-gray-700">{row.label}</span>
            {clickable && (
              <SplitSquareHorizontal
                size={12}
                className="shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
              />
            )}
          </span>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="text-sm font-semibold tabular-nums text-gray-900">
              {formatMoney(row.current)}
            </span>
            <VariancePill current={row.current} reference={row.reference} />
          </div>
        </div>
      </div>

      {/* Expanded monthly detail — all 12 months. */}
      {expanded && (
        <div className="pb-2 pl-6">
          {MONTHS.map((m) => (
            <MonthRow
              key={m}
              label={MONTH_LABELS[m - 1]}
              current={row.currentMonths[m] ?? 0}
              reference={row.referenceMonths[m] ?? 0}
              onClick={onDistribute ? () => onDistribute(m) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One month inside an expanded type row — a month-scoped distribute target. */
function MonthRow({
  label,
  current,
  reference,
  onClick,
}: {
  label: string;
  current: number;
  reference: number;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      title={
        clickable ? `Distribute ${label} difference into projects` : undefined
      }
      className={`group/m flex items-center justify-between gap-3 py-1.5 ${
        clickable
          ? "-mx-1 cursor-pointer rounded-md px-1 transition-colors hover:bg-gray-50"
          : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-8 shrink-0 text-xs tabular-nums text-gray-500">
          {label}
        </span>
        {clickable && (
          <SplitSquareHorizontal
            size={11}
            className="shrink-0 text-gray-300 opacity-0 transition-opacity group-hover/m:opacity-100"
          />
        )}
      </span>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-xs font-medium tabular-nums text-gray-700">
          {formatMoney(current)}
        </span>
        <VariancePill current={current} reference={reference} />
      </div>
    </div>
  );
}

// ─── Shared grand-total footer (used by all three views) ─────────────────────

/** Dark footer bar: total in white with the variance as a vivid pill. */
function GrandTotalBar({
  grand,
}: {
  grand: { current: number; reference: number };
}) {
  return (
    <div className="px-4 py-3 bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-white uppercase tracking-wider">
          Total
        </span>
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold tabular-nums text-white">
            {formatMoney(grand.current)}
          </span>
          <VariancePill
            current={grand.current}
            reference={grand.reference}
            dark
          />
        </div>
      </div>
      <p className="mt-0.5 text-right text-[11px] tabular-nums text-gray-400">
        vs {formatMoney(grand.reference)}
      </p>
    </div>
  );
}

function PanelRow({
  label,
  current,
  reference,
  color,
  onClick,
}: PanelRowData & { onClick?: () => void }) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      title={clickable ? `Distribute ${label} difference into projects` : undefined}
      className={`group flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-b-0 ${
        clickable
          ? "-mx-2 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          : ""
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-gray-700 truncate">{label}</span>
        {clickable && (
          <SplitSquareHorizontal
            size={12}
            className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </span>

      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {formatMoney(current)}
        </span>
        <VariancePill current={current} reference={reference} />
      </div>
    </div>
  );
}

/** Signed variance as a tinted pill (green when up, red when down). */
function VariancePill({
  current,
  reference,
  dark = false,
}: {
  current: number;
  reference: number;
  dark?: boolean;
}) {
  const v = computeVariance(current, reference);

  if (v.absolute === 0) {
    return (
      <span
        className={`text-[11px] tabular-nums ${
          dark ? "text-gray-500" : "text-gray-400"
        }`}
      >
        —
      </span>
    );
  }

  const up = v.absolute > 0;
  const cls = dark
    ? up
      ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/25"
      : "bg-red-400/15 text-red-300 ring-1 ring-inset ring-red-400/25"
    : up
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-600";

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {signed(v.absolute)}
    </span>
  );
}

// ─── Bars view (volume bars, two per type) ───────────────────────────────────

/**
 * One horizontal bar scaled to a shared max volume, with its value at the end.
 * Colored with the row type's palette color so it agrees with the list and
 * donut views; the reference bar reuses the same color at reduced opacity.
 */
function VolumeBar({
  value,
  max,
  color,
  faded = false,
}: {
  value: number;
  max: number;
  color: string;
  faded?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 mt-1 first:mt-0">
      <div className="relative h-2.5 flex-1 rounded-full bg-gray-100">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            opacity: faded ? 0.4 : 1,
          }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-gray-500">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function BarsView({
  rows,
  grand,
  baseLabel,
  refLabel,
}: {
  rows: PanelRowData[];
  grand: { current: number; reference: number };
  baseLabel: string;
  refLabel: string;
}) {
  // Bars are scaled to absolute volume across both operands, so a 1000 bar is
  // twice as long as a 500 bar regardless of type.
  const maxVal = Math.max(1, ...rows.flatMap((r) => [r.current, r.reference]));

  return (
    <>
      <div className="px-4 py-3">
        {/* Encoding: solid = base submission, faded = reference (per-type color) */}
        <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="inline-block h-2 w-2 rounded-sm bg-gray-500 shrink-0" />
            <span className="truncate">{baseLabel}</span>
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="inline-block h-2 w-2 rounded-sm bg-gray-500/40 shrink-0" />
            <span className="truncate">{refLabel}</span>
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="text-sm text-gray-700 truncate">
                    {r.label}
                  </span>
                </span>
                <VariancePill current={r.current} reference={r.reference} />
              </div>
              <VolumeBar value={r.current} max={maxVal} color={r.color} />
              <VolumeBar value={r.reference} max={maxVal} color={r.color} faded />
            </div>
          ))}
        </div>
      </div>

      <GrandTotalBar grand={grand} />
    </>
  );
}

// ─── Donut view (nested double donut) ────────────────────────────────────────

/**
 * Two concentric donuts sharing the per-type color scale:
 *   outer ring → current RFQ distribution
 *   inner ring → reference distribution
 * Segment angles are each ring's share of its own total, so the two rings can
 * be read against each other type-by-type.
 */
function DonutView({
  rows,
  grand,
  baseLabel,
  refLabel,
}: {
  rows: PanelRowData[];
  grand: { current: number; reference: number };
  baseLabel: string;
  refLabel: string;
}) {
  const SIZE = 168;
  const C = SIZE / 2;

  return (
    <>
    <div className="px-4 py-4">
      <div className="flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          {/* Outer ring = current submission */}
          <DonutRing
            cx={C}
            cy={C}
            radius={66}
            width={20}
            total={grand.current}
            ringLabel={`${baseLabel} (outer)`}
            segments={rows.map((r) => ({
              value: r.current,
              color: r.color,
              label: r.label,
            }))}
          />
          {/* Inner ring = reference (comparison) */}
          <DonutRing
            cx={C}
            cy={C}
            radius={40}
            width={18}
            total={grand.reference}
            ringLabel={`${refLabel} (inner)`}
            segments={rows.map((r) => ({
              value: r.reference,
              color: r.color,
              label: r.label,
            }))}
          />
        </svg>
      </div>

      {/* Ring legend — name each ring directly, ref included inline */}
      <div className="mt-3 space-y-0.5 text-[11px] text-gray-500">
        <p className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400 ring-2 ring-gray-200 shrink-0" />
          <span className="truncate">Outer = {baseLabel}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-300 shrink-0" />
          <span className="truncate">Inner = {refLabel}</span>
        </p>
      </div>

      {/* Type legend — same row format as the list view for cohesion */}
      <div className="mt-3">
        {rows.map((r) => (
          <PanelRow key={r.type} {...r} />
        ))}
      </div>
    </div>

    <GrandTotalBar grand={grand} />
    </>
  );
}

/** A single donut ring rendered as stroked-circle arc segments. */
function DonutRing({
  cx,
  cy,
  radius,
  width,
  total,
  ringLabel,
  segments,
}: {
  cx: number;
  cy: number;
  radius: number;
  width: number;
  total: number;
  ringLabel: string;
  segments: { value: number; color: string; label: string }[];
}) {
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    // Empty ring placeholder when there is nothing to distribute.
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={width}
      />
    );
  }

  // Precompute each segment's dash length and starting offset so the render
  // pass stays free of reassignment (React Compiler immutability rule).
  const arcs = segments.reduce<
    { color: string; dash: number; offset: number; title: string }[]
  >((acc, s) => {
    if (s.value <= 0) return acc;
    const dash = (s.value / total) * circumference;
    const prev = acc.length ? acc[acc.length - 1] : null;
    const offset = prev ? prev.offset + prev.dash : 0;
    const pct = Math.round((s.value / total) * 100);
    acc.push({
      color: s.color,
      dash,
      offset,
      title: `${ringLabel} — ${s.label}: ${formatMoney(s.value)} (${pct}%)`,
    });
    return acc;
  }, []);

  return (
    <>
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={width}
      />
      {arcs.map((a, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={a.color}
          strokeWidth={width}
          strokeDasharray={`${a.dash} ${circumference - a.dash}`}
          strokeDashoffset={-a.offset}
        >
          <title>{a.title}</title>
        </circle>
      ))}
    </>
  );
}
