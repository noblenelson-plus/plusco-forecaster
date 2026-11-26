// components/forecaster/sections/investments/broadcast-section.tsx
"use client";

/**
 * Exec KPI Dashboard → Broadcast. Replicates the Looker "Broadcast Investments"
 * page over MIR booked net on TV and Radio:
 *   - Broadcast categories: client × vendor market × vendor language, with the
 *     TV and Radio vendor-market split (PLUSCO_VENDOR_MARKET / _LANGUAGE from
 *     Vendor DB 2.0; a vendor with no market reads "Not tagged").
 *   - Radio and TV partners, ranked by spend.
 *   - Volume deals on TV / Radio by quarter.
 * Driven by the dashboard filters, the Year and the Exec Months filter. CAD.
 */

import { useMemo } from "react";
import { CalendarRange, MapPin, Radio, Tv } from "lucide-react";
import StatCard from "../../../dashboard/charts/stat-card";
import ChartCard from "../../../dashboard/charts/chart-card";
import DonutChart from "../../../dashboard/charts/donut-chart";
import { CATEGORICAL_COLORS, NEUTRAL_FILL } from "../../../dashboard/charts/colors";
import {
  useInvestmentDealsMix,
  useScopedClientNames,
} from "../../../../lib/dashboard/data/use-investment-deals-mix";
import {
  UNTAGGED,
  isBroadcast,
  isDealType,
  pivot,
  rowQuarter,
  scopeInvestmentRows,
  sumBy,
  tag,
  total,
  unlinkedClients,
  type InvestmentDealsRow,
} from "../../../../lib/format/investment-deals";
import type { Client } from "../../../../lib/types/client.types";
import { Band, Empty, ErrorBox, ListTable, Loading, MatrixTable, PageHeading, money, monthsLabel, share, sourceNote } from "./investments-shared";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function marketDonut(rows: InvestmentDealsRow[]) {
  const by = sumBy(rows, (r) => tag(r.PLUSCO_VENDOR_MARKET)).filter((m) => Math.round(m.net) !== 0);
  let i = 0;
  return by.map((m) => ({
    label: m.key,
    value: m.net,
    color: m.key === UNTAGGED ? NEUTRAL_FILL : CATEGORICAL_COLORS[i++ % CATEGORICAL_COLORS.length],
  }));
}

