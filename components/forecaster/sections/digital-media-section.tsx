// components/forecaster/sections/digital-media-section.tsx
"use client";

/**
 * DIGITAL MEDIA section — Total Media restricted to digital channels, plus the
 * Digital Share KPI. Restyled to Tristan's StatCard / ChartCard system. The
 * channel table is the shared sortable/exportable VarianceTable.
 */

import { Monitor, Percent, PieChart, Table } from "lucide-react";
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

export default function DigitalMediaSection({
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

  if (media.digitalAnnual === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No digital media spend for this selection.
      </div>
    );
  }

  const rows = media.byChannel
    .filter((c) => c.digital)
    .map((c) => {
      const variant = compByType.get(c.mediaType) ?? 0;
      const v = computeVariance(c.annual, variant);
      return { label: c.label, primary: c.annual, variant, absolute: v.absolute, relative: v.relative };
    })
    .filter((r) => r.primary > 0 || r.variant > 0)
    .sort((a, b) => b.primary - a.primary);

  const grand = computeVariance(media.digitalAnnual, comparisonData.media.digitalAnnual);

  const share = media.digitalShare;
  const compShare = comparisonData.media.digitalShare;
  const shareVariancePts =
    hasComparison && share !== null && compShare !== null ? (share - compShare) * 100 : null;
  const shareVariance: StatVariance | null =
    shareVariancePts === null
      ? null
      : {
          pillLabel: `${shareVariancePts >= 0 ? "+" : "−"}${Math.abs(shareVariancePts).toFixed(2)} pts`,
          isFavorable: shareVariancePts >= 0,
        };

  const segments = media.byChannel
    .filter((c) => c.digital)
    .map((c) => ({ label: c.label, value: c.annual, color: c.color }));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Digital Media</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <StatCard
            icon={Monitor}
            label="Digital media spend"
            value={money(media.digitalAnnual)}
            variance={hasComparison ? toVariance(grand.absolute, grand.relative) : null}
            sub={
              hasComparison
                ? `${grand.absolute >= 0 ? "+" : "−"}${money(Math.abs(grand.absolute))} vs ${variantLabel}`
                : undefined
            }
          />

          <ChartCard title="Digital Media Investment ($)" icon={PieChart}>
            <ForecasterPieChart segments={segments} valueFormat={money} />
          </ChartCard>
        </div>

        <div className="space-y-6">
          <StatCard
            icon={Percent}
            label="Digital Share of Total Media"
            value={share === null ? "—" : `${(share * 100).toFixed(1)}%`}
            variance={shareVariance}
          />

          <VarianceTable
            title="Digital Channels"
            icon={Table}
            rows={rows}
            totals={{
              primary: media.digitalAnnual,
              variant: comparisonData.media.digitalAnnual,
              absolute: grand.absolute,
              relative: grand.relative,
            }}
            getLabel={(r) => r.label}
            labelHeader="Channel"
            primaryLabel={primaryLabel}
            variantLabel={variantLabel}
            hasComparison={hasComparison}
            exportTitle={`Digital Channels — ${primaryLabel}`}
          />
        </div>
      </div>
    </section>
  );
}