// components/forecaster/sections/strategy-kpis-section.tsx
"use client";

/**
 * Investment Strategy KPIs — the hero band at the top of the Media & Labs tab.
 * A single unified card: three group headers (Shift to Programmatic / Meta
 * Derisking / Labs Growth) over a tight row of compact metric tiles. Deltas
 * show only when a variant submission is selected.
 */

import { useMemo } from "react";
import { computeStrategyKpis, type StrategyTile } from "./strategy-kpis";
import { formatMoney } from "../../../lib/format/money";
import { Card } from "../../ui/card";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};

function tileValue(t: StrategyTile): string {
  if (t.kind === "money") return money(t.value ?? 0);
  return t.value === null ? "—" : `${(t.value * 100).toFixed(0)}%`;
}
function tileDelta(t: StrategyTile): { text: string; up: boolean } | null {
  if (t.delta === null) return null;
  const up = t.delta >= 0;
  const text =
    t.kind === "money"
      ? `${up ? "+" : "−"}${money(Math.abs(t.delta))}`
      : `${up ? "+" : "−"}${Math.abs(t.delta).toFixed(2)} pts`;
  return { text, up };
}

export default function StrategyKpisSection({
  data,
  comparisonData,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
}) {
  const hasComparison = comparisonData.hasContext;
  const groups = useMemo(() => computeStrategyKpis(data, comparisonData), [data, comparisonData]);

  if (data.media.totalAnnual === 0) return null;

  const tiles = groups.flatMap((g) => g.tiles);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Investment Strategy KPIs</h2>

      <Card className="overflow-hidden p-0">
        {/* Group headers — aligned to the tile spans (2 / 1 / 4). */}
        <div className="hidden grid-cols-7 divide-x divide-border border-b border-border bg-muted/50 lg:grid">
          <div className="col-span-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Shift to Programmatic
          </div>
          <div className="col-span-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Meta Derisking
          </div>
          <div className="col-span-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Labs Growth
          </div>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
          {tiles.map((t) => {
            const d = tileDelta(t);
            return (
              <div key={t.label} className="px-4 py-3">
                <p className="truncate text-[11px] font-medium text-muted-foreground" title={t.label}>
                  {t.label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{tileValue(t)}</p>
                {hasComparison && d && (
                  <p className={`mt-0.5 text-[11px] font-semibold ${d.up ? "text-green-600" : "text-red-600"}`}>
                    {d.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}