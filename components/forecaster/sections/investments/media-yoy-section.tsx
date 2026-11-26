// components/forecaster/sections/investments/media-yoy-section.tsx
"use client";

/**
 * Exec KPI Dashboard → Media YOY. Replicates the Looker "YOY MEDIA INVESTMENTS"
 * page, MIR booked net this year vs last year over the same months:
 *   1. Investment Strategy KPIs band (Labs / Reddit / MIQ-Social, Social,
 *      Digital Direct, Programmatic, OOH), each with its change vs last year.
 *   2. Media Spend by Channel table + channel share charts (of total, of digital).
 *   3. Top Partners by Channel: Top 20 partners (2026 deal + deal type) and the
 *      Spend by Partner share chart.
 *   4. Top Partners by Client: partner → client lines.
 * Sections 1–2 follow the dashboard filters, Year and Exec Months filter; the
 * buy-level filters (channel, programmatic, partner, 2026 deal, deal type,
 * client) narrow sections 3–4, as in Looker. CAD.
 */

import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, CalendarRange, Handshake, Layers, Users } from "lucide-react";
import ChartCard from "../../../dashboard/charts/chart-card";
import GroupedBarChart from "../../../dashboard/charts/grouped-bar-chart";
import { PLUS } from "../../../dashboard/charts/colors";
import MultiSelectDropdown from "../../../_shared/multi-select-dropdown";
import {
  useInvestmentDealsMix,
  useScopedClientNames,
} from "../../../../lib/dashboard/data/use-investment-deals-mix";
import {
  DIGITAL_CHANNELS,
  partnerYoy,
  ratio,
  scopeInvestmentRows,
  strategySums,
  tag,
  unlinkedClients,
  yoyBy,
  net,
  type InvestmentDealsRow,
  type StrategySums,
  type YoyLine,
} from "../../../../lib/format/investment-deals";
import type { Client } from "../../../../lib/types/client.types";
import {
  Band,
  CELL,
  Empty,
  ErrorBox,
  HEAD_ROW,
  Loading,
  MUTED_CELL,
  NUM,
  PageHeading,
  ROW,
  TH,
  YoyTable,
  money,
  monthsLabel,
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

const TOP_PARTNERS = 20;
const shareFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

// ─── Investment Strategy KPIs band ───────────────────────────────────────────

/** One KPI tile: a share (change in points) or an amount (change in $). */
function Kpi({ label, now, prev, kind }: { label: string; now: number | null; prev: number | null; kind: "share" | "money" }) {
  let delta: ReactNode = <span className="text-muted-foreground">—</span>;
  if (now !== null && prev !== null) {
    const d = kind === "share" ? (now - prev) * 100 : now - prev;
    const text = kind === "share" ? `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts` : `${d >= 0 ? "+" : "−"}${money(Math.abs(d))}`;
    delta = <span className={d > 0 ? "text-green-700" : d < 0 ? "text-red-600" : "text-muted-foreground"}>{text}</span>;
  }
  return (
    <div className="border border-border bg-card px-3 py-2">
      <div className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
        {now === null ? "—" : kind === "share" ? `${Math.round(now * 100)}%` : money(now)}
      </div>
      <div className="text-[11px] tabular-nums">{delta}</div>
    </div>
  );
}

function KpiGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-bold uppercase tracking-wider text-purple-600">{title}</div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function StrategyBand({ cur, prev, year }: { cur: StrategySums; prev: StrategySums; year: number }) {
  const k = (label: string, f: (s: StrategySums) => number | null, kind: "share" | "money") => (
    <Kpi key={label} label={label} now={f(cur)} prev={f(prev)} kind={kind} />
  );
  return (
    <div className="space-y-3 bg-gray-100 p-4">
      <p className="text-xs text-muted-foreground">
        {year} figures; the line below each is the change vs {year - 1} (points for shares, dollars for spend). Digital = Programmatic +
        SEM + Digital Direct + Social. Deal partners = <code>PLUSCO_2026_DEALS</code> &ldquo;Partner Deal&rdquo;. Labs = deal types Labs +
        Labs - BRP (as on PCC Deals).
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiGroup title="Labs & partners">
          {k("Labs share of total media", (s) => ratio(s.labs, s.total), "share")}
          {k("Reddit share of Social", (s) => ratio(s.redditSocial, s.social), "share")}
          {k("MIQ-Social spend", (s) => s.miqSocial, "money")}
        </KpiGroup>
        <KpiGroup title="Social">
          {k("Social share of Digital", (s) => ratio(s.social, s.digital), "share")}
          {k("Meta spend", (s) => s.meta, "money")}
          {k("Meta share of Social", (s) => ratio(s.metaSocial, s.social), "share")}
        </KpiGroup>
        <KpiGroup title="Digital Direct">
          {k("Digital Direct share of Digital", (s) => ratio(s.digitalDirect, s.digital), "share")}
          {k("Spend deal partners", (s) => s.digitalDirectDeal, "money")}
          {k("Spend non-deal partners", (s) => s.digitalDirect - s.digitalDirectDeal, "money")}
          {k("Share of spend deal partners", (s) => ratio(s.digitalDirectDeal, s.digitalDirect), "share")}
          {k("Share of spend non-deal partners", (s) => ratio(s.digitalDirect - s.digitalDirectDeal, s.digitalDirect), "share")}
        </KpiGroup>
        <KpiGroup title="Programmatic">
          {k("Prog share of Digital", (s) => ratio(s.programmatic, s.digital), "share")}
          {k("Spend deal partners (Prog)", (s) => s.programmaticDeal, "money")}
          {k("Spend non-deal partners (Prog)", (s) => s.programmatic - s.programmaticDeal, "money")}
          {k("Share of spend deal partners (Prog)", (s) => ratio(s.programmaticDeal, s.programmatic), "share")}
          {k("Share of spend non-deal partners (Prog)", (s) => ratio(s.programmatic - s.programmaticDeal, s.programmatic), "share")}
        </KpiGroup>
        <KpiGroup title="OOH">
          {k("Billups total $", (s) => s.billups, "money")}
          {k("Billups-OOH share of OOH", (s) => ratio(s.billupsOoh, s.ooh), "share")}
        </KpiGroup>
      </div>
    </div>
  );
}

