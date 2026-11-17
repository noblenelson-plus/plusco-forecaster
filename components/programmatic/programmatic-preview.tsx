// components/programmatic/programmatic-preview.tsx
"use client";

/**
 * Programmatic (preview) — programmatic spend across DSPs by publisher (Plus
 * media partner) and local / hybrid / foreign, with a coverage panel that says
 * what each DSP's numbers are built from and how they compare with MIR booked
 * spend. Read-only; data from lib/services/programmatic-preview-service.ts.
 */

import { useMemo, useState } from "react";
import { Info, Layers, MapPin, Newspaper, PieChart, Radio, Search, Users } from "lucide-react";
import ChartCard from "../dashboard/charts/chart-card";
import StatCard from "../dashboard/charts/stat-card";
import StackedBarChart from "../dashboard/charts/stacked-bar-chart";
import HorizontalStackedBar from "../dashboard/charts/horizontal-stacked-bar";
import BarList from "../dashboard/charts/bar-list";
import { PLUS } from "../dashboard/charts/colors";
import { formatCompactMoney, formatPct } from "../dashboard/charts/format";
import {
  ALL_DSPS,
  DSP_SOURCE_NOTES,
  LOCAL_LABELS,
  LOCAL_ORDER,
  byLocal,
  clients as clientLines,
  coverageByDsp,
  dealTypes,
  filterRows,
  monthlyByLocal,
  publishers as publisherLines,
  sumSpend,
  type ProgFilters,
} from "../../lib/programmatic/aggregate";
import type { LocalCategory, ProgDsp, ProgrammaticPreviewData } from "../../lib/programmatic/programmatic.types";

