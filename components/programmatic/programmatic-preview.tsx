// components/programmatic/programmatic-preview.tsx
"use client";

/**
 * Programmatic (preview) — programmatic spend across DSPs by publisher and
 * Canadian / mixed / foreign, written for senior readers: a one-sentence
 * headline, then "how complete is this?" before any detail, then three plain
 * questions. Advanced tables and source notes sit under "More detail".
 * Read-only; data from lib/services/programmatic-preview-service.ts.
 */

import { useMemo, useState } from "react";
import { ChevronDown, HelpCircle, Info, RotateCcw, Search } from "lucide-react";
import ChartCard from "../dashboard/charts/chart-card";
import StackedBarChart from "../dashboard/charts/stacked-bar-chart";
import HorizontalStackedBar from "../dashboard/charts/horizontal-stacked-bar";
import BarList from "../dashboard/charts/bar-list";
import { PLUS } from "../dashboard/charts/colors";
import { formatCompactMoney, formatPct } from "../dashboard/charts/format";
import {
  ALL_DSPS,
  DSP_SOURCE_NOTES,
  DSP_STATUS_TEXT,
  LOCAL_DEFINITIONS,
  LOCAL_LABELS,
  LOCAL_ORDER,
  byLocal,
  clients as clientLines,
  coverageByDsp,
  dealTypes,
  facetOptions,
  filterRows,
  monthlyByLocal,
  publishers as publisherLines,
  sumSpend,
  type ClientFacet,
  type DspCoverage,
  type ProgFilters,
} from "../../lib/programmatic/aggregate";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
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
/** Client filters, in the order people narrow down: agency → region → GM pod → client. */
const CLIENT_FACETS: { key: ClientFacet; label: string; plural: string }[] = [
  { key: "agencies", label: "Agency", plural: "agencies" },
  { key: "regions", label: "BU Region", plural: "BU regions" },
  { key: "gms", label: "GM Pod", plural: "GM pods" },
  { key: "clients", label: "Client", plural: "clients" },
];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const money = (v: number) => `$${Math.round(v).toLocaleString("en-CA")}`;

