// components/forecaster/sections/investments/media-yoy-section.tsx
"use client";

/**
 * Exec KPI Dashboard → Media YOY. Replicates the Looker "YOY MEDIA INVESTMENTS"
 * page: MIR booked net, this year vs last year over the same months, by media
 * channel, by partner (Top 20, with the partner's 2026 deal and deal type) and by
 * client. Buy-level filters (channel, programmatic, partner, 2026 deal, deal
 * type, client) apply to every table, as in Looker. The page's Investment
 * Strategy KPI band lives on its own sub-tab (Investment Strategy KPIs).
 * Driven by the dashboard filters, the Year and the Exec Months filter. CAD.
 */

import { useMemo, useState } from "react";
import { BarChart3, CalendarRange, Handshake, Layers, Users, Wallet } from "lucide-react";
import StatCard, { type StatVariance } from "../../../dashboard/charts/stat-card";
import ChartCard from "../../../dashboard/charts/chart-card";
import MultiSelectDropdown from "../../../_shared/multi-select-dropdown";
import {
  useInvestmentDealsMix,
  useScopedClientNames,
} from "../../../../lib/dashboard/data/use-investment-deals-mix";
import {
  partnerYoy,
  scopeInvestmentRows,
  tag,
  unlinkedClients,
  yoyBy,
  net,
  type InvestmentDealsRow,
} from "../../../../lib/format/investment-deals";
import type { Client } from "../../../../lib/types/client.types";
import {
  Empty,
  ErrorBox,
  Loading,
  PageHeading,
  YoyTable,
  change,
  money,
  monthsLabel,
  pct,
  share,
  sourceNote,
} from "./investments-shared";

type FacetKey = "channel" | "programmatic" | "partner" | "deal" | "dealType" | "client";
const FACETS: { key: FacetKey; label: string; get: (r: InvestmentDealsRow) => string }[] = [
  { key: "channel", label: "Media Channel", get: (r) => tag(r.PLUSCO_MEDIA_CHANNEL) },
  { key: "programmatic", label: "Programmatic", get: (r) => tag(r.PLUSCO_PROGRAMMATIC) },
  { key: "partner", label: "Media Partner", get: (r) => tag(r.PLUSCO_MEDIA_PARTNER) },
  { key: "deal", label: "2026 Deals", get: (r) => tag(r.PLUSCO_2026_DEALS) },
  { key: "dealType", label: "Deal Type", get: (r) => tag(r.PLUSCO_DEALS_Type) },
  { key: "client", label: "Client", get: (r) => tag(r.PLUSCO_CLIENT_NAME) },
];
const NO_FACETS: Record<FacetKey, string[]> = { channel: [], programmatic: [], partner: [], deal: [], dealType: [], client: [] };

/** "Partner Deal" exactly (as Looker's Deal / Non-Deal split). */
const isPartnerDeal = (r: InvestmentDealsRow) => tag(r.PLUSCO_2026_DEALS).toUpperCase() === "PARTNER DEAL";

function variance(cur: number, prev: number, year: number): StatVariance | null {
  const p = change(cur, prev);
  if (p === null) return null;
  return {
    pillLabel: pct(p),
    isFavorable: p >= 0,
    absoluteLabel: `${money(cur - prev)} vs ${year - 1}`,
    absoluteSuffix: "",
  };
}

