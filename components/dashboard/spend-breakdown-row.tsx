// components/dashboard/spend-breakdown-row.tsx
"use client";

/**
 * Spend breakdown — a single row of three ranked bar cards (Agency & Region,
 * Business Lead, Client) with a Media / Labs toggle that switches which
 * per-client metric feeds all three. Each card shows its top 10 groups; the %
 * next to a group is its share of the active metric's scope total.
 *
 * Lives on the Forecast Summary tab. The Media and Labs tabs previously each
 * carried a two-card Region / Business Lead breakdown (DimensionBreakdown);
 * those consolidate here so the two metrics sit side by side under one toggle.
 */

import { useState } from "react";
import { MapPin, UserRound, Building2 } from "lucide-react";
import ChartCard from "./charts/chart-card";
import BarList, { type BarItem } from "./charts/bar-list";
import { CATEGORICAL_COLORS } from "./charts/colors";
import { formatCompactMoney } from "./charts/format";
import {
  groupTotalsByLabel,
  type ClientAnnualTotal,
} from "../../lib/dashboard/data/aggregate";

type Metric = "media" | "labs";
const TOP_N = 10;

/** Build the top-N ranked bar items for one label map under the active metric. */
function topItems(
  totals: ClientAnnualTotal[],
  labelByClient: Record<string, string>,
  fallback: string
): BarItem[] {
  const labelOf = (id: string) => labelByClient[id] ?? fallback;
  return groupTotalsByLabel(totals, labelOf)
    .slice(0, TOP_N)
    .map((s, i) => ({
      label: s.label,
      value: s.annual,
      color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      hint: s.share !== null ? `${Math.round(s.share * 100)}%` : undefined,
    }));
}

export default function SpendBreakdownRow({
  mediaTotals,
  labsTotals,
  agencyRegionByClient,
  businessLeadByClient,
  clientNameById,
}: {
  mediaTotals: ClientAnnualTotal[];
  labsTotals: ClientAnnualTotal[];
  agencyRegionByClient: Record<string, string>;
  businessLeadByClient: Record<string, string>;
  clientNameById: Record<string, string>;
}) {
  const [metric, setMetric] = useState<Metric>("media");

  const totals = metric === "media" ? mediaTotals : labsTotals;
  const metricLabel = metric === "media" ? "media spend" : "Labs spend";

  const regionItems = topItems(totals, agencyRegionByClient, "No agency / region");
  const leadItems = topItems(totals, businessLeadByClient, "Unassigned");
  const clientItems = topItems(totals, clientNameById, "Unknown client");

  const subtitle = (per: string) =>
    `Annual ${metricLabel} per ${per} · top ${TOP_N} · share of total`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Spend breakdown</h3>
          <p className="text-xs text-gray-500">
            Top {TOP_N} by agency &amp; region, business lead, and client
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5"
          role="tablist"
          aria-label="Spend metric"
        >
          {(["media", "labs"] as const).map((m) => {
            const active = metric === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetric(m)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {m === "media" ? "Media" : "Labs"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="By agency & region" subtitle={subtitle("agency & region")} icon={MapPin}>
          <BarList items={regionItems} valueFormat={formatCompactMoney} />
        </ChartCard>

        <ChartCard title="By business lead" subtitle={subtitle("business lead")} icon={UserRound}>
          <BarList items={leadItems} valueFormat={formatCompactMoney} />
        </ChartCard>

        <ChartCard title="By client" subtitle={subtitle("client")} icon={Building2}>
          <BarList items={clientItems} valueFormat={formatCompactMoney} />
        </ChartCard>
      </div>
    </div>
  );
}