const LOCAL_COLORS: Record<LocalCategory, string> = {
  LOCAL: PLUS.green,
  HYBRID: PLUS.yellow,
  FOREIGN: PLUS.purple,
  UNKNOWN: PLUS.lightBlue,
  UNMAPPED: "#d1d5db",
};
const LOCAL_CHIP: Record<LocalCategory, string> = {
  LOCAL: "bg-green-500 text-white",
  HYBRID: "bg-yellow-400 text-gray-900",
  FOREIGN: "bg-purple-600 text-white",
  UNKNOWN: "bg-blue-200 text-gray-900",
  UNMAPPED: "bg-gray-200 text-gray-700",
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const money = (v: number) => `$${Math.round(v).toLocaleString("en-CA")}`;

function LocalChip({ local }: { local: LocalCategory }) {
  return <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LOCAL_CHIP[local]}`}>{LOCAL_LABELS[local]}</span>;
}

/** Status of a DSP's publisher detail, from its data vs MIR and the mapped share. */
function coverageStatus(dataCad: number, mirCad: number, sources: string[]) {
  if (dataCad === 0) return { label: "MIR only", cls: "bg-gray-200 text-gray-700" };
  if (sources.some((s) => s.startsWith("Template")) || (mirCad > 0 && dataCad < 0.6 * mirCad))
    return { label: "Partial", cls: "bg-yellow-400 text-gray-900" };
  return { label: "Publisher detail", cls: "bg-green-500 text-white" };
}

export default function ProgrammaticPreview({ data }: { data: ProgrammaticPreviewData }) {
  const months = data.months.length ? data.months : [...new Set(data.rows.map((r) => r.month))].sort();
  const [filters, setFilters] = useState<ProgFilters>({
    dsps: new Set(ALL_DSPS),
    client: null,
    from: months[0] ?? `${data.year}-01`,
    to: months[months.length - 1] ?? `${data.year}-12`,
  });
  const [pubQuery, setPubQuery] = useState("");
  const [pubLimit, setPubLimit] = useState(25);
  const [hideUnmapped, setHideUnmapped] = useState(false);

  const allClients = useMemo(
    () => [...new Set([...data.rows.map((r) => r.client), ...data.mir.map((m) => m.client)])].sort((a, b) => a.localeCompare(b)),
    [data]
  );

  const rows = useMemo(() => filterRows(data.rows, filters), [data.rows, filters]);
  const mir = useMemo(() => filterRows(data.mir, filters), [data.mir, filters]);
  const total = sumSpend(rows);
  const mirTotal = mir.reduce((s, m) => s + m.mirCad, 0);
  const local = byLocal(rows);
  const mapped = total - local.UNMAPPED;
  const coverage = useMemo(() => coverageByDsp(rows, mir, ALL_DSPS.filter((d) => filters.dsps.has(d))), [rows, mir, filters.dsps]);
  const monthly = useMemo(() => monthlyByLocal(rows), [rows]);
  const pubs = useMemo(() => publisherLines(rows), [rows]);
  const clientRows = useMemo(() => clientLines(rows, mir), [rows, mir]);
  const deals = useMemo(() => dealTypes(rows), [rows]);

  const visiblePubs = pubs.filter(
    (p) => (!hideUnmapped || p.local !== "UNMAPPED") && (!pubQuery || p.publisher.toLowerCase().includes(pubQuery.toLowerCase()))
  );

  const toggleDsp = (d: ProgDsp) =>
    setFilters((f) => {
      const next = new Set(f.dsps);
      if (next.has(d)) {
        if (next.size > 1) next.delete(d);
      } else next.add(d);
      return { ...f, dsps: next };
    });

  return (
    <div className="space-y-6">
      {/* Demo banner */}
      <div className="flex items-start gap-3 bg-gray-900 px-4 py-3 text-sm text-white">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-yellow-400" />
        <p>
          <span className="font-semibold text-yellow-400">Demo with static data.</span> Built {new Date(data.generatedAt).toLocaleString("en-CA")} from
          the DSP exports in Drive and DV360 in BigQuery. Amounts in CAD (net / advertiser cost)
          {data.usdRate ? `; USD converted at ${data.usdRate} (${data.usdBasis})` : ""}. MIR = MediaOcean booked spend for the same clients and months.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 border border-gray-200 bg-white p-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">DSP</p>
          <div className="flex flex-wrap gap-1">
            {ALL_DSPS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDsp(d)}
                className={`border px-2.5 py-1 text-xs font-medium ${filters.dsps.has(d) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-500"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Client</span>
          <select
            className="min-w-56 border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={filters.client ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value || null }))}
          >
            <option value="">All clients</option>
            {allClients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="text-xs">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k === "from" ? "From" : "To"}</span>
            <select
              className="border border-gray-300 bg-white px-2 py-1.5 text-sm"
              value={filters[k]}
              onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
            >
              {months.map((m) => (
                <option key={m} value={m} disabled={k === "from" ? m > filters.to : m < filters.from}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Radio} label="Programmatic spend (DSP data)" value={formatCompactMoney(total)} sub={`MIR booked: ${formatCompactMoney(mirTotal)}`} />
        <StatCard icon={MapPin} label="Local media" value={formatPct(mapped ? local.LOCAL / mapped : null)} sub={`${formatCompactMoney(local.LOCAL)} of mapped spend`} accent="text-green-600" />
        <StatCard icon={Layers} label="Hybrid / Foreign" value={`${formatPct(mapped ? local.HYBRID / mapped : null)} / ${formatPct(mapped ? local.FOREIGN / mapped : null)}`} sub="of mapped spend" accent="text-purple-600" />
        <StatCard icon={Newspaper} label="Publisher mapped" value={formatPct(total ? mapped / total : null)} sub={`${formatCompactMoney(local.UNMAPPED)} not mapped to a Plus partner`} />
      </div>

      {/* Coverage */}
      <ChartCard title="Data coverage by DSP" subtitle="What each DSP's numbers are built from, compared with MIR booked spend for the same filters" icon={Info}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">DSP</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">DSP data</th>
                <th className="py-2 pr-3 text-right">MIR booked</th>
                <th className="py-2 pr-3 text-right">Publisher mapped</th>
                <th className="py-2 pr-3 text-right">Local</th>
                <th className="py-2 pr-3">Months</th>
                <th className="py-2">Source &amp; gaps</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => {
                const st = coverageStatus(c.dataCad, c.mirCad, c.sources);
                return (
                  <tr key={c.dsp} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3 font-semibold text-gray-900">{c.dsp}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.dataCad ? formatCompactMoney(c.dataCad) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.mirCad ? formatCompactMoney(c.mirCad) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.dataCad ? formatPct(c.mappedCad / c.dataCad) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.mappedCad ? formatPct(c.localCad / c.mappedCad) : "—"}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-600">
                      {c.months.length ? `${monthLabel(c.months[0])} – ${monthLabel(c.months[c.months.length - 1])}` : "—"}
                    </td>
                    <td className="py-2 text-xs text-gray-600">{DSP_SOURCE_NOTES[c.dsp]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          MIR is booked (ordered) spend; DSP data is delivered spend to Nov 17, so they won&apos;t match exactly. A large gap means accounts or months are
          missing from the DSP data.
        </p>
      </ChartCard>

      {/* Monthly + by DSP */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly spend by local category" subtitle="DSP data, CAD" icon={PieChart}>
          <StackedBarChart
            series={LOCAL_ORDER.map((l) => ({ label: LOCAL_LABELS[l], color: LOCAL_COLORS[l], points: monthly[l] }))}
            valueFormat={formatCompactMoney}
            height={280}
          />
        </ChartCard>
        <ChartCard title="Local category by DSP" subtitle="DSP data, CAD" icon={Layers}>
          <HorizontalStackedBar
            series={LOCAL_ORDER.map((l) => ({ key: l, label: LOCAL_LABELS[l], color: LOCAL_COLORS[l] }))}
            rows={coverage.filter((c) => c.dataCad > 0).map((c) => ({ label: c.dsp, values: byLocal(rows.filter((r) => r.dsp === c.dsp)) }))}
            valueFormat={formatCompactMoney}
          />
        </ChartCard>
      </div>

      {/* Publishers */}
      <ChartCard
        title="Spend by publisher"
        subtitle="Plus media partner when mapped (order code, deal mapping or name); otherwise the DSP's own site / publisher / deal label"
        icon={Newspaper}
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={hideUnmapped} onChange={(e) => setHideUnmapped(e.target.checked)} />
              Mapped only
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={pubQuery}
                onChange={(e) => setPubQuery(e.target.value)}
                placeholder="Search publisher"
                className="w-48 border border-gray-300 py-1 pl-7 pr-2 text-sm"
              />
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Publisher</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">DSPs</th>
                <th className="py-2 pr-3 text-right">Clients</th>
                <th className="py-2 pr-3 text-right">Impressions</th>
                <th className="py-2 pr-3 text-right">Spend (CAD)</th>
                <th className="py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {visiblePubs.slice(0, pubLimit).map((p) => (
                <tr key={`${p.partner}|${p.publisher}`} className="border-b border-gray-100">
                  <td className="max-w-[360px] truncate py-1.5 pr-3 text-gray-900" title={p.publisher}>
                    {p.publisher}
                  </td>
                  <td className="py-1.5 pr-3">
                    <LocalChip local={p.local} />
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-gray-600">{p.dsps.join(", ")}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.clients}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.impressions ? p.impressions.toLocaleString("en-CA") : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(p.spendCad)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{formatPct(total ? p.spendCad / total : null, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {Math.min(pubLimit, visiblePubs.length)} of {visiblePubs.length} publishers
          </span>
          {visiblePubs.length > pubLimit && (
            <button type="button" className="font-semibold text-gray-900 underline" onClick={() => setPubLimit((n) => n + 50)}>
              Show 50 more
            </button>
          )}
        </div>
      </ChartCard>

      {/* Clients + deal types */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Clients" subtitle="DSP data vs MIR booked, and the local share of mapped spend" icon={Users} className="xl:col-span-2">
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">DSPs</th>
                  <th className="py-2 pr-3 text-right">DSP data</th>
                  <th className="py-2 pr-3 text-right">MIR booked</th>
                  <th className="py-2 text-right">Local</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((c) => {
                  const m = c.spendCad - c.local.UNMAPPED;
                  return (
                    <tr
                      key={c.client}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                      onClick={() => setFilters((f) => ({ ...f, client: f.client === c.client ? null : c.client }))}
                      title="Click to filter the page to this client"
                    >
                      <td className={`py-1.5 pr-3 ${c.client.startsWith("(unmapped)") ? "text-gray-500 italic" : "text-gray-900"}`}>{c.client}</td>
                      <td className="py-1.5 pr-3 text-xs text-gray-600">{c.dsps.join(", ")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{c.spendCad ? formatCompactMoney(c.spendCad) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{c.mirCad ? formatCompactMoney(c.mirCad) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{m > 0 ? formatPct(c.local.LOCAL / m) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Deal type" subtitle="DSP data, CAD" icon={Layers}>
          <BarList items={deals.map((d) => ({ label: d.dealType, value: d.spendCad, color: PLUS.purple }))} valueFormat={formatCompactMoney} />
        </ChartCard>
      </div>
    </div>
  );
}
