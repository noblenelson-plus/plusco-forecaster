// components/forecaster/sections/client-revenue-section.tsx
"use client";

/**
 * Client Revenue section — per-client Primary vs Secondary submission table
 * with variance. The Variance $ column uses a red→amber→green gradient by
 * magnitude, with a hard red band below −$50,000 (Adriana's Looker rule). The
 * Grand-total row is pinned to the bottom. Column headers reflect the live
 * submission + Type selection.
 */

import { useMemo } from "react";
import { Table } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { computeClientRevenue } from "./client-revenue-data";
import { formatMoney } from "../../../lib/format/money";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { ScopeForecastData, RevenueMode } from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};
const pct = (rel: number | null) => (rel === null ? "—" : `${rel.toFixed(1)}%`);
const modeLabel = (m: RevenueMode) => (m === "official" ? "OF" : "BL");

/**
 * Variance $ cell color. Hard red under −$50k (Adriana's rule). Otherwise a
 * red→amber→green gradient scaled to the largest magnitude in view, with a
 * light tint (readable dark text) that deepens toward the extremes.
 */
function varianceStyle(v: number, maxAbs: number): React.CSSProperties {
  if (v < -50000) return { backgroundColor: "#dc2626", color: "#fff", fontWeight: 600 };
  if (maxAbs === 0) return {};
  const t = Math.max(-1, Math.min(1, v / maxAbs)); // −1 … 0 … +1
  const hue = (t + 1) * 60; // 0 red → 60 amber → 120 green
  const sat = 65;
  const light = 90 - Math.abs(t) * 22; // deeper toward the extremes
  return { backgroundColor: `hsl(${hue} ${sat}% ${light}%)`, color: "#111827" };
}

export default function ClientRevenueSection({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();

  const hasComparison = comparisonData.hasContext;

  const result = useMemo(
    () =>
      computeClientRevenue(
        data, comparisonData, clients, usersMap,
        selectedYear ?? new Date().getFullYear(),
        scopedClientIds, primaryMode, secondaryMode, hasComparison
      ),
    [data, comparisonData, clients, usersMap, selectedYear, scopedClientIds, primaryMode, secondaryMode, hasComparison]
  );

  const primaryLabel = selectedRFQ ? `${selectedRFQ.type}-${modeLabel(primaryMode)} · ${selectedYear}` : "Primary";
  const secondaryLabel = comparisonRFQ ? `${comparisonRFQ.type}-${modeLabel(secondaryMode)} · ${comparisonYear}` : "Secondary";

  const maxAbs = useMemo(
    () => result.rows.reduce((m, r) => Math.max(m, Math.abs(r.variance)), 0),
    [result.rows]
  );

  if (result.rows.length === 0) return null;

  const totalVariance = result.totalPrimary - result.totalSecondary;
  const totalRel = result.totalSecondary > 0 ? (totalVariance / result.totalSecondary) * 100 : null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Client Revenue</h2>

      <ChartCard title="Client Revenue" icon={Table}>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">Client</th>
                <th className="py-2 px-3 text-left font-medium">Business Lead</th>
                <th className="py-2 px-3 text-left font-medium">Fee Structure</th>
                <th className="py-2 px-3 text-left font-medium">Status</th>
                <th className="py-2 px-3 text-left font-medium">Notes</th>
                <th className="py-2 px-3 text-right font-medium">{primaryLabel}</th>
                <th className="py-2 px-3 text-right font-medium">{secondaryLabel}</th>
                <th className="py-2 px-3 text-right font-medium">Variance $</th>
                <th className="py-2 pl-3 text-right font-medium">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.clientId} className="border-b border-border/60">
                  <td className="max-w-[180px] truncate py-2 pr-3 text-left text-foreground" title={r.name}>{r.name}</td>
                  <td className="max-w-[180px] truncate py-2 px-3 text-left text-muted-foreground" title={r.businessLead}>{r.businessLead || "—"}</td>
                  <td className="py-2 px-3 text-left text-muted-foreground">{r.feeStructure || "—"}</td>
                  <td className="py-2 px-3 text-left text-muted-foreground">{r.status || "—"}</td>
                  <td className="max-w-[200px] truncate py-2 px-3 text-left text-muted-foreground" title={r.notes}>{r.notes || "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{money(r.primary)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{hasComparison ? money(r.secondary) : "—"}</td>
                  <td className="py-1 px-1 text-right">
                    {hasComparison ? (
                      <span className="inline-block w-full rounded px-2 py-1 tabular-nums" style={varianceStyle(r.variance, maxAbs)}>
                        {money(r.variance)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{hasComparison ? pct(r.relative) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                <td className="py-2 pr-3 text-left">Grand total</td>
                <td colSpan={4} className="bg-muted" />
                <td className="py-2 px-3 text-right tabular-nums">{money(result.totalPrimary)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{hasComparison ? money(result.totalSecondary) : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{hasComparison ? money(totalVariance) : "—"}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{hasComparison ? pct(totalRel) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </section>
  );
}