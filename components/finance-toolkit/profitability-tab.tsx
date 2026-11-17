// filepath: components/finance-toolkit/profitability-tab.tsx
"use client";

/**
 * Finance Toolkit · Tab 2 — Account Profitability. Gross revenue (Finance's
 * gross revenue reports) against staffing cost (Maconomy client hours × cost)
 * per account, for a period inside the revenue window. Accounts without a
 * revenue match show hours and cost only, labeled — never a zero margin.
 */

import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { AlertTriangle, Clock, DollarSign, Percent, Scale, Search, Table2, TrendingUp } from "lucide-react";
import StatCard from "../dashboard/charts/stat-card";
import ChartCard from "../dashboard/charts/chart-card";
import { PLUS } from "../dashboard/charts/colors";
import { ChartContainer, ChartTooltip, type ChartConfig } from "../ui/chart";
import {
  FLAG_MIN_HOURS,
  MODEL,
  OVER_SERVICED_RATIO,
  REVENUE_WINDOW,
  periodLabel,
  profitability,
  type ProfitRow,
  type Scope,
} from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { COVERAGE_NOTE_BELOW, COVERAGE_WARN_BELOW, Chip, DataTable, Field, Formula, GhostButton, HowCalculated, MonthRange, Notice, Segmented, type Column } from "./ft-ui";
import { downloadCsv, formatCompactMoney, hours, money, pct, rate } from "./ft-format";
import ClientDetailDrawer from "./client-detail-drawer";

const REV_MONTHS = MODEL.revenueMonthIndices;
const R0 = REVENUE_WINDOW.from;

type Preset = "ytd" | "q1" | "q2" | "q3" | "custom";
const PRESETS: { id: Preset; label: string; range?: [number, number] }[] = [
  { id: "ytd", label: "Jan – Aug 2026", range: [R0, REVENUE_WINDOW.to] },
  { id: "q1", label: "Q1", range: [R0, R0 + 2] },
  { id: "q2", label: "Q2", range: [R0 + 3, R0 + 5] },
  { id: "q3", label: "Jul – Aug", range: [R0 + 6, REVENUE_WINDOW.to] },
  { id: "custom", label: "Custom" },
];

type View = "all" | "flagged" | "unmatched";

const scatterConfig: ChartConfig = {
  ok: { label: "Account", color: PLUS.purple },
  over: { label: "Over-serviced", color: PLUS.yellow },
  loss: { label: "Cost exceeds revenue", color: PLUS.red },
};

/** Power-of-ten axis label: 1000 → "$1K", 1e6 → "$1M". */
function logTick(v: number): string {
  if (v >= 1e6) return `$${v / 1e6}M`;
  if (v >= 1e3) return `$${v / 1e3}K`;
  return `$${v}`;
}

function FlagChip({ row }: { row: ProfitRow }) {
  if (row.status === "no-revenue") return <Chip tone="neutral" title="Hours booked to this account but no gross revenue line">No revenue match</Chip>;
  if (row.status === "no-hours") return <Chip tone="neutral" title="Gross revenue with no hours in the same agency">No hours match</Chip>;
  if (row.flag === "loss") return <Chip tone="loss">Cost &gt; revenue</Chip>;
  if (row.flag === "over-serviced") return <Chip tone="over">Over-serviced</Chip>;
  if (row.flag === "credit") {
    return (
      <Chip tone="neutral" title="Revenue nets to zero or below in this period (credit notes / reversals) — margin is not meaningful">
        Net credit
      </Chip>
    );
  }
  return null;
}

