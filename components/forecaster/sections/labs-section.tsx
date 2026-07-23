// components/forecaster/sections/labs-section.tsx
"use client";

/**
 * LABS section — restyled to Tristan's StatCard / ChartCard system. Grand total
 * + pie (left), six KPI StatCards + partner table (right), and a full-width
 * partner comparison bar chart. Figures come from computeLabsKpis. The partner
 * table is the shared sortable/exportable VarianceTable.
 */

import { useMemo } from "react";
import { FlaskConical, PieChart, Table, BarChart3 } from "lucide-react";
import ForecasterPieChart from "../charts/pie-chart";
import GroupedBarChart from "../charts/grouped-bar-chart";
import { computeLabsKpis } from "./labs-kpis";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import VarianceTable from "../table/variance-table";
import { formatMoney } from "../../../lib/format/money";
import { formatCompactMoney } from "../../dashboard/charts/format";
import { computeVariance } from "../../../lib/types/forecaster.types";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};
const pctVal = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function moneyVariance(absolute: number, relative: number | null): StatVariance | null {
  if (relative === null) return null;
  return {
    pillLabel: `${relative >= 0 ? "+" : "−"}${Math.abs(relative).toFixed(1)}%`,
    isFavorable: absolute >= 0,
  };
}
function ptsVariance(v: number | null): StatVariance | null {
  if (v === null) return null;
  return {
    pillLabel: `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} pts`,
    isFavorable: v >= 0,
  };
}

export default function LabsSection({
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

  const hasComparison = comparisonData.hasContext;
  const result = useMemo(() => computeLabsKpis(data, comparisonData), [data, comparisonData]);

  if (result.totalLabs === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No Labs spend for this selection.
      </div>
    );
  }

  const grand = computeVariance(result.totalLabs, result.compTotalLabs);
  const barData = result.partners.map((p) => ({ name: p.name, primary: p.primary, variant: p.variant }));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Labs</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: grand total + pie */}
        <div className="space-y-6">
          <StatCard
            icon={FlaskConical}
            label="Labs spend"
            value={money(result.totalLabs)}
            variance={hasComparison ? moneyVariance(grand.absolute, grand.relative) : null}
            sub={
              hasComparison
                ? `${grand.absolute >= 0 ? "+" : "−"}${money(Math.abs(grand.absolute))} vs ${variantLabel}`
                : undefined
            }
          />
          <ChartCard title="Labs Media Investment ($)" icon={PieChart}>
            <ForecasterPieChart segments={result.segments} valueFormat={money} />
          </ChartCard>
        </div>

        {/* Right: KPI grid + partner table */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {result.kpis.map((k) => (
              <StatCard
                key={k.label}
                label={k.label}
                value={pctVal(k.value)}
                variance={hasComparison ? ptsVariance(k.variancePts) : null}
              />
            ))}
          </div>

          <VarianceTable
            title="Partners"
            icon={Table}
            rows={result.partners}
            totals={{
              primary: result.totalLabs,
              variant: result.compTotalLabs,
              absolute: grand.absolute,
              relative: grand.relative,
            }}
            getLabel={(r) => r.name}
            labelHeader="Partner"
            primaryLabel={primaryLabel}
            variantLabel={variantLabel}
            hasComparison={hasComparison}
            exportTitle={`Labs Partners — ${primaryLabel}`}
          />
        </div>
      </div>

      <ChartCard
        title="Labs Partners"
        icon={BarChart3}
        subtitle={hasComparison ? `Comparing ${primaryLabel} vs ${variantLabel}` : undefined}
      >
        <GroupedBarChart
          data={barData}
          primaryLabel={primaryLabel}
          variantLabel={variantLabel}
          valueFormat={formatCompactMoney}
        />
      </ChartCard>
    </section>
  );
}