// ─── Partner × client table ──────────────────────────────────────────────────

interface PartnerClientLine {
  partner: string;
  client: string;
  deal: string;
  dealType: string;
  prev: number;
  cur: number;
}

function partnerClientLines(rows: readonly InvestmentDealsRow[], year: number, partners: readonly YoyLine[]): PartnerClientLine[] {
  const rank = new Map(partners.map((p, i) => [p.key, i]));
  const by = new Map<string, PartnerClientLine>();
  for (const r of rows) {
    const partner = tag(r.PLUSCO_MEDIA_PARTNER);
    if (!rank.has(partner)) continue;
    const line = { partner, client: tag(r.PLUSCO_CLIENT_NAME), deal: tag(r.PLUSCO_2026_DEALS), dealType: tag(r.PLUSCO_DEALS_Type) };
    const k = `${line.partner}\u0000${line.client}\u0000${line.deal}\u0000${line.dealType}`;
    let l = by.get(k);
    if (!l) by.set(k, (l = { ...line, prev: 0, cur: 0 }));
    if (String(r.PLUSCO_YEAR) === String(year)) l.cur += net(r);
    else l.prev += net(r);
  }
  return [...by.values()]
    .filter((l) => Math.round(l.prev) !== 0 || Math.round(l.cur) !== 0)
    .sort((a, b) => rank.get(a.partner)! - rank.get(b.partner)! || b.cur - a.cur || b.prev - a.prev);
}