export default function MediaYoySection({
  scopedClientIds,
  clients,
  year,
  months,
  includeUnlinked = false,
}: {
  scopedClientIds: string[];
  clients: Client[];
  year: number;
  months?: readonly number[];
  includeUnlinked?: boolean;
}) {
  const { rows, loading, error } = useInvestmentDealsMix();
  const clientNames = useScopedClientNames(scopedClientIds, clients);
  const [facets, setFacets] = useState(NO_FACETS);

  const scoped = useMemo(
    () => scopeInvestmentRows(rows, [year - 1, year], { clientNames, includeUnlinked, months: months ?? [] }),
    [rows, year, clientNames, includeUnlinked, months]
  );
  const options = useMemo(() => {
    const out = {} as Record<FacetKey, { value: string; label: string }[]>;
    for (const f of FACETS) {
      out[f.key] = [...new Set(scoped.map(f.get))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    }
    return out;
  }, [scoped]);
  const filtered = useMemo(
    () => scoped.filter((r) => FACETS.every((f) => facets[f.key].length === 0 || facets[f.key].includes(f.get(r)))),
    [scoped, facets]
  );

  const byChannel = useMemo(() => yoyBy(filtered, year, (r) => tag(r.PLUSCO_MEDIA_CHANNEL)), [filtered, year]);
  const byPartner = useMemo(() => partnerYoy(filtered, year), [filtered, year]);
  const byClient = useMemo(() => yoyBy(filtered, year, (r) => tag(r.PLUSCO_CLIENT_NAME)), [filtered, year]);

  const sums = useMemo(() => {
    const s = { cur: 0, prev: 0, dealCur: 0, dealPrev: 0 };
    for (const r of filtered) {
      const isCur = String(r.PLUSCO_YEAR) === String(year);
      const v = net(r);
      if (isCur) s.cur += v;
      else s.prev += v;
      if (isPartnerDeal(r)) {
        if (isCur) s.dealCur += v;
        else s.dealPrev += v;
      }
    }
    return s;
  }, [filtered, year]);

  const curRows = useMemo(() => filtered.filter((r) => String(r.PLUSCO_YEAR) === String(year)), [filtered, year]);
  const source = useMemo(() => [...new Set(curRows.map((r) => r.SOURCE).filter(Boolean))].join(", "), [curRows]);
  const unlinked = useMemo(() => unlinkedClients(curRows), [curRows]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox what="Media YOY" message={error} />;

  const anyFacet = FACETS.some((f) => facets[f.key].length > 0);
  const empty = sums.cur === 0 && sums.prev === 0;

  return (
    <div className="space-y-6">
      <PageHeading icon={CalendarRange} title={`Media Investments ${year} vs ${year - 1}`} period={`${monthsLabel(months ?? [])} (same months both years)`}>
        {sourceNote(source, unlinked)} The Investment Strategy KPI band is on the Investment Strategy KPIs sub-tab.
      </PageHeading>

      <div className="flex flex-wrap items-center gap-2">
        {FACETS.map((f) => (
          <MultiSelectDropdown
            key={f.key}
            label={f.label}
            options={options[f.key]}
            selectedValues={facets[f.key]}
            onChange={(v) => setFacets((s) => ({ ...s, [f.key]: v }))}
            searchable={f.key === "partner" || f.key === "client"}
          />
        ))}
        {anyFacet && (
          <button type="button" onClick={() => setFacets(NO_FACETS)} className="text-xs font-medium text-primary hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {empty ? (
        <Empty>No booked media for {year - 1}–{year} in the current filters.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Wallet} label={`Total media ${year}`} value={money(sums.cur)} sub={`${year - 1}: ${money(sums.prev)}`} variance={variance(sums.cur, sums.prev, year)} />
            <StatCard
              icon={Handshake}
              label={`Deal partners ${year}`}
              value={money(sums.dealCur)}
              sub={`${share(sums.dealCur, sums.cur)} of total · 2026 Deals = "Partner Deal"`}
              variance={variance(sums.dealCur, sums.dealPrev, year)}
            />
            <StatCard
              icon={Users}
              label={`Non-deal partners ${year}`}
              value={money(sums.cur - sums.dealCur)}
              sub={`${share(sums.cur - sums.dealCur, sums.cur)} of total`}
              variance={variance(sums.cur - sums.dealCur, sums.prev - sums.dealPrev, year)}
            />
          </div>

          <ChartCard title="Media Spend by Channel" subtitle="PLUSCO_MEDIA_CHANNEL, booked net" icon={Layers}>
            <YoyTable labelHeaders={["Media channel"]} lines={byChannel} year={year} />
          </ChartCard>

          <ChartCard title="Top 20 Partners" subtitle="PLUSCO_MEDIA_PARTNER, ranked by this year's spend; deal and deal type from the 2026 deals key" icon={Handshake}>
            <YoyTable labelHeaders={["Partner", "2026 Deals", "Deal type"]} lines={byPartner} year={year} limit={20} numbered />
          </ChartCard>

          <ChartCard title="Top Partners by Client" subtitle="Pick clients (and partners) in the filters above to see their partners; ranked by this year's spend" icon={BarChart3}>
            <YoyTable labelHeaders={["Client"]} lines={byClient} year={year} limit={25} numbered />
          </ChartCard>
        </>
      )}
    </div>
  );
}