export default function ProfitabilityTab({ scope, basis }: { scope: Scope; basis: CostBasis }) {
  const [preset, setPreset] = useState<Preset>("ytd");
  const [from, setFrom] = useState(R0);
  const [to, setTo] = useState(REVENUE_WINDOW.to);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const result = useMemo(() => profitability(scope, from, to, basis), [scope, from, to, basis]);
  const { totals } = result;
  const { matched, unmatched, flagged } = useMemo(() => {
    const m = result.rows.filter((r) => r.status === "matched");
    return {
      matched: m,
      unmatched: result.rows.filter((r) => r.status !== "matched"),
      // "To review" = loss-making or over-serviced; net-credit periods are labeled, not reviewed.
      flagged: m.filter((r) => r.flag === "loss" || r.flag === "over-serviced").sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)),
    };
  }, [result]);
  // The drawer follows the period / cost basis: keep the id, re-derive the row.
  const selected = selectedId === null ? null : result.rows.find((r) => r.client.index === selectedId) ?? null;
  const setSelected = (r: ProfitRow | null) => setSelectedId(r ? r.client.index : null);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const range = PRESETS.find((x) => x.id === p)?.range;
    if (range) {
      setFrom(range[0]);
      setTo(range[1]);
    }
  };

  const q = query.trim().toLowerCase();
  const tableRows = (view === "flagged" ? flagged : view === "unmatched" ? unmatched : matched).filter(
    (r) => !q || r.client.name.toLowerCase().includes(q) || r.client.number.includes(q)
  );

  const showAgency = scope.agencyIds.length > 1;
  const columns: Column<ProfitRow>[] = [
    {
      id: "client",
      label: "Account",
      sort: (r) => r.client.name,
      render: (r) => (
        <div className="max-w-[300px]">
          <div className="truncate font-medium text-gray-900" title={r.client.name}>
            {r.client.name}
          </div>
          <div className="text-[11px] text-gray-500">
            {showAgency ? `${r.client.agencyName} · ` : ""}#{r.client.number}
          </div>
        </div>
      ),
    },
    { id: "revenue", label: "Gross revenue", align: "right", sort: (r) => r.revenue, render: (r) => money(r.revenue), total: view === "all" ? money(totals.matchedRevenue) : undefined },
    { id: "cost", label: "Staffing cost", align: "right", sort: (r) => r.cost, render: (r) => money(r.cost), total: view === "all" ? money(totals.matchedCost) : undefined },
    {
      id: "margin",
      label: "Gross margin",
      align: "right",
      sort: (r) => r.margin,
      render: (r) => (r.margin === null ? <FlagChip row={r} /> : <span className={r.margin < 0 ? "font-semibold text-red-700" : ""}>{money(r.margin)}</span>),
      total: view === "all" ? money(totals.margin) : undefined,
    },
    { id: "marginPct", label: "Margin %", align: "right", sort: (r) => r.marginPct, render: (r) => pct(r.marginPct), total: view === "all" ? pct(totals.marginPct) : undefined },
    { id: "rph", label: "Revenue / hour", align: "right", sort: (r) => r.revenuePerHour, render: (r) => rate(r.revenuePerHour), total: view === "all" ? rate(totals.revenuePerHour) : undefined },
    { id: "hours", label: "Hours", align: "right", sort: (r) => r.hours, render: (r) => hours(r.hours), total: view === "all" ? hours(totals.matchedHours) : undefined },
    { id: "people", label: "People", align: "right", sort: (r) => r.people, render: (r) => r.people || "—", total: view === "all" ? String(totals.people) : undefined, headerTitle: "Distinct employees who logged client hours in the period" },
    { id: "costPct", label: "Cost % of revenue", align: "right", sort: (r) => r.costPctRevenue, render: (r) => pct(r.costPctRevenue), total: view === "all" ? pct(totals.costPctRevenue) : undefined },
    { id: "flag", label: "Flag", sort: (r) => (r.flag === "loss" ? 3 : r.flag === "over-serviced" ? 2 : r.flag ? 1 : 0), render: (r) => (r.margin === null ? null : <FlagChip row={r} />) },
  ];

  const scatter = useMemo(() => {
    const pts = matched
      .filter((r) => r.revenue! > 0 && r.cost! > 0)
      .map((r) => ({ x: r.revenue!, y: r.cost!, z: r.hours, name: r.client.name, flag: r.flag, marginPct: r.marginPct, row: r }));
    const max = Math.max(1000, ...pts.map((p) => Math.max(p.x, p.y)));
    const min = Math.max(100, Math.min(...pts.map((p) => Math.min(p.x, p.y)), max));
    return {
      ok: pts.filter((p) => !p.flag),
      over: pts.filter((p) => p.flag === "over-serviced"),
      loss: pts.filter((p) => p.flag === "loss"),
      domain: [Math.pow(10, Math.floor(Math.log10(min))), Math.pow(10, Math.ceil(Math.log10(max)))] as [number, number],
      // Clean log ticks: one per power of ten.
      ticks: Array.from({ length: Math.ceil(Math.log10(max)) - Math.floor(Math.log10(min)) + 1 }, (_, i) => Math.pow(10, Math.floor(Math.log10(min)) + i)),
    };
  }, [matched]);

  const exportCsv = () => {
    downloadCsv(
      `finance-toolkit-profitability-${scope.id}-${MODEL.months[from]}-to-${MODEL.months[to]}.csv`,
      ["Account", "Agency", "Client #", "Status", `Gross revenue (${scope.currency})`, `Staffing cost (${scope.currency}, ${basis === "base1" ? "Base1" : "Enterprise"})`, "Gross margin", "Margin %", "Revenue per hour", "Client hours", "People", "Cost % of revenue", "Flag", "Hours with cost on file"],
      result.rows.map((r) => [
        r.client.name,
        r.client.agencyName,
        r.client.number,
        r.status === "matched" ? "Matched" : r.status === "no-revenue" ? "No revenue match" : "No hours match",
        r.revenue,
        r.cost,
        r.margin,
        r.marginPct,
        r.revenuePerHour,
        r.hours,
        r.people,
        r.costPctRevenue,
        r.flag === "loss" ? "Cost exceeds revenue" : r.flag === "over-serviced" ? "Over-serviced" : "",
        r.costCoverage,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border border-gray-200 bg-white px-5 py-4">
        <Field label="Period">
          <Segmented options={PRESETS} value={preset} onChange={choosePreset} ariaLabel="Period" />
        </Field>
        {preset === "custom" && (
          <Field label="Custom range">
            <MonthRange months={REV_MONTHS} from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
          </Field>
        )}
        <p className="mb-1.5 ml-auto max-w-sm text-right text-[11px] leading-snug text-gray-500">
          Gross revenue is available for {REVENUE_WINDOW.label} only, so profitability is limited to that window.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={DollarSign}
          label={`Gross revenue (${scope.currency})`}
          value={formatCompactMoney(totals.revenue)}
          sub={`${matched.length} accounts with hours${totals.revenueOnly ? ` · ${formatCompactMoney(totals.revenueOnly)} without hours` : ""}`}
        />
        <StatCard icon={Clock} label="Staffing cost" value={formatCompactMoney(totals.matchedCost)} sub={`${pct(totals.costPctRevenue)} of matched revenue · ${hours(totals.matchedHours)} h`} />
        <StatCard
          icon={Percent}
          label="Gross margin after staffing"
          value={pct(totals.marginPct)}
          sub={`${formatCompactMoney(totals.margin)} on matched accounts`}
          accent={totals.marginPct !== null && totals.marginPct < 0 ? "text-red-500" : "text-green-500"}
        />
        <StatCard icon={TrendingUp} label="Revenue per client hour" value={rate(totals.revenuePerHour)} sub={`vs ${rate(totals.costPerHour)} cost per hour`} />
        <StatCard
          icon={AlertTriangle}
          label="Accounts to review"
          value={String(totals.flagged)}
          sub={`${totals.lossMaking} with cost > revenue · ${totals.flagged - totals.lossMaking} over-serviced`}
          accent={totals.flagged ? "text-red-500" : "text-primary"}
        />
      </div>

      {totals.costCoverage !== null && totals.costCoverage < COVERAGE_NOTE_BELOW && (
        <Notice tone={totals.costCoverage < COVERAGE_WARN_BELOW ? "warn" : "info"}>
          <p>
            <strong>{pct(1 - totals.costCoverage)} of the client hours in this scope carry no cost in Maconomy</strong> (employees with no
            cost rate on file). Staffing cost is understated and margins overstated by that much — confirm cost rates with Finance before
            relying on these margins.
          </p>
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Revenue vs staffing cost by account"
          subtitle="Log scales · above the line, staffing cost exceeds revenue · bubble size = hours"
          icon={Scale}
        >
          {scatter.ok.length + scatter.over.length + scatter.loss.length === 0 ? (
            <p className="py-16 text-center text-xs text-gray-500">No accounts with both revenue and hours in this period.</p>
          ) : (
            <ChartContainer config={scatterConfig} className="aspect-auto w-full" style={{ height: 320 }}>
              <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="Revenue" scale="log" domain={scatter.domain} ticks={scatter.ticks} allowDataOverflow tickFormatter={(v) => logTick(Number(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} height={36} label={{ value: "Gross revenue →", position: "insideBottom", offset: -2, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Cost" scale="log" domain={scatter.domain} ticks={scatter.ticks} allowDataOverflow tickFormatter={(v) => logTick(Number(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} label={{ value: "Staffing cost →", angle: -90, position: "insideLeft", offset: 4, fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[24, 400]} />
                <ReferenceLine
                  segment={[{ x: scatter.domain[0], y: scatter.domain[0] }, { x: scatter.domain[1], y: scatter.domain[1] }]}
                  stroke={PLUS.red}
                  strokeDasharray="5 4"
                  ifOverflow="hidden"
                  label={{ value: "Break-even", position: "insideTopLeft", fontSize: 10, fill: PLUS.red }}
                />
                <ReferenceLine
                  segment={[{ x: scatter.domain[0], y: scatter.domain[0] * 0.5 }, { x: scatter.domain[1], y: scatter.domain[1] * 0.5 }]}
                  stroke="#94a3b8"
                  strokeDasharray="2 4"
                  ifOverflow="hidden"
                  label={{ value: "50% margin", position: "insideBottomRight", fontSize: 10, fill: "#64748b" }}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = active && payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="border border-gray-200 bg-white px-3 py-2 text-xs shadow-xl">
                        <div className="mb-1 max-w-[240px] truncate font-semibold text-gray-900">{p.name}</div>
                        <div className="tabular-nums text-gray-600">Revenue {money(p.x)}</div>
                        <div className="tabular-nums text-gray-600">Staffing cost {money(p.y)}</div>
                        <div className="tabular-nums text-gray-600">Margin {pct(p.marginPct)} · {hours(p.z)} h</div>
                      </div>
                    );
                  }}
                />
                {(["ok", "over", "loss"] as const).map((k) => (
                  <Scatter
                    key={k}
                    name={scatterConfig[k].label as string}
                    data={scatter[k]}
                    fill={`var(--color-${k})`}
                    fillOpacity={0.85}
                    stroke={k === "over" ? "#b38600" : "none"}
                    isAnimationActive={false}
                    onClick={(d: { payload?: { row: ProfitRow } }) => d?.payload?.row && setSelected(d.payload.row)}
                    className="cursor-pointer"
                  />
                ))}
              </ScatterChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard title="Accounts to review" subtitle="Worst margin first · click to open" icon={AlertTriangle}>
          {flagged.length === 0 ? (
            <p className="py-10 text-center text-xs text-gray-500">No account is flagged in this period.</p>
          ) : (
            <ul className="-mx-2 max-h-[320px] divide-y divide-gray-100 overflow-y-auto">
              {flagged.map((r) => (
                <li key={r.client.index}>
                  <button type="button" onClick={() => setSelected(r)} className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-gray-900">{r.client.name}</div>
                      <div className="text-[11px] tabular-nums text-gray-500">
                        {money(r.revenue)} revenue · {hours(r.hours)} h · {rate(r.revenuePerHour)}/h
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <FlagChip row={r} />
                      <div className={`mt-0.5 text-xs font-semibold tabular-nums ${r.margin! < 0 ? "text-red-700" : "text-gray-700"}`}>{money(r.margin)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Account league table"
        subtitle={`${scope.label} · ${periodLabel(from, to)} · ${basis === "base1" ? "Base1" : "Enterprise"} cost · click an account for its trend and role mix`}
        icon={Table2}
        action={<GhostButton onClick={exportCsv}>Download CSV</GhostButton>}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            ariaLabel="Accounts shown"
            options={[
              { id: "all", label: `Accounts with revenue & hours (${matched.length})` },
              { id: "flagged", label: `To review (${flagged.length})` },
              { id: "unmatched", label: `Unmatched (${unmatched.length})` },
            ]}
          />
          <label className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search account or #"
              className="w-56 border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </label>
        </div>
        {view === "unmatched" && (
          <p className="mb-3 text-xs text-gray-600">
            <strong>No revenue match</strong>: client hours ({hours(totals.unmatchedHours)} h, {money(totals.unmatchedCost)}) on accounts with no gross
            revenue line in the same agency — often work for a client whose revenue is booked in another agency, or pitches.{" "}
            <strong>No hours match</strong>: {money(totals.revenueOnly)} of revenue with no hours in the same agency (incl. K72, which has no hours export).
            Neither is given a margin.
          </p>
        )}
        <DataTable
          columns={columns}
          rows={tableRows}
          rowKey={(r) => String(r.client.index)}
          defaultSort={{ id: view === "unmatched" ? "hours" : "revenue", dir: "desc" }}
          onRowClick={setSelected}
          activeKey={selected ? String(selected.client.index) : null}
          maxRows={40}
          footerLabel="Matched accounts"
          emptyText={q ? "No account matches your search." : "No accounts in this view."}
        />
      </ChartCard>

      <HowCalculated>
        <Formula
          name="Gross revenue"
          formula="Σ monthly gross revenue (Finance gross revenue report, job lines)"
          worked={`${money(totals.revenue)} in ${periodLabel(from, to)}, tying to the reports${
            totals.houseRevenue ? `; includes ${money(totals.houseRevenue)} booked to agency house accounts` : ""
          }`}
        />
        <Formula name="Staffing cost" formula={`Σ Maconomy ${basis === "base1" ? "CostPriceReg_Base1" : "CostPriceReg_Enterprise"} on client-work hours`} worked={`${money(totals.matchedCost)} on ${hours(totals.matchedHours)} h → ${rate(totals.costPerHour)} per hour`} />
        <Formula name="Gross margin" formula="gross revenue − staffing cost" worked={`${money(totals.matchedRevenue)} − ${money(totals.matchedCost)} = ${money(totals.margin)}`} />
        <Formula name="Margin %" formula="Σ margin ÷ Σ revenue (portfolio math, not an average of %)" worked={`${money(totals.margin)} ÷ ${money(totals.matchedRevenue)} = ${pct(totals.marginPct)}`} />
        <Formula name="Revenue per hour" formula="Σ revenue ÷ Σ client hours" worked={`${money(totals.matchedRevenue)} ÷ ${hours(totals.matchedHours)} h = ${rate(totals.revenuePerHour)}`} />
        <Formula name="Cost exceeds revenue" formula={`staffing cost > revenue, and ≥ ${FLAG_MIN_HOURS} client hours in the period`} />
        <Formula
          name="Over-serviced"
          formula={`revenue per hour < ${OVER_SERVICED_RATIO * 100}% of the scope's revenue per hour, ≥ ${FLAG_MIN_HOURS} h`}
          worked={`threshold this view: ${rate(totals.revenuePerHour === null ? null : totals.revenuePerHour * OVER_SERVICED_RATIO)} per hour`}
        />
        <Formula name="Net credit" formula="revenue ≤ 0 in the period (credit notes / reversals): labeled, no margin %, not reviewed" />
        <Formula name="People" formula="distinct employees who logged client hours on the account in the period" />
        <div className="mt-3 space-y-1.5 text-xs text-gray-600">
          <p>
            <strong>What counts as client work:</strong> hours with a client work code booked to a real client. Time off (15xx codes), internal work
            (16xx codes) and everything on the agencies’ own house accounts are overhead — {hours(totals.overheadHours)} h /{" "}
            {money(totals.overheadCost)} in this view — and are not charged to any account.
          </p>
          <p>
            <strong>Matching:</strong> revenue lines are tied to hours by Maconomy client number within the same agency (one by exact normalized name). No
            fuzzy matching; unmatched accounts are listed under “Unmatched”.
          </p>
          <p>
            <strong>Currency:</strong> each scope stays in its own currency ({scope.currency}); CAD and USD are never added together.
          </p>
        </div>
      </HowCalculated>

      {selected && (
        <ClientDetailDrawer row={selected} from={from} to={to} basis={basis} currency={scope.currency} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