// Partner names are stored in capitals (naming list); show them the way people say them.
const PARTNER_DISPLAY: Record<string, string> = {
  "GOOGLE INC": "Google / YouTube",
  AMAZON: "Amazon (Prime Video, Twitch, …)",
  INDEX: "Index Exchange",
  "THE WEATHER COMPANY LLC": "The Weather Company",
  "I HEART MEDIA": "iHeartMedia",
  "VALNET INC.": "Valnet",
  "FORBES MEDIA LLC": "Forbes",
  "THE NY TIMES": "The New York Times",
  "SCORE MEDIA & GAMING": "theScore",
  "SAMSUNG ELECTRONICS CANADA INC": "Samsung",
  "MEREDITH FUNDING COR": "Meredith",
  "TRADER INTERACTIVE": "Trader Interactive (ATV/RV Trader)",
};
const KEEP_UPPER = new Set(["CBC", "MLB", "NBC", "NHL", "ESPN", "TVA", "TV5", "APTN", "MSN", "CN2I", "SRC", "MIQ", "BBC"]);
const SMALL = new Set(["and", "of", "the", "de", "du", "des", "la", "le"]);
function displayName(name: string, isPartner: boolean): string {
  if (!isPartner) return name;
  if (PARTNER_DISPLAY[name]) return PARTNER_DISPLAY[name];
  return name
    .split(" ")
    .map((w, i) => (KEEP_UPPER.has(w) ? w : i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

function CategoryChip({ local }: { local: LocalCategory }) {
  return <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LOCAL_CHIP[local]}`}>{LOCAL_LABELS[local]}</span>;
}

type Completeness = { label: string; cls: string; bar: string };
/** Plain completeness of a DSP's data for the selected period, vs MediaOcean bookings. */
function completeness(c: DspCoverage): Completeness {
  if (c.dataCad === 0) return { label: "Not connected yet", cls: "bg-gray-200 text-gray-700", bar: "#d1d5db" };
  const ratio = c.mirCad > 0 ? c.dataCad / c.mirCad : 1;
  if (c.sources.some((s) => s.startsWith("Template")) || ratio < 0.8) return { label: "Partial", cls: "bg-yellow-400 text-gray-900", bar: PLUS.yellow };
  return { label: "Complete", cls: "bg-green-500 text-white", bar: PLUS.green };
}

function Section({ step, title, children }: { step?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
        {step && <span className="flex h-6 w-6 items-center justify-center bg-gray-900 text-xs text-yellow-400">{step}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ProgrammaticPreview({ data }: { data: ProgrammaticPreviewData }) {
  const months = data.months.length ? data.months : [...new Set(data.rows.map((r) => r.month))].sort();
  const initial: ProgFilters = {
    dsps: new Set(ALL_DSPS),
    agencies: [],
    regions: [],
    gms: [],
    clients: [],
    from: months[0] ?? `${data.year}-01`,
    to: months[months.length - 1] ?? `${data.year}-12`,
  };
  const [filters, setFilters] = useState<ProgFilters>(initial);
  const [showAllPubs, setShowAllPubs] = useState(false);
  const [pubQuery, setPubQuery] = useState("");
  const [pubLimit, setPubLimit] = useState(50);

  const allClients = useMemo(
    () =>
      [...new Set([...data.rows.map((r) => r.client), ...data.mir.map((m) => m.client)])]
        .filter((c) => !c.startsWith("(unmapped)"))
        .sort((a, b) => a.localeCompare(b)),
    [data]
  );

  const info = useMemo(() => data.clientInfo ?? {}, [data.clientInfo]);
  const rows = useMemo(() => filterRows(data.rows, filters, info), [data.rows, filters, info]);
  const mir = useMemo(() => filterRows(data.mir, filters, info), [data.mir, filters, info]);
  const total = sumSpend(rows);
  const booked = mir.reduce((s, m) => s + m.mirCad, 0);
  const local = byLocal(rows);
  const identified = total - local.UNMAPPED;
  const coverage = useMemo(() => coverageByDsp(rows, mir, ALL_DSPS.filter((d) => filters.dsps.has(d))), [rows, mir, filters.dsps]);
  const dspsWithData = coverage.filter((c) => c.dataCad > 0);
  const monthly = useMemo(() => monthlyByLocal(rows), [rows]);
  const pubs = useMemo(() => publisherLines(rows), [rows]);
  const clientRows = useMemo(() => clientLines(rows, mir), [rows, mir]);
  const deals = useMemo(() => dealTypes(rows), [rows]);

  const topPubs = pubs.filter((p) => p.local !== "UNMAPPED").slice(0, 10);
  const allPubs = pubs.filter((p) => !pubQuery || p.publisher.toLowerCase().includes(pubQuery.toLowerCase()) || displayName(p.publisher, p.local !== "UNMAPPED").toLowerCase().includes(pubQuery.toLowerCase()));
  const periodLabel = filters.from === filters.to ? monthLabel(filters.from) : `${monthLabel(filters.from)} – ${monthLabel(filters.to)}`;
  const clientFilterOn = CLIENT_FACETS.some(({ key }) => filters[key].length > 0);
  const isFiltered = clientFilterOn || filters.dsps.size !== ALL_DSPS.length || filters.from !== initial.from || filters.to !== initial.to;
  // "Cossette Media · Quebec · 3 clients" — what the headline numbers cover.
  const scopeLabel = CLIENT_FACETS.filter(({ key }) => filters[key].length > 0)
    .map(({ key, plural }) => (filters[key].length === 1 ? filters[key][0] : `${filters[key].length} ${plural}`))
    .join(" · ");
  const toggleClient = (c: string) =>
    setFilters((f) => ({ ...f, clients: f.clients.includes(c) ? f.clients.filter((x) => x !== c) : [...f.clients, c] }));

  const toggleDsp = (d: ProgDsp) =>
    setFilters((f) => {
      const next = new Set(f.dsps);
      if (next.has(d)) {
        if (next.size > 1) next.delete(d);
      } else next.add(d);
      return { ...f, dsps: next };
    });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 border border-gray-200 bg-white p-4">
        {CLIENT_FACETS.map(({ key, label, plural }) => (
          <div key={key}>
            <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
            <MultiSelectDropdown
              label={filters[key].length ? label : `All ${plural}`}
              options={facetOptions(allClients, filters, info, key).map((v) => ({ value: v, label: v }))}
              selectedValues={filters[key]}
              onChange={(values) => setFilters((f) => ({ ...f, [key]: values }))}
              searchable
            />
          </div>
        ))}
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="text-xs">
            <span className="mb-1 block font-semibold text-gray-600">{k === "from" ? "From" : "To"}</span>
            <select className="border border-gray-300 bg-white px-2 py-1.5 text-sm" value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}>
              {months.map((m) => (
                <option key={m} value={m} disabled={k === "from" ? m > filters.to : m < filters.from}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div>
          <span className="mb-1 block text-xs font-semibold text-gray-600">DSPs (click to include / exclude)</span>
          <div className="flex flex-wrap gap-1">
            {ALL_DSPS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDsp(d)}
                className={`border px-2.5 py-1 text-xs font-medium ${filters.dsps.has(d) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-500 line-through"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        {isFiltered && (
          <button type="button" onClick={() => setFilters(initial)} className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-700 underline">
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {/* Headline */}
      <div className="border border-gray-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {periodLabel}
          {scopeLabel ? ` · ${scopeLabel}` : " · All clients"}
        </p>
        <p className="mt-2 text-2xl font-bold leading-snug text-gray-900">
          {formatCompactMoney(total)} spent through programmatic DSPs.{" "}
          <span className="text-green-600">{formatCompactMoney(local.LOCAL)}</span> of it went to Canadian publishers.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border-l-4 border-gray-900 pl-3">
            <p className="text-xs text-gray-500">Spend in DSP reports</p>
            <p className="text-xl font-bold text-gray-900">{formatCompactMoney(total)}</p>
            <p className="text-xs text-gray-500">{booked ? `${formatCompactMoney(booked)} booked in MediaOcean for the same period` : " "}</p>
          </div>
          <div className="border-l-4 border-green-500 pl-3">
            <p className="text-xs text-gray-500">Went to Canadian publishers</p>
            <p className="text-xl font-bold text-gray-900">{formatPct(identified ? local.LOCAL / identified : null)}</p>
            <p className="text-xs text-gray-500">of spend where we know the publisher ({formatPct(total ? local.LOCAL / total : null)} of all spend)</p>
          </div>
          <div className="border-l-4 border-yellow-400 pl-3">
            <p className="text-xs text-gray-500">Publisher identified</p>
            <p className="text-xl font-bold text-gray-900">{formatPct(total ? identified / total : null)}</p>
            <p className="text-xs text-gray-500">{formatCompactMoney(local.UNMAPPED)} where the DSP report doesn&apos;t name the publisher yet</p>
          </div>
        </div>
      </div>

      {/* 1. Completeness */}
      <Section step={1} title="How complete is this data?">
        <div className="border border-gray-200 bg-white p-5">
          <p className="mb-4 text-sm text-gray-600">
            Each DSP&apos;s report is compared with what was booked in MediaOcean for the same period. A full bar means the DSP data covers what was booked.
          </p>
          <ul className="space-y-3">
            {coverage.map((c) => {
              const st = completeness(c);
              const pct = c.mirCad > 0 ? Math.min(1, c.dataCad / c.mirCad) : c.dataCad > 0 ? 1 : 0;
              return (
                <li key={c.dsp} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[110px_1fr_200px_130px]">
                  <span className="font-semibold text-gray-900">{c.dsp}</span>
                  <div>
                    <div className="h-3 w-full bg-gray-100">
                      <div className="h-3" style={{ width: `${pct * 100}%`, background: st.bar }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{DSP_STATUS_TEXT[c.dsp]}</p>
                  </div>
                  <span className="text-sm tabular-nums text-gray-700">
                    {c.dataCad ? formatCompactMoney(c.dataCad) : "$0"} of {formatCompactMoney(c.mirCad)} booked
                  </span>
                  <span className={`justify-self-start whitespace-nowrap px-2 py-0.5 text-[11px] font-bold uppercase md:justify-self-end ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            Bookings and DSP reports never match to the dollar: bookings are planned amounts, DSP reports are what actually ran (to Nov 17). DSPs marked
            &quot;Not connected yet&quot; are left out of every figure below.
          </p>
        </div>
      </Section>

      {/* 2. Canadian share */}
      <Section step={2} title="How much went to Canadian publishers?">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="By month" subtitle="Spend in DSP reports, CAD">
            <StackedBarChart
              series={LOCAL_ORDER.filter((l) => l !== "UNKNOWN" || local.UNKNOWN > 0).map((l) => ({ label: LOCAL_LABELS[l], color: LOCAL_COLORS[l], points: monthly[l] }))}
              valueFormat={formatCompactMoney}
              height={280}
            />
          </ChartCard>
          <ChartCard title="By DSP" subtitle="Spend in DSP reports, CAD">
            <HorizontalStackedBar
              series={LOCAL_ORDER.map((l) => ({ key: l, label: LOCAL_LABELS[l], color: LOCAL_COLORS[l] }))}
              rows={dspsWithData.map((c) => ({ label: c.dsp, values: byLocal(rows.filter((r) => r.dsp === c.dsp)) }))}
              valueFormat={formatCompactMoney}
            />
          </ChartCard>
        </div>
      </Section>

      {/* 3. Publishers */}
      <Section step={3} title="Who are the top publishers?">
        <div className="border border-gray-200 bg-white p-5">
          {!showAllPubs ? (
            <>
              <ol className="divide-y divide-gray-100">
                {topPubs.map((p, i) => (
                  <li key={`${p.partner}|${p.publisher}`} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-2 sm:grid-cols-[28px_1fr_200px_110px_70px]">
                    <span className="text-sm font-bold text-gray-400">{i + 1}</span>
                    <span className="font-medium text-gray-900">{displayName(p.publisher, true)}</span>
                    <span className="hidden sm:block">
                      <CategoryChip local={p.local} />
                    </span>
                    <span className="text-right tabular-nums text-gray-900">{formatCompactMoney(p.spendCad)}</span>
                    <span className="hidden text-right text-xs tabular-nums text-gray-500 sm:block">{formatPct(total ? p.spendCad / total : null, 1)}</span>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => setShowAllPubs(true)} className="mt-3 text-sm font-semibold text-gray-900 underline">
                Show all {pubs.length} publishers
              </button>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={pubQuery} onChange={(e) => setPubQuery(e.target.value)} placeholder="Search a publisher" className="w-64 border border-gray-300 py-1.5 pl-7 pr-2 text-sm" />
                </div>
                <button type="button" onClick={() => setShowAllPubs(false)} className="text-sm font-semibold text-gray-900 underline">
                  Back to top 10
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-3 font-semibold">Publisher</th>
                      <th className="py-2 pr-3 font-semibold">Category</th>
                      <th className="py-2 pr-3 font-semibold">Bought through</th>
                      <th className="py-2 pr-3 text-right font-semibold">Spend (CAD)</th>
                      <th className="py-2 text-right font-semibold">Share of all spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPubs.slice(0, pubLimit).map((p) => (
                      <tr key={`${p.partner}|${p.publisher}`} className="border-b border-gray-100">
                        <td className="max-w-[380px] truncate py-1.5 pr-3 text-gray-900" title={p.publisher}>
                          {displayName(p.publisher, p.local !== "UNMAPPED")}
                        </td>
                        <td className="py-1.5 pr-3">
                          <CategoryChip local={p.local} />
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-gray-600">{p.dsps.join(", ")}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(p.spendCad)}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{formatPct(total ? p.spendCad / total : null, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {allPubs.length > pubLimit && (
                <button type="button" className="mt-3 text-sm font-semibold text-gray-900 underline" onClick={() => setPubLimit((n) => n + 50)}>
                  Show 50 more ({allPubs.length - pubLimit} left)
                </button>
              )}
            </>
          )}
        </div>
      </Section>

      {/* Terms */}
      <details className="border border-gray-200 bg-white p-5" open>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-gray-900">
          <HelpCircle size={16} /> What do these terms mean?
        </summary>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {LOCAL_ORDER.filter((l) => l !== "UNKNOWN").map((l) => (
            <div key={l} className="flex gap-3">
              <dt className="pt-0.5">
                <CategoryChip local={l} />
              </dt>
              <dd className="text-gray-600">{LOCAL_DEFINITIONS[l]}</dd>
            </div>
          ))}
          <div className="flex gap-3">
            <dt className="whitespace-nowrap pt-0.5 text-xs font-bold uppercase text-gray-900">Booked</dt>
            <dd className="text-gray-600">What the media team booked with each DSP in MediaOcean (the same numbers as the Media Investments tab).</dd>
          </div>
          <div className="flex gap-3">
            <dt className="whitespace-nowrap pt-0.5 text-xs font-bold uppercase text-gray-900">DSP report</dt>
            <dd className="text-gray-600">What the DSP says actually ran, from its own reporting. All amounts in CAD{data.usdRate ? ` (USD at ${data.usdRate})` : ""}.</dd>
          </div>
        </dl>
      </details>

      {/* More detail */}
      <details className="group border border-gray-200 bg-white p-5">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-gray-900">
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" /> More detail: clients, deal types and data sources
        </summary>
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Clients</h3>
            <p className="mb-2 text-xs text-gray-500">Click a client to add it to (or remove it from) the Client filter.</p>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-2 pr-3 font-semibold">Client</th>
                    <th className="py-2 pr-3 font-semibold">DSPs</th>
                    <th className="py-2 pr-3 text-right font-semibold">DSP report</th>
                    <th className="py-2 pr-3 text-right font-semibold">Booked</th>
                    <th className="py-2 text-right font-semibold">Canadian share</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((c) => {
                    const known = c.spendCad - c.local.UNMAPPED;
                    return (
                      <tr key={c.client} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => toggleClient(c.client)}>
                        <td className={`py-1.5 pr-3 ${c.client.startsWith("(unmapped)") ? "italic text-gray-500" : "text-gray-900"}`}>{c.client}</td>
                        <td className="py-1.5 pr-3 text-xs text-gray-600">{c.dsps.join(", ")}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.spendCad ? formatCompactMoney(c.spendCad) : "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.mirCad ? formatCompactMoney(c.mirCad) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{known > 0 ? formatPct(c.local.LOCAL / known) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-bold text-gray-900">Deal type</h3>
              <BarList items={deals.map((d) => ({ label: d.dealType, value: d.spendCad, color: PLUS.purple }))} valueFormat={formatCompactMoney} />
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
                <Info size={14} /> Data sources
              </h3>
              <ul className="space-y-2 text-xs text-gray-600">
                {ALL_DSPS.map((d) => (
                  <li key={d}>
                    <span className="font-semibold text-gray-900">{d}:</span> {DSP_SOURCE_NOTES[d]}
                  </li>
                ))}
                <li>
                  Publisher categories come from the Plus media partner naming list. Last built {new Date(data.generatedAt).toLocaleString("en-CA")}
                  {data.usdBasis ? `; USD at ${data.usdRate} (${data.usdBasis})` : ""}.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
