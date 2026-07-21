// components/forecaster/sections/total-media-section.tsx
"use client";

/**
 * TOTAL MEDIA section (Looker replica) — restyled to Tristan's design system:
 * StatCard for the hero figure (with his variance pill) and ChartCard for the
 * pie and channel table. Numbers/logic unchanged; presentation matches the app.
 */

import { TrendingUp, PieChart, Table } from "lucide-react";
import ForecasterPieChart from "../charts/pie-chart";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import { formatMoney } from "../../../lib/format/money";
import { computeVariance } from "../../../lib/types/forecaster.types";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};
const pct = (rel: number | null) => (rel === null ? "—" : `${rel.toFixed(1)}%`);

function toVariance(absolute: number, relative: number | null): StatVariance | null {
  if (relative === null) return null;
  return {
    pillLabel: `${relative >= 0 ? "+" : "−"}${Math.abs(relative).toFixed(1)}%`,
    isFavorable: absolute >= 0,
    absoluteLabel: `${absolute >= 0 ? "+" : "−"}${money(Math.abs(absolute))}`,
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
          />

          <ChartCard title="Total Media Investment ($)" icon={PieChart}>
            <ForecasterPieChart segments={segments} valueFormat={money} />
          </ChartCard>
        </div>

        <ChartCard title="Media Channels" icon={Table}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left font-medium">Channel</th>
                <th className="py-2 text-right font-medium">{primaryLabel}</th>
                <th className="py-2 text-right font-medium">{variantLabel}</th>
                <th className="py-2 text-right font-medium">Variance $</th>
                <th className="py-2 text-right font-medium">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border/60">
                  <td className="py-2 text-left text-foreground">{r.label}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(r.primary)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{hasComparison ? money(r.variant) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{hasComparison ? money(r.absolute) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{hasComparison ? pct(r.relative) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 text-left text-foreground">Grand total</td>
                <td className="py-2 text-right tabular-nums text-foreground">{money(media.totalAnnual)}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{hasComparison ? money(comparisonData.media.totalAnnual) : "—"}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{hasComparison ? money(grand.absolute) : "—"}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{hasComparison ? pct(grand.relative) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </ChartCard>
      </div>
    </section>
  );
}