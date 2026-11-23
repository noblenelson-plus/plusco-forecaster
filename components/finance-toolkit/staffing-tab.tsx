// filepath: components/finance-toolkit/staffing-tab.tsx
"use client";

/**
 * Finance Toolkit · Staffing — "How much media does each person manage, and
 * which pods are stretched?" First version, built on data we already have:
 *
 *   1. the answer in one sentence (spend managed per full-time person)
 *   2. four tiles
 *   3. GM pods side by side, each against the average, with complexity
 *   4. the team mix by provisional role group and seniority
 *   5. every client (open), with a detail panel and a Sheets export
 *   6. the formulas
 *
 * Spend comes from MediaOcean, hours from Maconomy, over the same 12 months;
 * complexity from MediaBox (lib/finance-toolkit/staffing.ts). Role groups are
 * read from Maconomy titles until the talent team's mapping is ready.
 */

import { useMemo, useState } from "react";
import { Layers, ShieldCheck, Table2, Users, X } from "lucide-react";
import { Card } from "../ui/card";
import { NOT_LINKED } from "../../lib/finance-toolkit/client-links";
import { FTE_HOURS_PER_MONTH } from "../../lib/finance-toolkit/model";
import { ROLE_GROUPS, SENIORITY } from "../../lib/finance-toolkit/roles";
import {
  FTE_YEAR_HOURS,
  MIN_HOURS,
  MIN_MEDIABOX_SHARE,
  MIN_SPEND,
  POD_HIGH,
  POD_LOW,
  STAFFING,
  STAFFING_AGENCIES,
  staffing,
  type PodRow,
  type StaffingRow,
} from "../../lib/finance-toolkit/staffing";
import { Chip, DataTable, Disclosure, Formula, HowCalculated, Notice, Segmented, type Column } from "./ft-ui";
import { formatCompactMoney, hours, money, pct, sheetMatrix } from "./ft-format";
import SheetExportButton from "../dashboard/sheet-export-button";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

/** Group and level colours (explicit classes so Tailwind keeps them). */
const GROUP_COLOR: Record<string, string> = {
  Planning: "bg-purple-600",
  Investments: "bg-blue-400",
  "Digital Activation": "bg-green-500",
  "Media team": "bg-pink-400",
  Insights: "bg-yellow-400",
  "Media Operations": "bg-gray-500",
  "Business Leadership": "bg-gray-900",
  Other: "bg-gray-300",
};
const LEVEL_COLOR: Record<string, string> = {
  Junior: "bg-blue-200",
  Intermediate: "bg-blue-400",
  Senior: "bg-purple-400",
  Director: "bg-purple-600",
  Executive: "bg-gray-900",
};

const perFte = (v: number | null) => (v === null ? "—" : formatCompactMoney(v));
const fte1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));

