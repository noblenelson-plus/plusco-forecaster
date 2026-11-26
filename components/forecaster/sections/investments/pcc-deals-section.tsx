// components/forecaster/sections/investments/pcc-deals-section.tsx
"use client";

/**
 * Exec KPI Dashboard → PCC Deals. Replicates the Looker "PCC Deals" page: MIR
 * booked net on the PlusCo partner deals, by the deal tags of the 2026 deals key
 * (PLUSCO_DEALS_Type → _Category → _Channel → partner):
 *   - Labs deals (types "Labs" and "Labs - BRP", as in Looker), plus the SSP
 *     ("Labs - SSP") and PBB ("Labs - PBB") partners.
 *   - Volume deals: Traditional & Multiplatform partners by media channel, then
 *     one list per digital deals channel (Premium Pubs, Social, DSPs), plus the
 *     OLG volume deal ("Volume Deals - OLG").
 * Driven by the dashboard filters, the Year and the Exec Months filter. CAD.
 */

import { useMemo } from "react";
import { FlaskConical, Handshake, Layers, Radio, Server } from "lucide-react";
import StatCard from "../../../dashboard/charts/stat-card";
import ChartCard from "../../../dashboard/charts/chart-card";
import {
  useInvestmentDealsMix,
  useScopedClientNames,
} from "../../../../lib/dashboard/data/use-investment-deals-mix";
import {
  dealTree,
  isDealType,
  isLabsDeal,
  pivot,
  scopeInvestmentRows,
  sumBy,
  tag,
  total,
  unlinkedClients,
} from "../../../../lib/format/investment-deals";
import type { Client } from "../../../../lib/types/client.types";
import { Band, Empty, ErrorBox, ListTable, Loading, MatrixTable, PageHeading, money, monthsLabel, sourceNote } from "./investments-shared";

const MEDIA_CHANNEL_ORDER = ["TV", "Radio", "Digital Direct", "OOH", "Print"];