export default function BroadcastSection({
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

  const scoped = useMemo(
    () => scopeInvestmentRows(rows, [year], { clientNames, includeUnlinked, months: months ?? [] }).filter(isBroadcast),
    [rows, year, clientNames, includeUnlinked, months]
  );

  const v = useMemo(() => {
    const tv = scoped.filter((r) => tag(r.PLUSCO_MEDIA_CHANNEL) === "TV");
    const radio = scoped.filter((r) => tag(r.PLUSCO_MEDIA_CHANNEL) === "Radio");
    const categories = sumBy(scoped, (r) =>
      [tag(r.PLUSCO_MEDIA_CHANNEL), tag(r.PLUSCO_CLIENT_NAME), tag(r.PLUSCO_VENDOR_MARKET), tag(r.PLUSCO_VENDOR_LANGUAGE)].join("\u0000")
    )
      .filter((c) => Math.round(c.net) !== 0)
      .map((c) => ({ label: c.key.split("\u0000"), net: c.net }))
      .sort((a, b) => a.label[0].localeCompare(b.label[0]) || a.label[1].localeCompare(b.label[1]) || b.net - a.net);
    const volume = scoped.filter(isDealType("Volume Deals"));
    return {
      tvTotal: total(tv),
      radioTotal: total(radio),
      tvUntagged: total(tv.filter((r) => tag(r.PLUSCO_VENDOR_MARKET) === UNTAGGED)),
      radioUntagged: total(radio.filter((r) => tag(r.PLUSCO_VENDOR_MARKET) === UNTAGGED)),
      tvPartners: sumBy(tv, (r) => tag(r.PLUSCO_MEDIA_PARTNER)).filter((p) => Math.round(p.net) !== 0),
      radioPartners: sumBy(radio, (r) => tag(r.PLUSCO_MEDIA_PARTNER)).filter((p) => Math.round(p.net) !== 0),
      tvMarkets: marketDonut(tv),
      radioMarkets: marketDonut(radio),
      categories,
      volumeTotal: total(volume),
      volumeByQuarter: pivot(volume, (r) => [tag(r.PLUSCO_DEALS_Category), tag(r.PLUSCO_MEDIA_PARTNER)], (r) => rowQuarter(r) ?? UNTAGGED, QUARTERS),
      source: [...new Set(scoped.map((r) => r.SOURCE).filter(Boolean))].join(", "),
      unlinked: unlinkedClients(scoped),
    };
  }, [scoped]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox what="Broadcast" message={error} />;

  return (
    <div className="space-y-6">
      <PageHeading icon={Tv} title="Broadcast Investments" period={`${year} · ${monthsLabel(months ?? [])}`}>
        {sourceNote(v.source, v.unlinked)} TV and Radio only. Vendor market and language are <code>PLUSCO_VENDOR_MARKET</code> /{" "}
        <code>PLUSCO_VENDOR_LANGUAGE</code> from Vendor DB 2.0; vendors without a market show as &ldquo;{UNTAGGED}&rdquo;.
      </PageHeading>

      {v.tvTotal === 0 && v.radioTotal === 0 ? (
        <Empty>No TV or Radio spend for {year} in the current filters.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Tv} label="TV" value={money(v.tvTotal)} sub={v.tvUntagged ? `${money(v.tvUntagged)} with no vendor market` : "Every vendor has a market"} />
            <StatCard icon={Radio} label="Radio" value={money(v.radioTotal)} sub={v.radioUntagged ? `${money(v.radioUntagged)} with no vendor market` : "Every vendor has a market"} />
            <StatCard
              icon={CalendarRange}
              label="Volume deals on TV / Radio"
              value={money(v.volumeTotal)}
              sub={`${share(v.volumeTotal, v.tvTotal + v.radioTotal)} of broadcast`}
            />
          </div>

          <Band>Broadcast categories</Band>
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Spend by client, vendor market and language" subtitle="TV and Radio" icon={MapPin}>
              <ListTable
                headers={["Channel", "Client", "Vendor market", "Language", "Net ordered (CAD)"]}
                rows={v.categories}
                maxHeight={560}
              />
            </ChartCard>
            <div className="space-y-6">
              <ChartCard title="Vendor Market — TV" icon={Tv}>
                {v.tvMarkets.length ? <DonutChart segments={v.tvMarkets} variant="compact" valueFormat={money} centerValue={money(v.tvTotal)} centerLabel="TV" /> : <Empty>No TV spend.</Empty>}
              </ChartCard>
              <ChartCard title="Vendor Market — Radio" icon={Radio}>
                {v.radioMarkets.length ? <DonutChart segments={v.radioMarkets} variant="compact" valueFormat={money} centerValue={money(v.radioTotal)} centerLabel="Radio" /> : <Empty>No Radio spend.</Empty>}
              </ChartCard>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Radio partners" subtitle={`${v.radioPartners.length} partners`} icon={Radio}>
              <ListTable headers={["Partner", "Net ordered (CAD)"]} rows={v.radioPartners.map((p) => ({ label: [p.key], net: p.net }))} maxHeight={480} />
            </ChartCard>
            <ChartCard title="TV partners" subtitle={`${v.tvPartners.length} partners`} icon={Tv}>
              <ListTable headers={["Partner", "Net ordered (CAD)"]} rows={v.tvPartners.map((p) => ({ label: [p.key], net: p.net }))} maxHeight={480} />
            </ChartCard>
          </div>

          <Band>Volume deals</Band>
          <ChartCard title="Volume deals on TV and Radio by quarter" subtitle='PLUSCO_DEALS_Type "Volume Deals"' icon={CalendarRange}>
            {v.volumeByQuarter.rows.length === 0 ? (
              <Empty>No volume deal spend on TV or Radio.</Empty>
            ) : (
              <MatrixTable labelHeaders={["Deals category", "Partner"]} matrix={v.volumeByQuarter} />
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
