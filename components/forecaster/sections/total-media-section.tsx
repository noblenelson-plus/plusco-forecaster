// components/forecaster/sections/total-media-section.tsx
"use client";

/**
 * TOTAL MEDIA section (Looker replica) — restyled to Tristan's design system:
 * StatCard for the hero figure (with his variance pill) and ChartCard for the
 * pie. The channel table is the shared sortable/exportable VarianceTable.
 * Numbers/logic unchanged; presentation matches the app.
 */

import { TrendingUp, PieChart, Table } from "lucide-react";
import ForecasterPieChart from "../charts/pie-chart";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import VarianceTable from "../table/variance-table";
import { formatMoney } from "../../../lib/format/money";
import { computeVariance } from "../../../lib/types/forecaster.types";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};

function toVariance(absolute: number, relative: number | null): StatVariance | null {
  if (relative === null) return null;
  return {
    pillLabel: `${relative >= 0 ? "+" : "−"}${Math.abs(relative).toFixed(1)}%`,
    isFavorable: absolute >= 0,
  };
}

export default function TotalMediaSection({
  data,
  comparisonData,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const primaryLabel = selectedRFQ ? `${selectedRFQ.type} · ${selectedYear}` : "Primary";
  const variantLabel = comparisonRFQ ? `${comparisonRFQ.type} · ${comparisonYear}` : "Variant";

  const media = data.media;
  const hasComparison = comparisonData.hasContext;
  const compByType = new Map(comparisonData.media.byChannel.map((c) => [c.mediaType, c.annual]));

  if (media.totalAnnual === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No media spend for this selection.
      </div>
    );
  }

  const rows = media.byChannel
    .map((c) => {
      const variant = compByType.get(c.mediaType) ?? 0;
      const v = computeVariance(c.annual, variant);
      return { label: c.label, primary: c.annual, variant, absolute: v.absolute, relative: v.relative };
    })
    .filter((r) => r.primary > 0 || r.variant > 0)
    .sort((a, b) => b.primary - a.primary);

  const grand = computeVariance(media.totalAnnual, comparisonData.media.totalAnnual);
  const segments = media.byChannel.map((c) => ({ label: c.label, value: c.annual, color: c.color }));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Total Media</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <StatCard
            icon={TrendingUp}
            label="Total media spend"
            value={money(media.totalAnnual)}
            variance={hasComparison ? toVariance(grand.absolute, grand.relative) : null}
            sub={
              hasComparison
                ? `${grand.absolute >= 0 ? "+" : "−"}${money(Math.abs(grand.absolute))} vs ${variantLabel}`
                : undefined
            }
          />

          <ChartCard title="Total Media Investment ($)" icon={PieChart}>
            <ForecasterPieChart segments={segments} valueFormat={money} />
          </ChartCard>
        </div>

        <VarianceTable
          title="Media Channels"
          icon={Table}
          rows={rows}
          totals={{
            primary: media.totalAnnual,
            variant: comparisonData.media.totalAnnual,
            absolute: grand.absolute,
            relative: grand.relative,
          }}
          getLabel={(r) => r.label}
          labelHeader="Channel"
          primaryLabel={primaryLabel}
          variantLabel={variantLabel}
          hasComparison={hasComparison}
          exportTitle={`Media Channels — ${primaryLabel}`}
        />
      </div>
    </section>
  );
}