// components/dashboard/client-spend-chart.tsx
"use client";

/**
 * "By client" ranked bar card with a facet filter (media channel or Labs
 * partner). Sums the selected facets per client, ranks the top 15, and shows
 * each client's share of the filtered total. An empty filter means "all"
 * (the dashboard-wide multi-select convention). Scope-wide — it ignores the
 * client focus, since a per-client ranking of a single focused client is moot.
 *
 * The filter sits in the card's top-right action slot, flush to the edge, and
 * opens right-aligned so its menu stays inside the card.
 */

import { useState } from "react";
import { Building2 } from "lucide-react";
import ChartCard from "./charts/chart-card";
import BarList, { type BarItem } from "./charts/bar-list";
import { CATEGORICAL_COLORS } from "./charts/colors";
import { formatCompactMoney } from "./charts/format";
import MultiSelectDropdown, { type Option } from "../_shared/multi-select-dropdown";
import {
  groupTotalsByLabel,
  type ClientAnnualTotal,
} from "../../lib/dashboard/data/aggregate";

export interface ClientFacetSpend {
  clientId: string;
  /** Spend per facet id (channel or partner), in CAD. */
  byFacet: Record<string, number>;
}

const TOP_N = 15;

export default function ClientSpendChart({
  title,
  metricLabel,
  filterLabel,
  byClient,
  facetOptions,
  clientNameById,
}: {
  title: string;
  metricLabel: string;
  filterLabel: string;
  byClient: ClientFacetSpend[];
  facetOptions: Option[];
  clientNameById: Record<string, string>;
}) {
  // Empty = all facets (matches the dashboard's multi-select convention).
  const [selected, setSelected] = useState<string[]>([]);

  const activeFacets =
    selected.length > 0 ? selected : facetOptions.map((o) => o.value);
  const activeSet = new Set(activeFacets);

  const totals: ClientAnnualTotal[] = byClient.map((c) => ({
    clientId: c.clientId,
    total: Object.entries(c.byFacet).reduce(
      (acc, [facet, amt]) => (activeSet.has(facet) ? acc + amt : acc),
      0
    ),
  }));

  const items: BarItem[] = groupTotalsByLabel(
    totals,
    (id) => clientNameById[id] ?? "Unknown client"
  )
    .slice(0, TOP_N)
    .map((s, i) => ({
      label: s.label,
      value: s.annual,
      color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      hint: s.share !== null ? `${Math.round(s.share * 100)}%` : undefined,
    }));

  const filter = (
    <MultiSelectDropdown
      label={filterLabel}
      options={facetOptions}
      selectedValues={selected}
      onChange={setSelected}
      searchable
      align="right"
    />
  );

  return (
    <ChartCard
      title={title}
      subtitle={`Annual ${metricLabel} per client · top ${TOP_N} · share of total`}
      icon={Building2}
      action={filter}
    >
      {items.length > 0 ? (
        <BarList items={items} valueFormat={formatCompactMoney} />
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No spend for the selected {filterLabel.toLowerCase()}.
        </p>
      )}
    </ChartCard>
  );
}