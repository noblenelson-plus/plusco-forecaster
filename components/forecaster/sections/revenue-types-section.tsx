// components/forecaster/sections/revenue-types-section.tsx
"use client";

/**
 * Revenue Types section — mirrors the Total Media section for the Revenue page.
 * Hero total (with variance pill + sub), a pie of revenue split by stream, and
 * a variance table (stream · primary · variant · variance $ · variance %).
 *
 * Both the pie and the table honor the page's revenue-types selection, and both
 * show Commission + Commission Overwrite merged as one "Commission" — the merge
 * and the selection are applied by selectedStreamSlices so every surface agrees.
 *
 * Official (OF) revenue is a single untyped total, so it can't be split by
 * revenue type. When a side is in Official mode the type breakdown falls back to
 * that side's BL data (labelled "BL", with a note under the header) so the
 * comparison stays meaningful — see typeBreakdownMode below.
 */

import { useMemo } from "react";
import { DollarSign, PieChart, Table } from "lucide-react";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import ForecasterPieChart from "../charts/pie-chart";
import VarianceTable from "../table/variance-table";
import { selectedStreamSlices, sumSlices } from "./revenue-types-data";
import { formatMoney } from "../../../lib/format/money";
import { computeVariance } from "../../../lib/types/forecaster.types";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { OFFICIAL_STREAM_KEY } from "../../../lib/dashboard/data/aggregate";
import type {
  ScopeForecastData,
  RevenueMode,
} from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};

const modeLabel = (mode: RevenueMode) => (mode === "official" ? "OF" : "BL");

/**
 * The mode this table actually breaks down by type. Official revenue is a single
 * untyped total (GAIA gives one figure, not a per-type split), so an Official
 * side falls back to BL — otherwise every type row would be blank.
 */
const typeBreakdownMode = (mode: RevenueMode): RevenueMode =>
  mode === "official" ? "blSubmission" : mode;

/**
 * The stream selection a side actually uses: the page selection for BL, but the
 * lone official key when the side is in Official mode (so the BL revenue-type
 * filter never zeroes the single OF figure). Stable identity for OFFICIAL_ONLY
 * keeps the memos below from recomputing needlessly.
 */
const OFFICIAL_ONLY: ReadonlySet<string> = new Set([OFFICIAL_STREAM_KEY]);
const streamSelectionFor = (
  mode: RevenueMode,
  selected: ReadonlySet<string>
): ReadonlySet<string> => (mode === "official" ? OFFICIAL_ONLY : selected);

function toVariance(absolute: number, relative: number | null): StatVariance | null {
  if (relative === null) return null;
  return {
    pillLabel: `${relative >= 0 ? "+" : "−"}${Math.abs(relative).toFixed(1)}%`,
    isFavorable: absolute >= 0,
  };
}

export default function RevenueTypesSection({
  data,
  comparisonData,
  primaryMode,
  secondaryMode,
  selectedStreams,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  /** The page's revenue-types selection (merged-commission keys). */
  selectedStreams: ReadonlySet<string>;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const hasComparison = comparisonData.hasContext;

  // Official revenue isn't typed, so the type breakdown always uses BL.
  const effPrimaryMode = typeBreakdownMode(primaryMode);
  const effSecondaryMode = typeBreakdownMode(secondaryMode);
  const showsBlFallback =
    primaryMode === "official" || secondaryMode === "official";

  const primaryLabel = selectedRFQ
    ? `${selectedRFQ.type}-${modeLabel(effPrimaryMode)} · ${selectedYear}`
    : "Primary";
  const variantLabel = comparisonRFQ
    ? `${comparisonRFQ.type}-${modeLabel(effSecondaryMode)} · ${comparisonYear}`
    : "Variant";

  // Selected + commission-merged slices for each side. A side in Official mode
  // selects the official key alone (see file header) so the BL revenue-type
  // filter can't zero it.
  const primarySlices = useMemo(
    () =>
      selectedStreamSlices(
        data.revenueByMode[effPrimaryMode].breakdown.byStream,
        streamSelectionFor(effPrimaryMode, selectedStreams)
      ),
    [data, effPrimaryMode, selectedStreams]
  );
  const comparisonSlices = useMemo(
    () =>
      hasComparison
        ? selectedStreamSlices(
            comparisonData.revenueByMode[effSecondaryMode].breakdown.byStream,
            streamSelectionFor(effSecondaryMode, selectedStreams)
          )
        : [],
    [comparisonData, effSecondaryMode, selectedStreams, hasComparison]
  );

  const primaryTotal = useMemo(() => sumSlices(primarySlices), [primarySlices]);
  const comparisonTotal = useMemo(() => sumSlices(comparisonSlices), [comparisonSlices]);
  const grand = computeVariance(primaryTotal, comparisonTotal);

  // Table rows: one per selected stream, joined to its comparison figure.
  const compByKey = useMemo(
    () => new Map(comparisonSlices.map((s) => [s.key, s.annual])),
    [comparisonSlices]
  );
  const tableRows = useMemo(
    () =>
      primarySlices.map((slice) => {
        const variant = compByKey.get(slice.key) ?? 0;
        const v = computeVariance(slice.annual, variant);
        return {
          label: slice.label,
          primary: slice.annual,
          variant,
          absolute: v.absolute,
          relative: v.relative,
        };
      }),
    [primarySlices, compByKey]
  );

  const pieSegments = primarySlices
    .filter((s) => s.annual > 0)
    .map((s) => ({ label: s.label, value: s.annual, color: s.color }));

  if (primarySlices.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Revenue Types</h2>
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No revenue types selected.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Revenue Types</h2>
      {showsBlFallback && (
        <p className="text-xs text-muted-foreground">
          Official revenue has no revenue-type breakdown, so this table compares
          BL submissions.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <StatCard
            icon={DollarSign}
            label="Total revenue"
            value={money(primaryTotal)}
            variance={hasComparison ? toVariance(grand.absolute, grand.relative) : null}
            sub={
              hasComparison
                ? `${grand.absolute >= 0 ? "+" : "−"}${money(Math.abs(grand.absolute))} vs ${variantLabel}`
                : undefined
            }
          />

          <ChartCard title="Revenue by Type ($)" icon={PieChart}>
            <ForecasterPieChart segments={pieSegments} valueFormat={money} />
          </ChartCard>
        </div>

        <VarianceTable
          title="Revenue Types"
          icon={Table}
          rows={tableRows}
          totals={{
            primary: primaryTotal,
            variant: comparisonTotal,
            absolute: grand.absolute,
            relative: grand.relative,
          }}
          getLabel={(r) => r.label}
          labelHeader="Revenue Type"
          primaryLabel={primaryLabel}
          variantLabel={variantLabel}
          hasComparison={hasComparison}
          exportTitle={`Revenue Types — ${primaryLabel}`}
        />
      </div>
    </section>
  );
}