export default function PccDealsSection({
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
    () => scopeInvestmentRows(rows, [year], { clientNames, includeUnlinked, months: months ?? [] }),
    [rows, year, clientNames, includeUnlinked, months]
  );

  const v = useMemo(() => {
    const labs = scoped.filter(isLabsDeal);
    const ssp = scoped.filter(isDealType("Labs - SSP"));
    const pbb = scoped.filter(isDealType("Labs - PBB"));
    const volume = scoped.filter(isDealType("Volume Deals"));
    const olg = scoped.filter(isDealType("Volume Deals - OLG"));
    const volumeTrad = volume.filter((r) => tag(r.PLUSCO_DEALS_Category) === "Traditional & Multiplatform");
    const volumeDigital = volume.filter((r) => tag(r.PLUSCO_DEALS_Category) !== "Traditional & Multiplatform");
    const digitalGroups = sumBy(volumeDigital, (r) => tag(r.PLUSCO_DEALS_Channel)).map((g) => ({
      channel: g.key,
      partners: sumBy(
        volumeDigital.filter((r) => tag(r.PLUSCO_DEALS_Channel) === g.key),
        (r) => tag(r.PLUSCO_MEDIA_PARTNER)
      ),
    }));
    return {
      labs,
      labsTree: dealTree(labs),
      ssp: sumBy(ssp, (r) => tag(r.PLUSCO_MEDIA_PARTNER)),
      pbb: pivot(pbb, (r) => [tag(r.PLUSCO_DEALS_Category), tag(r.PLUSCO_MEDIA_PARTNER)], (r) => tag(r.PLUSCO_MEDIA_CHANNEL), MEDIA_CHANNEL_ORDER),
      sspTotal: total(ssp),
      pbbTotal: total(pbb),
      volumeTotal: total(volume),
      olg: sumBy(olg, (r) => tag(r.PLUSCO_MEDIA_PARTNER)),
      olgTotal: total(olg),
      tradMatrix: pivot(volumeTrad, (r) => [tag(r.PLUSCO_DEALS_Channel), tag(r.PLUSCO_MEDIA_PARTNER)], (r) => tag(r.PLUSCO_MEDIA_CHANNEL), MEDIA_CHANNEL_ORDER),
      digitalGroups,
      source: [...new Set(scoped.map((r) => r.SOURCE).filter(Boolean))].join(", "),
      unlinked: unlinkedClients(scoped),
    };
  }, [scoped]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox what="PCC Deals" message={error} />;

  const labsTotal = total(v.labs);
  const nothing = labsTotal === 0 && v.volumeTotal === 0 && v.sspTotal === 0 && v.pbbTotal === 0 && v.olgTotal === 0;

  return (
    <div className="space-y-6">
      <PageHeading icon={Handshake} title="PlusCo Deals" period={`${year} · ${monthsLabel(months ?? [])}`}>
        {sourceNote(v.source, v.unlinked)} Deals are grouped by the MIR tags <code>PLUSCO_DEALS_Type</code>,{" "}
        <code>PLUSCO_DEALS_Category</code> and <code>PLUSCO_DEALS_Channel</code> (from the 2026 deals key on the vendor database).
      </PageHeading>

      {nothing ? (
        <Empty>No deal spend for {year} in the current filters.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard icon={FlaskConical} label="Labs deals" value={money(labsTotal)} sub="Labs + Labs - BRP" />
            <StatCard icon={FlaskConical} label="Labs - PBB" value={money(v.pbbTotal)} />
            <StatCard icon={Server} label="Labs - SSP" value={money(v.sspTotal)} />
            <StatCard icon={Handshake} label="Volume deals" value={money(v.volumeTotal)} />
            <StatCard icon={Handshake} label="Volume deals - OLG" value={money(v.olgTotal)} />
          </div>

          <Band>Labs deals</Band>
          <ChartCard title="Labs deals by category and channel" subtitle='PLUSCO_DEALS_Type "Labs" and "Labs - BRP"' icon={FlaskConical}>
            {v.labsTree.length === 0 ? (
              <Empty>No Labs deal spend.</Empty>
            ) : (
              <ListTable
                headers={["Category", "Deals channel", "Partner", "Net ordered (CAD)"]}
                rows={v.labsTree.map((l) => ({ label: [l.category, l.channel, l.partner], net: l.net }))}
              />
            )}
          </ChartCard>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="SSP Partners" subtitle='PLUSCO_DEALS_Type "Labs - SSP"' icon={Server}>
              {v.ssp.length === 0 ? (
                <Empty>No SSP deal spend.</Empty>
              ) : (
                <ListTable headers={["Partner", "Net ordered (CAD)"]} rows={v.ssp.map((p) => ({ label: [p.key], net: p.net }))} />
              )}
            </ChartCard>
            <ChartCard title="PBB Partners" subtitle='PLUSCO_DEALS_Type "Labs - PBB", by media channel' icon={Radio}>
              {v.pbb.rows.length === 0 ? <Empty>No PBB deal spend.</Empty> : <MatrixTable labelHeaders={["Category", "Partner"]} matrix={v.pbb} />}
            </ChartCard>
          </div>

          <Band>Volume deals</Band>
          <ChartCard title="Traditional & Multiplatform" subtitle='PLUSCO_DEALS_Type "Volume Deals", by media channel' icon={Layers}>
            {v.tradMatrix.rows.length === 0 ? (
              <Empty>No Traditional &amp; Multiplatform volume deal spend.</Empty>
            ) : (
              <MatrixTable labelHeaders={["Deals channel", "Partner"]} matrix={v.tradMatrix} />
            )}
          </ChartCard>
          <div className="grid gap-6 lg:grid-cols-3">
            {v.digitalGroups.map((g) => (
              <ChartCard key={g.channel} title={g.channel === "DSP" ? "DSPs" : g.channel === "Premium Pubs" ? "Digital Premium Pubs" : g.channel} icon={Handshake}>
                <ListTable headers={["Partner", "Net ordered (CAD)"]} rows={g.partners.map((p) => ({ label: [p.key], net: p.net }))} />
              </ChartCard>
            ))}
            {v.olg.length > 0 && (
              <ChartCard title="OLG volume deal" subtitle='PLUSCO_DEALS_Type "Volume Deals - OLG"' icon={Handshake}>
                <ListTable headers={["Partner", "Net ordered (CAD)"]} rows={v.olg.map((p) => ({ label: [p.key], net: p.net }))} />
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