function PartnerClientTable({ lines, year }: { lines: PartnerClientLine[]; year: number }) {
  return (
    <div className="max-h-[600px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className={HEAD_ROW}>
            <th className={`${TH} pr-3 text-left`}>Partner</th>
            <th className={`${TH} pr-3 text-left`}>Client</th>
            <th className={`${TH} pr-3 text-left`}>2026 Deals</th>
            <th className={`${TH} pr-3 text-left`}>Deal type</th>
            <th className={`${TH} pl-3 text-right`}>{year - 1} $</th>
            <th className={`${TH} pl-3 text-right`}>{year} $</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.partner}|${l.client}|${l.deal}|${l.dealType}`} className={ROW}>
              <td className={CELL}>{i > 0 && lines[i - 1].partner === l.partner ? "" : l.partner}</td>
              <td className={CELL}>{l.client}</td>
              <td className={MUTED_CELL}>{l.deal}</td>
              <td className={MUTED_CELL}>{l.dealType}</td>
              <td className={NUM}>{money(l.prev)}</td>
              <td className={NUM}>{money(l.cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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

  const v = useMemo(() => {
    const cur = strategySums(scoped, year);
    const prev = strategySums(scoped, year - 1);
    const byChannel = yoyBy(scoped, year, (r) => tag(r.PLUSCO_MEDIA_CHANNEL));
    const channelShares = byChannel.map((l) => ({ category: l.key, prev: ratio(l.prev, prev.total) ?? 0, cur: ratio(l.cur, cur.total) ?? 0 }));
    const digitalShares = byChannel
      .filter((l) => DIGITAL_CHANNELS.includes(l.key))
      .map((l) => ({ category: l.key, prev: ratio(l.prev, prev.digital) ?? 0, cur: ratio(l.cur, cur.digital) ?? 0 }));
    const curRows = scoped.filter((r) => String(r.PLUSCO_YEAR) === String(year));
    return {
      cur,
      prev,
      byChannel,
      channelShares,
      digitalShares,
      source: [...new Set(curRows.map((r) => r.SOURCE).filter(Boolean))].join(", "),
      unlinked: unlinkedClients(curRows),
    };
  }, [scoped, year]);

  const p = useMemo(() => {
    const partners = partnerYoy(filtered, year);
    const top = partners.slice(0, TOP_PARTNERS);
    let prevTotal = 0;
    let curTotal = 0;
    for (const l of partners) {
      prevTotal += l.prev;
      curTotal += l.cur;
    }
    return {
      partners,
      partnerShares: top.map((l) => ({ category: l.key, prev: ratio(l.prev, prevTotal) ?? 0, cur: ratio(l.cur, curTotal) ?? 0 })),
      partnerClients: partnerClientLines(filtered, year, top),
    };
  }, [filtered, year]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox what="Media YOY" message={error} />;

  const series = [
    { key: "prev", label: `${year - 1} $`, color: PLUS.blue },
    { key: "cur", label: `${year} $`, color: PLUS.yellow },
  ];
  const anyFacet = FACETS.some((f) => facets[f.key].length > 0);

  if (v.cur.total === 0 && v.prev.total === 0) {
    return <Empty>No booked media for {year - 1}–{year} in the current filters.</Empty>;
  }

  return (
    <div className="space-y-6">
      <PageHeading icon={CalendarRange} title={`Media Investments ${year} vs ${year - 1}`} period={`${monthsLabel(months ?? [])} (same months both years)`}>
        {sourceNote(v.source, v.unlinked)}
      </PageHeading>

      <Band>Investment strategy KPIs</Band>
      <StrategyBand cur={v.cur} prev={v.prev} year={year} />

      <Band>Media spend by channel</Band>
      <ChartCard title="Media Spend by Channel" subtitle="PLUSCO_MEDIA_CHANNEL, booked net" icon={Layers}>
        <YoyTable labelHeaders={["Media channel"]} lines={v.byChannel} year={year} numbered />
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="PlusCo media channel" subtitle="Share of total media, each year" icon={BarChart3}>
          <GroupedBarChart data={v.channelShares} series={series} valueFormat={shareFmt} />
        </ChartCard>
        <ChartCard title="Digital media channel" subtitle="Share of digital, each year" icon={BarChart3}>
          <GroupedBarChart data={v.digitalShares} series={series} valueFormat={shareFmt} />
        </ChartCard>
      </div>

      <Band>Top partners by channel</Band>
      <div className="flex flex-wrap items-center gap-2">
        {FACETS.map((f) => (
          <MultiSelectDropdown
            key={f.key}
            label={f.label}
            options={options[f.key]}
            selectedValues={facets[f.key]}
            onChange={(vals) => setFacets((s) => ({ ...s, [f.key]: vals }))}
            searchable={f.key === "partner" || f.key === "client"}
          />
        ))}
        {anyFacet && (
          <button type="button" onClick={() => setFacets(NO_FACETS)} className="text-xs font-medium text-primary hover:underline">
            Clear filters
          </button>
        )}
        <span className="text-xs text-muted-foreground">These filters apply to the partner sections below.</span>
      </div>
      {p.partners.length === 0 ? (
        <Empty>No partner spend in the current filters.</Empty>
      ) : (
        <>
          <ChartCard title="Top 20 Partners" subtitle="PLUSCO_MEDIA_PARTNER, ranked by this year's spend; deal and deal type from the 2026 deals key" icon={Handshake}>
            <YoyTable labelHeaders={["Partner", "2026 Deals", "Deal type"]} lines={p.partners} year={year} limit={TOP_PARTNERS} numbered />
          </ChartCard>
          <ChartCard title="Spend by Partner" subtitle="Top 20 partners, share of all partner spend in the filters, each year" icon={BarChart3}>
            <GroupedBarChart data={p.partnerShares} series={series} valueFormat={shareFmt} height={340} angled />
          </ChartCard>

          <Band>Top partners by client</Band>
          <ChartCard title="Top Partners by Client" subtitle="The top 20 partners above, by client; narrow with the filters (e.g. pick a client)" icon={Users}>
            <PartnerClientTable lines={p.partnerClients} year={year} />
          </ChartCard>
        </>
      )}
    </div>
  );
}
