//# filepath: components/dashboard/dimension-breakdown.tsx
"use client";

/**
 * Region / Business Lead distribution — a pair of ranked bar cards shared by
 * the three axis tabs (Media, Revenue, Labs). Each card groups the in-scope
 * clients' annual totals under a client attribute and shows every group's
 * amount plus a %: by default the group's share of the scope total, or — when
 * `shareDenominator` is given (Labs) — the group's ratio against a second
 * per-client metric (e.g. Labs spend over the group's planned media).
 */

import { MapPin, UserRound } from "lucide-react";
import ChartCard from "./charts/chart-card";
import BarList, { type BarItem } from "./charts/bar-list";
import { CATEGORICAL_COLORS } from "./charts/colors";
import { formatCompactMoney } from "./charts/format";
import {
  groupTotalsByLabel,
  type ClientAnnualTotal,
} from "../../lib/dashboard/data/aggregate";

/** Resolved display labels per client id, computed once on the dashboard page. */
export interface ClientDimensions {
  /** cl_id → region label ("No region" when unset). */
  regionByClient: Record<string, string>;
  /** cl_id → business lead display name ("Unassigned" when unset). */
  businessLeadByClient: Record<string, string>;
  /** cl_id → "Agency Region" label, e.g. "Cossette Media Ontario". */
  agencyRegionByClient: Record<string, string>;
}

function toItems(
  totals: ClientAnnualTotal[],
  labelByClient: Record<string, string>,
  fallback: string,
  denominatorTotals?: ClientAnnualTotal[]
): BarItem[] {
  const labelOf = (id: string) => labelByClient[id] ?? fallback;
  // Denominator per group (e.g. planned media per region) — grouped over ALL
  // its clients, so a client with media but no Labs still weighs in.
  const denomByLabel = denominatorTotals
    ? new Map(
        groupTotalsByLabel(denominatorTotals, labelOf).map((s) => [s.label, s.annual])
      )
    : null;

  return groupTotalsByLabel(totals, labelOf).map((s, i) => {
    let hint: string | undefined;
    if (denomByLabel) {
      const denom = denomByLabel.get(s.label) ?? 0;
      hint = denom > 0 ? `${Math.round((s.annual / denom) * 100)}%` : undefined;
    } else if (s.share !== null) {
      hint = `${Math.round(s.share * 100)}%`;
    }
    return {
      label: s.label,
      value: s.annual,
      color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      hint,
    };
  });
}

export default function DimensionBreakdown({
  totalsByClient,
  dimensions,
  metricLabel,
  shareDenominator,
}: {
  /** Annual total per in-scope client for the active axis, in CAD. */
  totalsByClient: ClientAnnualTotal[];
  dimensions: ClientDimensions;
  /** Metric name used in the card subtitles, e.g. "BL media spend". */
  metricLabel: string;
  /**
   * When set, the % next to each group is `group total / group denominator`
   * (e.g. Labs share of the group's planned media) instead of the group's
   * share of the scope total. `label` names the ratio in the subtitles.
   */
  shareDenominator?: { totalsByClient: ClientAnnualTotal[]; label: string };
}) {
  const regionItems = toItems(
    totalsByClient,
    dimensions.regionByClient,
    "No region",
    shareDenominator?.totalsByClient
  );
  const leadItems = toItems(
    totalsByClient,
    dimensions.businessLeadByClient,
    "Unassigned",
    shareDenominator?.totalsByClient
  );

  const shareText = shareDenominator?.label ?? "share of total";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard
        title="By region"
        subtitle={`Annual ${metricLabel} per region · ${shareText}`}
        icon={MapPin}
      >
        <BarList items={regionItems} valueFormat={formatCompactMoney} />
      </ChartCard>

      <ChartCard
        title="By business lead"
        subtitle={`Annual ${metricLabel} per business lead · ${shareText}`}
        icon={UserRound}
      >
        <BarList items={leadItems} valueFormat={formatCompactMoney} />
      </ChartCard>
    </div>
  );
}
