// components/forecaster/sections/labs-section.tsx
"use client";

/**
 * LABS section — restyled to Tristan's StatCard / ChartCard system. Grand total
 * + pie (left), six KPI StatCards + partner table (right), and a full-width
 * partner comparison bar chart. Figures come from computeLabsKpis. The partner
 * table is the shared sortable/exportable VarianceTable.
 */

import { useMemo, useState } from "react";
import { FlaskConical, PieChart, Table, BarChart3 } from "lucide-react";
import ForecasterPieChart from "../charts/pie-chart";
import GroupedBarChart from "../charts/grouped-bar-chart";
import { computeLabsKpis, PARTNER_PALETTE, type LabsPartnerRow } from "./labs-kpis";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import VarianceTable from "../table/variance-table";
import LabsEligibilityTable from "./labs-eligibility-table";
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
  scopedClientIds,
  focusedClientId,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  focusedClientId: string | null;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const primaryLabel = selectedRFQ ? `${selectedRFQ.type} · ${selectedYear}` : "Primary";
  const variantLabel = comparisonRFQ ? `${comparisonRFQ.type} · ${comparisonYear}` : "Variant";

  const hasComparison = comparisonData.hasContext;
  const result = useMemo(() => computeLabsKpis(data, comparisonData), [data, comparisonData]);

  // Partners table view: "Detailed" (per split partner, default) or "Grouped"
  // (Billups-*, MIQ-*, AIM-* rolled to Billups / MIQ / AIM; standalone partners
  // unchanged). Variance $ and % are RE-COMPUTED on the combined totals, not
  // averaged, so the rolled numbers stay honest.
  const [view, setView] = useState<"Detailed" | "Grouped">("Detailed");
  const groupedPartners = useMemo<LabsPartnerRow[]>(() => {
    const PARENTS = ["Billups", "MIQ", "AIM"];
    const parentOf = (name: string) =>
      PARENTS.find((prefix) => name.startsWith(prefix)) ?? name;
    const byParent = new Map<string, { primary: number; variant: number }>();
    const order: string[] = [];
    for (const pt of result.partners) {
      const key = parentOf(pt.name);
      const existing = byParent.get(key);
      if (existing) {
        existing.primary += pt.primary;
        existing.variant += pt.variant;
      } else {
        byParent.set(key, { primary: pt.primary, variant: pt.variant });
        order.push(key);
      }
    }
    return order
      .map((name) => {
        const g = byParent.get(name) ?? { primary: 0, variant: 0 };
        const absolute = g.primary - g.variant;
        return {
          name,
          primary: g.primary,
          variant: g.variant,
          absolute,
          relative: g.variant > 0 ? (absolute / g.variant) * 100 : null,
        };
      })
      .sort((a, b) => b.primary - a.primary);
  }, [result.partners]);

  if (result.totalLabs === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No Labs spend for this selection.
      </div>
    );
  }

  const grand = computeVariance(result.totalLabs, result.compTotalLabs);
  // Pie + bar follow the Detailed/Grouped toggle too; the rest of the page stays put.
  const shownPartners = view === "Grouped" ? groupedPartners : result.partners;
  const barData = shownPartners.map((p) => ({
    name: p.name,
    primary: p.primary,
    variant: p.variant,
  }));
  const groupedSegments = groupedPartners.map((p, i) => ({
    label: p.name,
    value: p.primary,
    color: PARTNER_PALETTE[i % PARTNER_PALETTE.length],
  }));

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
            <ForecasterPieChart
              segments={view === "Grouped" ? groupedSegments : result.segments}
              valueFormat={money}
            />
          </ChartCard>
          <LabsEligibilityTable
            year={selectedYear}
            scopedClientIds={scopedClientIds}
            focusedClientId={focusedClientId}
          />
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
            rows={view === "Grouped" ? groupedPartners : result.partners}
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
            exportTitle={`Labs Partners${
              view === "Grouped" ? " (Grouped)" : ""
            } — ${primaryLabel}`}
            action={
              <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
                {(["Detailed", "Grouped"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      view === v
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            }
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