function Tile({ label, value, context }: { label: string; value: string; context: React.ReactNode }) {
  return (
    <Card className="gap-0 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</div>
      <div className="mt-1.5 text-sm leading-snug text-gray-600">{context}</div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Users; title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

/** A 100% stacked bar with a legend underneath (shares of hours). */
function MixBar({ parts, colors }: { parts: [string, number][]; colors: Record<string, string> }) {
  const total = parts.reduce((a, [, v]) => a + v, 0);
  const shown = parts.filter(([, v]) => total > 0 && v / total >= 0.005);
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden">
        {shown.map(([k, v]) => (
          <div
            key={k}
            className={`${colors[k]} flex items-center justify-center text-[11px] font-semibold text-white`}
            style={{ width: `${(v / total) * 100}%` }}
            title={`${k}: ${pct(v / total, 0)}`}
          >
            {v / total >= 0.07 ? pct(v / total, 0) : ""}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {shown.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 ${colors[k]}`} aria-hidden />
            {k} <span className="tabular-nums text-gray-400">{pct(v / total, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PodBar({ pod, max, average }: { pod: PodRow; max: number; average: number | null }) {
  const high = pod.vsAverage !== null && pod.vsAverage >= POD_HIGH;
  const low = pod.vsAverage !== null && pod.vsAverage <= POD_LOW;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">{pod.pod}</span>
          {high && (
            <Chip tone="loss" title="Spend per full-time person is at least 1.5× the average">
              Much more per person
            </Chip>
          )}
          {low && (
            <Chip tone="neutral" title="Spend per full-time person is at most two thirds of the average">
              Much less per person
            </Chip>
          )}
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
          {perFte(pod.spendPerFte)} <span className="font-normal text-gray-500">per FTE</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-3 bg-gray-100">
        <div className={`h-full ${high ? "bg-red-500" : "bg-purple-600"}`} style={{ width: `${((pod.spendPerFte ?? 0) / max) * 100}%` }} />
        {average !== null && (
          <div className="absolute inset-y-[-3px] w-0.5 bg-gray-900" style={{ left: `${(average / max) * 100}%` }} title="Average" aria-hidden />
        )}
      </div>
      <div className="mt-1 text-xs tabular-nums text-gray-500">
        {pod.clients} client{pod.clients === 1 ? "" : "s"} · {formatCompactMoney(pod.spend)} of media · {pod.fteYears.toFixed(1)} FTE ·{" "}
        {pct(pod.digitalShare, 0)} digital
        {pod.tacticsPerMillion !== null && ` · ${pod.tacticsPerMillion.toFixed(0)} MediaBox tactics per $1M`}
      </div>
    </li>
  );
}

function ClientPanel({ row, onClose, median }: { row: StaffingRow; onClose: () => void; median: number | null }) {
  const c = row.client;
  const cx = c.complexity;
  const figures: { label: string; value: string; sub?: string }[] = [
    {
      label: "Media spend",
      value: money(c.spend),
      sub: c.isNew
        ? `New since ${ym(c.firstMonth!)} · about ${formatCompactMoney(c.annualizedSpend)} a year`
        : `${pct(c.digitalSpend / c.spend, 0)} digital`,
    },
    { label: "Team", value: `${fte1(row.teamFte)} FTE`, sub: `${row.people} people logged time · ${hours(row.hours)} h` },
    { label: "Spend per FTE", value: perFte(row.spendPerFte), sub: median ? `Typical client: ${perFte(median)}` : undefined },
    {
      label: "Hours per $1M",
      value: row.hoursPerMillion === null ? "—" : hours(row.hoursPerMillion),
      sub: row.hoursPerCampaign === null ? undefined : `${hours(row.hoursPerCampaign)} h per MediaBox campaign`,
    },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${c.name} staffing detail`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="bg-gray-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">
                {c.agency} · {c.gmPod || "No GM pod"} · {c.region || "No BU-region"}
              </div>
              <h2 className="mt-1 text-lg font-bold leading-tight">{c.name}</h2>
              <div className="mt-1 text-xs text-gray-300">
                {STAFFING && `${ym(STAFFING.from)} – ${ym(STAFFING.to)}`} · spend in CAD · hours on {row.accounts.length} Maconomy account
                {row.accounts.length === 1 ? "" : "s"}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-300 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-px border border-gray-200 bg-gray-200">
            {figures.map((f) => (
              <div key={f.label} className="bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{f.label}</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">{f.value}</div>
                {f.sub && <div className="text-xs text-gray-500">{f.sub}</div>}
              </div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Spend by channel</h3>
            <ul className="space-y-1.5">
              {c.channels
                .filter(([, v]) => v > 0)
                .map(([ch, v, mb]) => (
                  <li key={ch} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-gray-700">{ch}</span>
                    <span className="h-2.5 bg-gray-100">
                      <span className="block h-full bg-purple-600" style={{ width: `${(v / Math.max(...c.channels.map((x) => x[1]))) * 100}%` }} />
                    </span>
                    <span className="tabular-nums text-gray-900">
                      {formatCompactMoney(v)} <span className="text-xs text-gray-400">· {pct(mb, 0)} in MediaBox</span>
                    </span>
                  </li>
                ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              Who did the work <span className="font-normal text-gray-500">(share of client hours, provisional groups)</span>
            </h3>
            <MixBar parts={ROLE_GROUPS.map((g) => [g, row.byGroup[g]])} colors={GROUP_COLOR} />
            <div className="mt-4">
              <MixBar parts={SENIORITY.map((l) => [l, row.byLevel[l]])} colors={LEVEL_COLOR} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Campaign complexity (MediaBox)</h3>
            {cx ? (
              <>
                <div className="grid grid-cols-3 gap-px border border-gray-200 bg-gray-200 text-sm">
                  {(
                    [
                      ["Campaigns", cx.campaigns],
                      ["Tactics", cx.tactics],
                      ["Publishers", cx.publishers],
                      ["Audiences", cx.audiences],
                      ["Markets", cx.markets],
                      ["Lines of business", cx.linesOfBusiness],
                    ] as [string, number][]
                  ).map(([k, v]) => (
                    <div key={k} className="bg-white px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{k}</div>
                      <div className="text-lg font-bold tabular-nums text-gray-900">{v.toLocaleString("en-CA")}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {cx.funnelStages} of 3 funnel stages · {pct(cx.brandKpiShare, 0)} of tactics on brand KPIs · covers {pct(c.mediaboxShare, 0)} of
                  this client’s spend (MediaOcean estimates matched to MediaBox by MCPE)
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No MediaBox campaign is linked to this client’s MediaOcean estimates in this period.</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function StaffingTab({ picked, regions, gms }: { picked: Set<number> | null; regions: string[]; gms: string[] }) {
  const [agency, setAgency] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const result = useMemo(
    () =>
      staffing(
        (c, accounts) =>
          (agency === "all" || c.agency === agency) &&
          (!picked || accounts.some((i) => picked.has(i))) &&
          (!regions.length || regions.includes(c.region || NOT_LINKED)) &&
          (!gms.length || gms.includes(c.gmPod || NOT_LINKED)),
      ),
    [agency, picked, regions, gms],
  );

  if (!STAFFING || !result) {
    return (
      <Notice tone="warn">
        <p>Staffing data is not loaded in this build. Run data-prep/build-staffing-data.mjs and redeploy.</p>
      </Notice>
    );
  }

  const { rows, pods, totals, noHours } = result;
  const period = `${ym(STAFFING.from)} – ${ym(STAFFING.to)}`;
  const comparable = rows.filter((r) => r.comparable);
  const selected = rows.find((r) => r.client.id === selectedId) ?? null;
  const podMax = Math.max(1, ...pods.map((p) => p.spendPerFte ?? 0));
  const flaggedPods = pods.filter((p) => p.vsAverage !== null && (p.vsAverage >= POD_HIGH || p.vsAverage <= POD_LOW));
  const filtered = agency !== "all" || picked !== null || regions.length > 0 || gms.length > 0;

  const columns: Column<StaffingRow>[] = [
    {
      id: "client",
      label: "Client",
      sort: (r) => r.client.name,
      render: (r) => (
        <div className="max-w-[260px]">
          <div className="truncate font-medium text-gray-900" title={r.client.name}>
            {r.client.name}
          </div>
          <div className="text-[11px] text-gray-500">
            {r.client.agency} · {r.client.gmPod || "No GM pod"}
            {r.client.isNew ? " · new" : ""}
          </div>
        </div>
      ),
    },
    {
      id: "spend",
      label: "Media spend",
      align: "right",
      sort: (r) => r.client.spend,
      render: (r) => money(r.client.spend),
      total: money(totals.spend),
    },
    {
      id: "digital",
      label: "Digital",
      align: "right",
      sort: (r) => (r.client.spend ? r.client.digitalSpend / r.client.spend : null),
      render: (r) => pct(r.client.spend ? r.client.digitalSpend / r.client.spend : null, 0),
    },
    {
      id: "team",
      label: "Team (FTE)",
      align: "right",
      sort: (r) => r.teamFte,
      render: (r) => fte1(r.teamFte),
      headerTitle: "Average team while the account was active: hours ÷ (140 × months with hours)",
    },
    {
      id: "people",
      label: "People",
      align: "right",
      sort: (r) => r.people,
      render: (r) => r.people,
      headerTitle: "Distinct people who logged client hours",
    },
    {
      id: "spf",
      label: "Spend per FTE",
      align: "right",
      sort: (r) => r.spendPerFte,
      render: (r) => <span className="font-semibold">{perFte(r.spendPerFte)}</span>,
      total: perFte(totals.spendPerFte),
      headerTitle: "Media spend ÷ full-time people (hours ÷ 1,680)",
    },
    {
      id: "hpm",
      label: "Hours per $1M",
      align: "right",
      sort: (r) => r.hoursPerMillion,
      render: (r) => (r.hoursPerMillion === null ? "—" : hours(r.hoursPerMillion)),
    },
    {
      id: "campaigns",
      label: "Campaigns",
      align: "right",
      sort: (r) => r.client.complexity?.campaigns ?? null,
      render: (r) => r.client.complexity?.campaigns ?? "—",
      headerTitle: "MediaBox campaigns linked to this client’s MediaOcean estimates",
    },
    {
      id: "tactics",
      label: "Tactics",
      align: "right",
      sort: (r) => r.client.complexity?.tactics ?? null,
      render: (r) => r.client.complexity?.tactics ?? "—",
    },
    {
      id: "audiences",
      label: "Audiences",
      align: "right",
      sort: (r) => r.client.complexity?.audiences ?? null,
      render: (r) => r.client.complexity?.audiences ?? "—",
    },
    {
      id: "hpc",
      label: "Hours per campaign",
      align: "right",
      sort: (r) => r.hoursPerCampaign,
      render: (r) => (r.hoursPerCampaign === null ? "—" : hours(r.hoursPerCampaign)),
      headerTitle: `Shown when at least ${pct(MIN_MEDIABOX_SHARE, 0)} of the client’s spend is linked to MediaBox`,
    },
    {
      id: "mb",
      label: "In MediaBox",
      align: "right",
      sort: (r) => r.client.mediaboxShare,
      render: (r) => <span className={r.client.mediaboxShare < MIN_MEDIABOX_SHARE ? "text-gray-400" : ""}>{pct(r.client.mediaboxShare, 0)}</span>,
      headerTitle: "Share of the client’s MediaOcean spend matched to a MediaBox campaign (MCPE)",
    },
  ];

  const buildSheet = () =>
    sheetMatrix(
      [
        "Client",
        "Agency",
        "GM pod",
        "BU-region",
        "Media spend (CAD)",
        "Digital spend (CAD)",
        "New client",
        "Annualized spend (CAD)",
        "Client hours",
        "Team (FTE)",
        "People",
        "Spend per FTE (CAD)",
        "Hours per $1M",
        "MediaBox campaigns",
        "MediaBox tactics",
        "Publishers",
        "Audiences",
        "Markets",
        "Funnel stages",
        "Hours per campaign",
        "Share of spend in MediaBox",
        "MCPEs",
        "Vendors",
        ...ROLE_GROUPS.map((g) => `Hours: ${g}`),
        ...SENIORITY.map((l) => `Hours: ${l}`),
      ],
      rows.map((r) => [
        r.client.name,
        r.client.agency,
        r.client.gmPod,
        r.client.region,
        r.client.spend,
        r.client.digitalSpend,
        r.client.isNew ? "Yes" : "No",
        r.client.annualizedSpend,
        r.hours,
        r.teamFte,
        r.people,
        r.spendPerFte,
        r.hoursPerMillion,
        r.client.complexity?.campaigns ?? null,
        r.client.complexity?.tactics ?? null,
        r.client.complexity?.publishers ?? null,
        r.client.complexity?.audiences ?? null,
        r.client.complexity?.markets ?? null,
        r.client.complexity?.funnelStages ?? null,
        r.hoursPerCampaign,
        r.client.mediaboxShare,
        r.client.mcpeCount,
        r.client.vendorCount,
        ...ROLE_GROUPS.map((g) => r.byGroup[g]),
        ...SENIORITY.map((l) => r.byLevel[l]),
      ]),
    );

  return (
    <div className="space-y-5">
      {/* 1 · The answer */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="plus-pattern h-1" aria-hidden />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {period} · {agency === "all" ? "All agencies" : agency} · media spend in CAD
            </div>
            {totals.spendPerFte === null ? (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900">
                No client has both media spend and timesheets in this selection.
              </h2>
            ) : (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900 md:text-[28px]">
                Each full-time person manages about <span className="bg-yellow-400 px-1">{formatCompactMoney(totals.spendPerFte)}</span> of media a
                year.
              </h2>
            )}
            <p className="mt-3 text-base leading-relaxed text-gray-700">
              Across <strong className="text-gray-900">{totals.comparableClients}</strong> clients, our teams logged the equivalent of{" "}
              <strong className="text-gray-900">{Math.round(totals.fteYears)} full-time people</strong> ({totals.people} people in all) on{" "}
              <strong className="text-gray-900">{formatCompactMoney(totals.spend)}</strong> of media. The typical client sits at{" "}
              {perFte(totals.medianClientSpendPerFte)} per person, and the spread is wide, so read each number next to the client’s complexity.
              {flaggedPods.length > 0 &&
                ` ${flaggedPods.length} GM pod${flaggedPods.length === 1 ? " stands" : "s stand"} well away from the average.`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Agency (MediaOcean)</span>
            <Segmented
              ariaLabel="Agency"
              value={agency}
              onChange={setAgency}
              options={[{ id: "all", label: "All" }, ...STAFFING_AGENCIES.map((a) => ({ id: a, label: a }))]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-6 py-2.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-green-500" /> Spend from MediaOcean, hours from Maconomy, same 12 months
          </span>
          <span>Clients tied to timesheets by their Forecaster GAIA numbers</span>
          <span>Role groups are provisional until the talent team’s mapping is ready</span>
        </div>
      </Card>

      {/* 2 · Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Media spend managed"
          value={formatCompactMoney(totals.spend)}
          context={`on ${totals.comparableClients} clients with timesheets, ${period}`}
        />
        <Tile
          label="Client team"
          value={`${Math.round(totals.fteYears)} FTE`}
          context={`${hours(totals.hours)} client hours · ${totals.people} people logged time`}
        />
        <Tile label="Spend per FTE" value={perFte(totals.spendPerFte)} context={`typical client ${perFte(totals.medianClientSpendPerFte)}`} />
        <Tile
          label="Hours per $1M"
          value={totals.spend > 0 ? hours(totals.hours / (totals.spend / 1e6)) : "—"}
          context="client hours for every $1M of media"
        />
      </div>

      {/* 3 · Pods + 4 · team mix */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="gap-0 p-5 xl:col-span-2">
          <SectionTitle
            icon={Users}
            title="Spend per full-time person, by GM pod"
            subtitle={`Black line = average (${perFte(totals.spendPerFte)}). A pod at 1.5× the average or more is flagged; read it with its complexity and digital share.`}
          />
          {pods.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No pod in this selection.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pods.map((p) => (
                <PodBar key={p.pod} pod={p} max={podMax} average={totals.spendPerFte} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-0 p-5">
          <SectionTitle icon={Layers} title="Who does the work" subtitle="Share of client hours, by provisional role group and seniority" />
          <MixBar parts={ROLE_GROUPS.map((g) => [g, totals.byGroup[g]])} colors={GROUP_COLOR} />
          <div className="mt-5">
            <MixBar parts={SENIORITY.map((l) => [l, totals.byLevel[l]])} colors={LEVEL_COLOR} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Groups come from Maconomy job titles. “Media team” holds cross-channel supervisors, managers and directors. These are replaced by the
            talent team’s departments once the mapping is ready.
          </p>
        </Card>
      </div>

      {/* 5 · Every client */}
      <Disclosure
        title="All clients"
        subtitle={`${rows.length} clients with spend and timesheets · click one for its channels, team and complexity · export to Google Sheets`}
        icon={Table2}
        defaultOpen
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Clients under {hours(MIN_HOURS)} hours or {formatCompactMoney(MIN_SPEND)} of spend are listed but left out of the averages and pods (
            {rows.length - comparable.length} here).
          </p>
          <SheetExportButton title={`Staffing · ${period}`} sheetTitle="Clients" buildMatrix={buildSheet} />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.client.id}
          defaultSort={{ id: "spend", dir: "desc" }}
          onRowClick={(r) => setSelectedId(r.client.id)}
          activeKey={selectedId}
          footerLabel="Clients in the averages"
          emptyText="No client in this selection."
        />
        {!filtered && noHours.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Not shown (spend but no timesheets on a GAIA-linked account):{" "}
            {noHours.map((c) => `${c.name} (${formatCompactMoney(c.spend)})`).join(", ")}.
          </p>
        )}
      </Disclosure>

      <HowCalculated>
        <Formula
          name="Media spend"
          formula="Σ MediaOcean net ordered (CAD) over the window, all channels"
          worked={`${money(totals.spend)} in ${period}`}
        />
        <Formula
          name="Client hours"
          formula="Σ Maconomy client-work hours on the accounts whose number is one of the client’s Forecaster GAIA numbers, any agency, same months"
          worked={`${hours(totals.hours)} h`}
        />
        <Formula
          name="Full-time people (FTE)"
          formula={`client hours ÷ ${FTE_YEAR_HOURS.toLocaleString("en-CA")} (12 × ${FTE_HOURS_PER_MONTH} client hours a month)`}
          worked={`${hours(totals.hours)} ÷ ${FTE_YEAR_HOURS.toLocaleString("en-CA")} = ${totals.fteYears.toFixed(1)}`}
        />
        <Formula
          name="Spend per FTE"
          formula="media spend ÷ FTE. Both cover the same months, so a client that started part-way through is not penalised"
          worked={`${money(totals.spend)} ÷ ${totals.fteYears.toFixed(1)} = ${money(totals.spendPerFte)}`}
        />
        <Formula
          name="Team (FTE)"
          formula={`client hours ÷ (${FTE_HOURS_PER_MONTH} × months with hours): the average team while the account was active`}
        />
        <Formula
          name="Complexity"
          formula="MediaBox tactics active in the window whose billing ID matches one of the client’s MediaOcean MCPEs: campaigns, tactics, publishers, audiences, markets, funnel stages (keyword mapping of the objective)"
        />
        <Formula
          name="Hours per campaign"
          formula={`client hours ÷ linked MediaBox campaigns, shown only when at least ${pct(MIN_MEDIABOX_SHARE, 0)} of the client’s spend is in MediaBox`}
        />
        <Formula
          name="Pod flag"
          formula={`pod spend per FTE ≥ ${POD_HIGH}× the average (much more per person) or ≤ ${POD_LOW.toFixed(2)}× (much less)`}
        />
        <div className="mt-3 space-y-1.5 text-xs text-gray-600">
          <p>
            <strong>Agency filter:</strong> uses the client’s MediaOcean agency. Each client counts its whole team, whichever agency logged the hours.
          </p>
          <p>
            <strong>Not yet included:</strong> department and channel of each person (the talent team’s mapping), reporting frequency, and hours after{" "}
            {ym(STAFFING.to)}.
          </p>
        </div>
      </HowCalculated>

      {selected && <ClientPanel row={selected} median={totals.medianClientSpendPerFte} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
