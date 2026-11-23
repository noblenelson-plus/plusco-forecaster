// filepath: components/finance-toolkit/profitability-tab.tsx
"use client";

/**
 * Finance Toolkit · Account Profitability — built to be read at a glance by a
 * leader seeing it for the first time:
 *
 *   1. the answer in one sentence, with the few numbers behind it
 *   2. five headline tiles (vs the previous period when there is one)
 *   3. every account as a bubble against the break-even line, next to the list
 *      of accounts that need review
 *   4. why they need review: the same accounts grouped by the likely reason
 *   5. the month-by-month trend (labelled bars) next to the top accounts
 *   6. detail on demand: the full account table and the formulas
 *
 * Gross revenue (Finance's gross revenue reports) is set against staffing cost
 * (Maconomy client hours × cost) per account. Accounts without a revenue match
 * show hours and cost only, labeled — never a zero margin. Bands and reasons
 * come from lib/finance-toolkit/insights.ts.
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  LineChart,
  ListChecks,
  MessageCircle,
  Scale,
  Search,
  ShieldCheck,
  Table2,
  Trophy,
} from "lucide-react";
import { Card } from "../ui/card";
import { PLUS } from "../dashboard/charts/colors";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "../ui/chart";
import {
  FLAG_MIN_HOURS,
  MODEL,
  OVER_SERVICED_RATIO,
  REVENUE_WINDOW,
  monthLabel,
  periodLabel,
  profitability,
  profitabilityTrend,
  type ProfitRow,
  type Scope,
} from "../../lib/finance-toolkit/model";
import {
  groupByReason,
  previousPeriod,
  REASONS,
  reviewReason,
  type ReasonDef,
  type ReasonGroup,
  type ReasonId,
} from "../../lib/finance-toolkit/insights";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import {
  COVERAGE_NOTE_BELOW,
  COVERAGE_WARN_BELOW,
  Chip,
  DataTable,
  Disclosure,
  Formula,
  HowCalculated,
  MonthRange,
  Notice,
  Segmented,
  type Column,
} from "./ft-ui";
import { sheetMatrix, formatCompactMoney, hours, money, pct, rate } from "./ft-format";
import SheetExportButton from "../dashboard/sheet-export-button";
import ClientDetailDrawer from "./client-detail-drawer";

const REV_MONTHS = MODEL.revenueMonthIndices;
const R0 = REVENUE_WINDOW.from;

type Preset = "ytd" | "q1" | "q2" | "q3" | "custom";
const PRESETS: { id: Preset; label: string; range?: [number, number] }[] = [
  { id: "ytd", label: REVENUE_WINDOW.label, range: [R0, REVENUE_WINDOW.to] },
  { id: "q1", label: "Q1", range: [R0, R0 + 2] },
  { id: "q2", label: "Q2", range: [R0 + 3, R0 + 5] },
  { id: "q3", label: "Jul – Aug", range: [R0 + 6, REVENUE_WINDOW.to] },
  { id: "custom", label: "Custom" },
];

type View = "all" | "flagged" | "unmatched";

const dataStartOf = (agencyId: string) => MODEL.agencyDataStart[agencyId] ?? 0;
const reasonDef = (id: ReasonId | null): ReasonDef | null => (id ? (REASONS.find((r) => r.id === id) ?? null) : null);

/** Short chip label + tone per reason (table, drawer). */
const REASON_CHIP: Record<ReasonId, { label: string; tone: "loss" | "over" | "neutral" }> = {
  "time-over-fee": { label: "Time > fee", tone: "loss" },
  "little-billed": { label: "Little billed", tone: "loss" },
  new: { label: "New account", tone: "neutral" },
  cause: { label: "Foundation / charity", tone: "neutral" },
  "low-return": { label: "Low return per hour", tone: "over" },
};

const trendConfig: ChartConfig = {
  cost: { label: "Team cost", color: PLUS.purple },
  kept: { label: "Margin after team cost", color: PLUS.green },
};

/** Compact money for a bar label; blank for small values that would not fit. */
const compactLabel = (v: unknown) => (typeof v === "number" && v >= 50_000 ? formatCompactMoney(v) : "");

/** "−$261K" for a negative amount (formatCompactMoney takes the absolute value). */
const negCompact = (v: number) => `−${formatCompactMoney(Math.abs(v))}`;

const scatterConfig: ChartConfig = {
  ok: { label: "Earns more than its team costs", color: PLUS.green },
  over: { label: "Low return per hour", color: PLUS.yellow },
  loss: { label: "Costs more than it earns", color: PLUS.red },
};

/** Power-of-ten axis label: 1000 → "$1K", 1e6 → "$1M". */
function logTick(v: number): string {
  if (v >= 1e6) return `$${v / 1e6}M`;
  if (v >= 1e3) return `$${v / 1e3}K`;
  return `$${v}`;
}

/** Bubble label: the first words of the account name, kept short. */
const shortName = (name: string) => (name.length > 18 ? `${name.slice(0, 16).trimEnd()}…` : name);

function StatusChip({ row, to }: { row: ProfitRow; to: number }) {
  if (row.status === "no-revenue")
    return (
      <Chip tone="neutral" title="Hours booked to this account but no gross revenue line">
        No revenue match
      </Chip>
    );
  if (row.status === "no-hours")
    return (
      <Chip tone="neutral" title="Gross revenue with no hours in the same agency">
        No hours match
      </Chip>
    );
  if (row.flag === "credit")
    return (
      <Chip tone="neutral" title="Revenue nets to zero or below in this period (credit notes / reversals) — margin is not meaningful">
        Net credit
      </Chip>
    );
  const reason = reviewReason(row, to, dataStartOf(row.client.agencyId));
  if (!reason) return null;
  const c = REASON_CHIP[reason];
  return (
    <Chip tone={c.tone} title={reasonDef(reason)?.explain}>
      {c.label}
    </Chip>
  );
}

// ─── Small presentational pieces ─────────────────────────────────────────────

interface Delta {
  /** e.g. "+12%" or "+2.1 pts" */
  label: string;
  good: boolean;
}

function Tile({
  label,
  value,
  context,
  delta,
  vsLabel,
}: {
  label: string;
  value: string;
  context: React.ReactNode;
  delta?: Delta | null;
  vsLabel?: string;
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</span>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-semibold tabular-nums ${delta.good ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
            title={vsLabel ? `Compared with ${vsLabel}` : undefined}
          >
            {delta.good ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta.label}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-sm leading-snug text-gray-600">{context}</div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Trophy; title: string; subtitle?: React.ReactNode }) {
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

/** Top stripe colour per reason (explicit classes so Tailwind keeps them). */
const REASON_STRIPE: Record<ReasonId, string> = {
  "time-over-fee": "bg-red-500",
  "little-billed": "bg-red-500",
  new: "bg-blue-400",
  cause: "bg-gray-400",
  "low-return": "bg-yellow-400",
};

/** One reason group in "Needs review": a card with the why, then every account
 *  (open by default so leads read it at a glance; long groups show 6 first). */
function ReasonBlock({ group, onOpen }: { group: ReasonGroup; onOpen: (r: ProfitRow) => void }) {
  const [all, setAll] = useState(false);
  const LIMIT = 6;
  const shown = all ? group.rows : group.rows.slice(0, LIMIT);
  return (
    <div className="mb-4 flex break-inside-avoid flex-col border border-gray-200 bg-white p-4">
      <div className={`-mx-4 -mt-4 mb-3 h-1 ${REASON_STRIPE[group.id]}`} aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900">
          {group.title} <span className="font-normal text-gray-500">· {group.rows.length}</span>
        </h4>
        <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
          {group.margin < 0 ? money(group.margin) : `${money(group.margin)} kept`}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-gray-600">{group.explain}</p>
      <ul className="mt-2 divide-y divide-gray-100">
        {shown.map((r) => (
          <li key={r.client.index}>
            <button
              type="button"
              onClick={() => onOpen(r)}
              className="group flex w-full items-center justify-between gap-3 py-1.5 text-left hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900" title={r.client.name}>
                  {r.client.name}
                </span>
                <span className="block text-xs tabular-nums text-gray-500">
                  {money(r.revenue)} billed · {money(r.cost)} of team time · {hours(r.hours)} h
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-gray-900">
                {money(r.margin)}
                <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-900" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {group.rows.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 self-start text-xs font-semibold text-gray-500 hover:text-gray-900">
          {all ? "Show fewer" : `Show all ${group.rows.length}`}
        </button>
      )}
    </div>
  );
}

const signed = (good: boolean, text: string) => `${good ? "+" : "−"}${text}`;

// ─── The tab ─────────────────────────────────────────────────────────────────

export default function ProfitabilityTab({ scope, basis, clientFilter }: { scope: Scope; basis: CostBasis; clientFilter: Set<number> | null }) {
  const [preset, setPreset] = useState<Preset>("ytd");
  const [from, setFrom] = useState(R0);
  const [to, setTo] = useState(REVENUE_WINDOW.to);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const result = useMemo(() => profitability(scope, from, to, basis, clientFilter), [scope, from, to, basis, clientFilter]);
  const { totals } = result;
  const prevRange = previousPeriod(from, to, R0);
  const prevFrom = prevRange?.[0] ?? null;
  const prevTo = prevRange?.[1] ?? null;
  const prev = useMemo(
    () => (prevFrom !== null && prevTo !== null ? profitability(scope, prevFrom, prevTo, basis, clientFilter) : null),
    [scope, basis, prevFrom, prevTo, clientFilter],
  );

  const { matched, unmatched, flagged } = useMemo(() => {
    const m = result.rows.filter((r) => r.status === "matched");
    return {
      matched: m,
      unmatched: result.rows.filter((r) => r.status !== "matched"),
      // Needs review = loss-making or low return per hour; net-credit periods are labeled, not reviewed.
      flagged: m.filter((r) => r.flag === "loss" || r.flag === "over-serviced").sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)),
    };
  }, [result]);

  const groups = useMemo(() => groupByReason(flagged, to, dataStartOf), [flagged, to]);

  // Bubble chart: every account with both revenue and cost, on log scales (accounts range from $1K to $10M+).
  // Names are printed on the biggest shortfalls only (the large profitable accounts sit close together and their
  // names would overlap); hovering any bubble names it.
  const scatter = useMemo(() => {
    const byRevenue = [...matched].filter((r) => r.revenue! > 0 && r.cost! > 0).sort((a, b) => b.revenue! - a.revenue!);
    const named = new Set(
      byRevenue
        .filter((r) => r.margin! < 0)
        .sort((a, b) => a.margin! - b.margin!)
        .slice(0, 5)
        .map((r) => r.client.index),
    );
    const pts = byRevenue.map((r) => ({
      x: r.revenue!,
      y: r.cost!,
      z: r.hours,
      name: r.client.name,
      label: named.has(r.client.index) ? shortName(r.client.name) : "",
      flag: r.flag,
      margin: r.margin,
      marginPct: r.marginPct,
      row: r,
    }));
    const max = Math.max(1000, ...pts.map((p) => Math.max(p.x, p.y)));
    const min = Math.max(100, Math.min(...pts.map((p) => Math.min(p.x, p.y)), max));
    const lo = Math.floor(Math.log10(min));
    const hi = Math.ceil(Math.log10(max));
    return {
      ok: pts.filter((p) => p.flag !== "loss" && p.flag !== "over-serviced"),
      over: pts.filter((p) => p.flag === "over-serviced"),
      loss: pts.filter((p) => p.flag === "loss"),
      count: pts.length,
      above: pts.filter((p) => p.margin! < 0).length,
      domain: [Math.pow(10, lo), Math.pow(10, hi)] as [number, number],
      ticks: Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i)),
    };
  }, [matched]);
  const trend = useMemo(
    () =>
      profitabilityTrend(
        matched.map((r) => r.client.index),
        from,
        to,
        basis,
      ),
    [matched, from, to, basis],
  );
  const top = useMemo(
    () =>
      matched
        .filter((r) => (r.margin ?? 0) > 0)
        .sort((a, b) => b.margin! - a.margin!)
        .slice(0, 5),
    [matched],
  );

  // Headline counts: every matched account with positive revenue in the period.
  const priced = matched.filter((r) => r.marginPct !== null);
  const profitable = priced.filter((r) => r.margin! >= 0).length;
  const belowCost = priced.filter((r) => r.margin! < 0);
  const lossTotal = belowCost.reduce((a, r) => a + r.margin!, 0);
  const topShare = totals.margin > 0 && top.length > 0 ? top.reduce((a, r) => a + r.margin!, 0) / totals.margin : null;
  const flaggedLoss = flagged.reduce((a, r) => a + Math.min(0, r.margin!), 0);
  // When foundations / charities explain most of the loss, the headline says so (usually agreed cause work).
  const causeGroup = groups.find((g) => g.id === "cause");
  const causeLoss = causeGroup && causeGroup.margin < 0 && lossTotal < 0 && causeGroup.margin / lossTotal >= 0.5 ? causeGroup : null;

  // vs the previous, equally long period (only when it is inside the revenue window).
  const vsLabel = prevFrom !== null && prevTo !== null ? periodLabel(prevFrom, prevTo) : undefined;
  const deltas = (() => {
    if (!prev) return null;
    const p = prev.totals;
    const prevPriced = prev.rows.filter((r) => r.status === "matched" && r.marginPct !== null);
    const growth = (now: number, was: number): Delta => ({
      label: signed(now >= was, pct(Math.abs(now / was - 1), 0)),
      good: now >= was,
    });
    const points = (now: number, was: number, digits: number): Delta => ({
      label: signed(now >= was, `${(Math.abs(now - was) * 100).toFixed(digits)} pts`),
      good: now >= was,
    });
    return {
      revenue: p.revenue > 0 ? growth(totals.revenue, p.revenue) : null,
      margin: totals.marginPct !== null && p.marginPct !== null ? points(totals.marginPct, p.marginPct, 1) : null,
      profitable:
        prevPriced.length > 0 && priced.length > 0
          ? points(profitable / priced.length, prevPriced.filter((r) => r.margin! >= 0).length / prevPriced.length, 0)
          : null,
      rph: totals.revenuePerHour !== null && p.revenuePerHour ? growth(totals.revenuePerHour, p.revenuePerHour) : null,
    };
  })();

  // Best and weakest month (needs at least three months to be worth saying).
  const monthsWithPct = trend.filter((t) => t.marginPct !== null);
  const best = monthsWithPct.length >= 3 ? monthsWithPct.reduce((a, t) => (t.marginPct! > a.marginPct! ? t : a)) : null;
  const worst = monthsWithPct.length >= 3 ? monthsWithPct.reduce((a, t) => (t.marginPct! < a.marginPct! ? t : a)) : null;

  // The drawer follows the period / cost basis: keep the id, re-derive the row.
  const selected = selectedId === null ? null : (result.rows.find((r) => r.client.index === selectedId) ?? null);
  const setSelected = (r: ProfitRow | null) => setSelectedId(r ? r.client.index : null);
  const selectedReason = selected ? reasonDef(reviewReason(selected, to, dataStartOf(selected.client.agencyId))) : null;

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const range = PRESETS.find((x) => x.id === p)?.range;
    if (range) {
      setFrom(range[0]);
      setTo(range[1]);
    }
  };

  const who = clientFilter ? "For the selected accounts" : scope.id === "canada" ? "Across our Canadian agencies" : `At ${scope.label}`;
  const cur = scope.currency === "USD" ? " (USD)" : "";

  // ─── Full table (detail on demand) ─────────────────────────────────────────

  const q = query.trim().toLowerCase();
  const tableRows = (view === "flagged" ? flagged : view === "unmatched" ? unmatched : matched).filter(
    (r) => !q || r.client.name.toLowerCase().includes(q) || r.client.number.includes(q),
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
    {
      id: "revenue",
      label: "Gross revenue",
      align: "right",
      sort: (r) => r.revenue,
      render: (r) => money(r.revenue),
      total: view === "all" ? money(totals.matchedRevenue) : undefined,
    },
    {
      id: "cost",
      label: "Staffing cost",
      align: "right",
      sort: (r) => r.cost,
      render: (r) => money(r.cost),
      total: view === "all" ? money(totals.matchedCost) : undefined,
    },
    {
      id: "margin",
      label: "Margin after team cost",
      align: "right",
      sort: (r) => r.margin,
      render: (r) =>
        r.margin === null ? (
          <StatusChip row={r} to={to} />
        ) : (
          <span className={r.margin < 0 ? "font-semibold text-red-700" : ""}>{money(r.margin)}</span>
        ),
      total: view === "all" ? money(totals.margin) : undefined,
    },
    {
      id: "marginPct",
      label: "Margin %",
      align: "right",
      sort: (r) => r.marginPct,
      render: (r) => pct(r.marginPct),
      total: view === "all" ? pct(totals.marginPct) : undefined,
    },
    {
      id: "costPct",
      label: "Cost % of revenue",
      align: "right",
      sort: (r) => r.costPctRevenue,
      render: (r) => pct(r.costPctRevenue),
      total: view === "all" ? pct(totals.costPctRevenue) : undefined,
    },
    {
      id: "rph",
      label: "Revenue / hour",
      align: "right",
      sort: (r) => r.revenuePerHour,
      render: (r) => rate(r.revenuePerHour),
      total: view === "all" ? rate(totals.revenuePerHour) : undefined,
    },
    {
      id: "hours",
      label: "Hours",
      align: "right",
      sort: (r) => r.hours,
      render: (r) => hours(r.hours),
      total: view === "all" ? hours(totals.matchedHours) : undefined,
    },
    {
      id: "people",
      label: "People",
      align: "right",
      sort: (r) => r.people,
      render: (r) => r.people || "—",
      total: view === "all" ? String(totals.people) : undefined,
      headerTitle: "Distinct employees who logged client hours in the period",
    },
    {
      id: "flag",
      label: "Note",
      sort: (r) => (r.flag === "loss" ? 3 : r.flag === "over-serviced" ? 2 : r.flag ? 1 : 0),
      render: (r) => (r.margin === null ? null : <StatusChip row={r} to={to} />),
    },
  ];

  const buildSheet = () =>
    sheetMatrix(
      [
        "Account",
        "Agency",
        "Client #",
        "Status",
        `Gross revenue (${scope.currency})`,
        `Staffing cost (${scope.currency}, ${basis === "base1" ? "Base1" : "Enterprise"})`,
        "Margin after team cost",
        "Margin %",
        "Revenue per hour",
        "Client hours",
        "People",
        "Cost % of revenue",
        "Needs review",
        "Hours with cost on file",
      ],
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
        reasonDef(reviewReason(r, to, dataStartOf(r.client.agencyId)))?.title ?? "",
        r.costCoverage,
      ]),
    );

  const trendData = trend.map((t) => ({
    month: monthLabel(t.month, true),
    cost: Math.round(t.cost),
    kept: Math.max(0, Math.round(t.margin)),
    margin: Math.round(t.margin),
    revenue: Math.round(t.revenue),
    marginPct: t.marginPct === null ? null : Math.round(t.marginPct * 1000) / 10,
    // Margin label sits on top of the green segment, or on the purple one in a month with nothing kept.
    pctOnKept: t.marginPct !== null && t.margin > 0 ? Math.round(t.marginPct * 100) : null,
    pctOnCost: t.marginPct !== null && t.margin <= 0 ? Math.round(t.marginPct * 100) : null,
  }));

  const coverageMissing = totals.costCoverage !== null ? 1 - totals.costCoverage : 0;

  return (
    <div className="space-y-5">
      {/* 1 · The answer */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="plus-pattern h-1" aria-hidden />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {periodLabel(from, to)} · {scope.label} · {scope.currency}
            </div>
            {totals.marginPct === null ? (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900">No account has both revenue and timesheets in this period.</h2>
            ) : totals.marginPct >= 0 ? (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900 md:text-[28px]">
                {who}, we kept <span className="bg-yellow-400 px-1">{pct(totals.marginPct, 0)}</span> of revenue after paying for our teams’ time.
              </h2>
            ) : (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900 md:text-[28px]">
                {who}, staffing cost was higher than revenue by{" "}
                <span className="bg-red-500 px-1 text-white">{formatCompactMoney(-totals.margin)}</span>.
              </h2>
            )}
            <p className="mt-2 text-sm text-gray-500">
              This is before overhead: rent, management, tools and time not spent on clients are not included, so it is higher than company profit.
            </p>
            {priced.length > 0 && (
              <p className="mt-3 text-base leading-relaxed text-gray-700">
                <strong className="text-gray-900">{profitable}</strong> of {priced.length} accounts earn more than their team costs.
                {belowCost.length > 0 ? (
                  <>
                    {" "}
                    The {belowCost.length} below cost add up to <strong className="text-gray-900">{negCompact(lossTotal)}</strong>
                    {totals.margin > 0 ? (
                      <>
                        , {pct(-lossTotal / totals.margin, 1)} of the {formatCompactMoney(totals.margin)} we kept
                      </>
                    ) : null}
                    .
                    {causeLoss !== null && (
                      <>
                        {" "}
                        Most of it ({negCompact(causeLoss.margin)}) is on{" "}
                        {causeLoss.rows.length === 1 ? "one foundation or charity" : `${causeLoss.rows.length} foundations and charities`}, likely
                        cause work.
                      </>
                    )}
                  </>
                ) : (
                  " None costs more to staff than it brings in."
                )}
                {topShare !== null && top.length === 5 && (
                  <>
                    {" "}
                    Our five largest contributors deliver <strong className="text-gray-900">{pct(topShare, 0)}</strong> of that margin.
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Period</span>
            <Segmented options={PRESETS} value={preset} onChange={choosePreset} ariaLabel="Period" />
            {preset === "custom" && <MonthRange months={REV_MONTHS} from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />}
            {vsLabel && <span className="text-xs text-gray-500">Arrows compare with {vsLabel}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-6 py-2.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-green-500" /> Revenue ties to Finance’s gross revenue reports
          </span>
          {totals.revenue > 0 && <span>{pct(totals.matchedRevenue / totals.revenue, 0)} of revenue is tied to timesheets</span>}
          {coverageMissing > 1 - COVERAGE_NOTE_BELOW && coverageMissing <= 1 - COVERAGE_WARN_BELOW && (
            <span>{pct(coverageMissing)} of hours have no cost rate on file, so margins are slightly generous</span>
          )}
        </div>
      </Card>

      {totals.costCoverage !== null && totals.costCoverage < COVERAGE_WARN_BELOW && (
        <Notice tone="warn">
          <p>
            <strong>{pct(coverageMissing)} of client hours here have no cost rate on file in Maconomy</strong>, so staffing cost is understated and
            margins look better than they are. Confirm cost rates with Finance before relying on these margins.
          </p>
        </Notice>
      )}

      {/* 2 · Headline tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label={`Gross revenue${cur}`}
          value={formatCompactMoney(totals.revenue)}
          context="as booked in Finance’s gross revenue reports"
          delta={deltas?.revenue}
          vsLabel={vsLabel}
        />
        <Tile
          label="Team cost"
          value={formatCompactMoney(totals.matchedCost)}
          context={
            <>
              <strong className="text-gray-900">{pct(totals.costPctRevenue, 0)}</strong> of revenue · {hours(totals.matchedHours)} h of client work
            </>
          }
        />
        <Tile
          label="Margin after team cost"
          value={totals.margin < 0 ? negCompact(totals.margin) : formatCompactMoney(totals.margin)}
          context={
            <>
              <strong className="text-gray-900">{pct(totals.marginPct)}</strong> margin, after {formatCompactMoney(totals.matchedCost)} of team time
            </>
          }
          delta={deltas?.margin}
          vsLabel={vsLabel}
        />
        <Tile
          label="Accounts that pay their way"
          value={priced.length ? `${profitable} of ${priced.length}` : "—"}
          context={priced.length ? `${pct(profitable / priced.length, 0)} earn more than their team costs` : "No accounts with revenue"}
          delta={deltas?.profitable}
          vsLabel={vsLabel}
        />
        <Tile
          label="Revenue per hour worked"
          value={rate(totals.revenuePerHour)}
          context={<>vs {rate(totals.costPerHour)} an hour of team time costs us</>}
          delta={deltas?.rph}
          vsLabel={vsLabel}
        />
      </div>

      {/* 3 · Every account against break-even, next to the accounts that need review */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="gap-0 p-5 xl:col-span-2">
          <SectionTitle
            icon={Scale}
            title="Every account: revenue vs team cost"
            subtitle={
              scatter.count > 0
                ? `Each bubble is an account (bigger = more hours). Below the red line it earns more than its team costs; above it, it costs more. ${scatter.count - scatter.above} of ${scatter.count} are below the line.`
                : "Each bubble is an account (bigger = more hours). Below the red line it earns more than its team costs."
            }
          />
          {scatter.count === 0 ? (
            <p className="py-16 text-center text-sm text-gray-500">No accounts with both revenue and hours in this period.</p>
          ) : (
            <ChartContainer config={scatterConfig} className="aspect-auto w-full" style={{ height: 380 }}>
              <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Revenue"
                  scale="log"
                  domain={scatter.domain}
                  ticks={scatter.ticks}
                  allowDataOverflow
                  tickFormatter={(v) => logTick(Number(v))}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  height={40}
                  label={{ value: "Gross revenue →", position: "insideBottom", offset: -4, fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Team cost"
                  scale="log"
                  domain={scatter.domain}
                  ticks={scatter.ticks}
                  allowDataOverflow
                  tickFormatter={(v) => logTick(Number(v))}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  label={{ value: "Team cost →", angle: -90, position: "insideLeft", offset: 6, fontSize: 12 }}
                />
                <ZAxis type="number" dataKey="z" range={[30, 600]} />
                <ReferenceLine
                  segment={[
                    { x: scatter.domain[0], y: scatter.domain[0] },
                    { x: scatter.domain[1], y: scatter.domain[1] },
                  ]}
                  stroke={PLUS.red}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  ifOverflow="hidden"
                  label={{ value: "Break-even: cost = revenue", position: "insideTopLeft", fontSize: 12, fontWeight: 700, fill: PLUS.red }}
                />
                <ReferenceLine
                  segment={[
                    { x: scatter.domain[0], y: scatter.domain[0] * 0.5 },
                    { x: scatter.domain[1], y: scatter.domain[1] * 0.5 },
                  ]}
                  stroke="#94a3b8"
                  strokeDasharray="2 4"
                  ifOverflow="hidden"
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = active && payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="border border-gray-200 bg-white px-3 py-2 text-xs shadow-xl">
                        <div className="mb-1 max-w-[260px] truncate font-semibold text-gray-900">{p.name}</div>
                        <div className="tabular-nums text-gray-600">Revenue {money(p.x)}</div>
                        <div className="tabular-nums text-gray-600">Team cost {money(p.y)}</div>
                        <div className={`font-semibold tabular-nums ${p.margin < 0 ? "text-red-700" : "text-gray-900"}`}>
                          Kept {money(p.margin)} · {pct(p.marginPct)}
                        </div>
                        <div className="tabular-nums text-gray-500">{hours(p.z)} h · click for detail</div>
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
                    fillOpacity={0.8}
                    stroke={k === "over" ? "#b38600" : "#ffffff"}
                    strokeWidth={1}
                    isAnimationActive={false}
                    onClick={(d: { payload?: { row: ProfitRow } }) => d?.payload?.row && setSelected(d.payload.row)}
                    className="cursor-pointer"
                  >
                    <LabelList dataKey="label" position="right" fill="#111827" fontSize={11} fontWeight={600} />
                  </Scatter>
                ))}
              </ScatterChart>
            </ChartContainer>
          )}
          {scatter.count > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-600">
              {(["ok", "over", "loss"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: scatterConfig[k].color }} aria-hidden />
                  {scatterConfig[k].label as string}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 border-t-2 border-dashed border-red-500" aria-hidden />
                Break-even
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 border-t-2 border-dotted border-gray-400" aria-hidden />
                50% margin
              </span>
              <span className="text-gray-500">Names shown on the biggest shortfalls · hover any bubble for its name</span>
            </div>
          )}
        </Card>

        <Card className="gap-0 p-5">
          <SectionTitle
            icon={ListChecks}
            title="Needs review"
            subtitle={
              flagged.length === 0
                ? "Every account with real activity earns more than it costs"
                : `${flagged.length} account${flagged.length === 1 ? "" : "s"}, biggest shortfall first${
                    flaggedLoss < 0 ? ` · ${negCompact(flaggedLoss)} in total` : ""
                  }`
            }
          />
          {flagged.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Nothing to review in this period.</p>
          ) : (
            <ul className="-mx-2 max-h-[380px] divide-y divide-gray-100 overflow-y-auto">
              {flagged.map((r) => (
                <li key={r.client.index}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900" title={r.client.name}>
                        {r.client.name}
                      </span>
                      <span className="block text-xs tabular-nums text-gray-500">
                        {money(r.revenue)} billed · {hours(r.hours)} h
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <StatusChip row={r} to={to} />
                      <span className={`mt-0.5 block text-sm font-semibold tabular-nums ${r.margin! < 0 ? "text-red-700" : "text-gray-700"}`}>
                        {money(r.margin)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4 · Why they need review — every group open, side by side */}
      <Card className="gap-0 p-5">
        <SectionTitle
          icon={MessageCircle}
          title="Why they need review"
          subtitle={
            flagged.length === 0
              ? "Every account with real activity earns more than it costs"
              : `${flagged.length} account${flagged.length === 1 ? "" : "s"}, the same accounts grouped by the likely reason, biggest impact first${
                  flaggedLoss < 0 && totals.margin > 0
                    ? ` · ${negCompact(flaggedLoss)} in total, ${pct(-flaggedLoss / totals.margin, 1)} of what we kept`
                    : ""
                }`
          }
        />
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">Nothing to review in this period.</p>
        ) : (
          <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
            {groups.map((g) => (
              <ReasonBlock key={g.id} group={g} onOpen={setSelected} />
            ))}
          </div>
        )}
      </Card>

      {/* 5 · Trend + where the margin comes from */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="gap-0 p-5 xl:col-span-2">
          <SectionTitle
            icon={LineChart}
            title="Month by month"
            subtitle={
              best && worst ? (
                <>
                  Each bar is the month’s revenue: team cost (purple) and what we kept (green); the label on top is the margin. Best month{" "}
                  {monthLabel(best.month)} ({pct(best.marginPct, 0)}) · weakest {monthLabel(worst.month)} ({pct(worst.marginPct, 0)})
                </>
              ) : (
                "Each bar is the month’s revenue: team cost (purple) and what we kept (green); the label on top is the margin"
              )
            }
          />
          <ChartContainer config={trendConfig} className="aspect-auto w-full" style={{ height: 300 }}>
            <BarChart data={trendData} margin={{ top: 24, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatCompactMoney(Number(v))} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12 }} />
              <ChartTooltip
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload;
                  if (!p) return null;
                  return (
                    <div className="border border-gray-200 bg-white px-3 py-2 text-xs shadow-xl">
                      <div className="mb-1 font-semibold text-gray-900">{p.month}</div>
                      <div className="tabular-nums text-gray-600">Revenue {money(p.revenue)}</div>
                      <div className="tabular-nums text-gray-600">Team cost {money(p.cost)}</div>
                      <div className="font-semibold tabular-nums text-gray-900">
                        Kept {money(p.margin)}
                        {p.marginPct !== null ? ` · ${p.marginPct.toFixed(1)}%` : ""}
                      </div>
                    </div>
                  );
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="cost" stackId="rev" fill="var(--color-cost)" maxBarSize={72} isAnimationActive={false}>
                <LabelList dataKey="cost" position="center" fill="#ffffff" fontSize={11} formatter={(v: unknown) => compactLabel(v)} />
                <LabelList
                  dataKey="pctOnCost"
                  position="top"
                  fill="#b91c1c"
                  fontSize={12}
                  fontWeight={700}
                  formatter={(v: unknown) => (typeof v === "number" ? `${v < 0 ? "−" : ""}${Math.abs(v)}%` : "")}
                />
              </Bar>
              <Bar dataKey="kept" stackId="rev" fill="var(--color-kept)" maxBarSize={72} isAnimationActive={false}>
                <LabelList dataKey="kept" position="center" fill="#ffffff" fontSize={11} formatter={(v: unknown) => compactLabel(v)} />
                <LabelList
                  dataKey="pctOnKept"
                  position="top"
                  fill="#111827"
                  fontSize={12}
                  fontWeight={700}
                  formatter={(v: unknown) => (typeof v === "number" ? `${v < 0 ? "−" : ""}${Math.abs(v)}%` : "")}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Card>

        <Card className="gap-0 p-5">
          <SectionTitle
            icon={Trophy}
            title="Where the margin comes from"
            subtitle={
              topShare !== null
                ? `These ${top.length} accounts deliver ${pct(topShare, 0)} of what we kept`
                : "Accounts that keep the most after team cost"
            }
          />
          {top.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No profitable account in this period.</p>
          ) : (
            <ol className="space-y-3">
              {top.map((r, i) => (
                <li key={r.client.index}>
                  <button type="button" onClick={() => setSelected(r)} className="group block w-full text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-4 shrink-0 text-sm font-bold text-gray-400">{i + 1}</span>
                        <span className="truncate text-sm font-semibold text-gray-900 group-hover:underline" title={r.client.name}>
                          {r.client.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                        {formatCompactMoney(r.margin!)} <span className="font-normal text-gray-500">· {pct(r.marginPct, 0)}</span>
                      </span>
                    </div>
                    <div className="ml-6 mt-1 h-2 bg-gray-100">
                      <div className="h-full bg-green-500" style={{ width: `${(r.margin! / top[0].margin!) * 100}%` }} />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-gray-500">Click any account for its month-by-month trend and team mix.</p>
        </Card>
      </div>

      {/* 6 · Detail on demand */}
      <Disclosure title="All accounts" subtitle={`${matched.length} accounts · search, sort and export to Google Sheets`} icon={Table2} defaultOpen>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            ariaLabel="Accounts shown"
            options={[
              { id: "all", label: `With revenue & hours (${matched.length})` },
              {
                id: "flagged",
                label: `Needs review (${flagged.length})`,
              },
              { id: "unmatched", label: `Unmatched (${unmatched.length})` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search account or #"
                className="w-56 border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </label>
            <SheetExportButton
              title={`Account profitability · ${scope.label} · ${periodLabel(from, to)}`}
              sheetTitle="Accounts"
              buildMatrix={buildSheet}
            />
          </div>
        </div>
        {view === "unmatched" && (
          <p className="mb-3 text-xs text-gray-600">
            <strong>No revenue match</strong>: client hours ({hours(totals.unmatchedHours)} h, {money(totals.unmatchedCost)}) on accounts with no
            gross revenue line in the same agency — often work for a client whose revenue is booked in another agency, or pitches.{" "}
            <strong>No hours match</strong>: {money(totals.revenueOnly)} of revenue with no hours in the same agency (incl. K72, which has no hours
            export). Neither is given a margin.
          </p>
        )}
        <DataTable
          key={view}
          columns={columns}
          rows={tableRows}
          rowKey={(r) => String(r.client.index)}
          defaultSort={{
            id: view === "unmatched" ? "hours" : view === "flagged" ? "margin" : "revenue",
            dir: view === "flagged" ? "asc" : "desc",
          }}
          onRowClick={setSelected}
          activeKey={selected ? String(selected.client.index) : null}
          footerLabel="Matched accounts"
          emptyText={q ? "No account matches your search." : "No accounts in this view."}
        />
      </Disclosure>

      <HowCalculated>
        <Formula
          name="Gross revenue"
          formula="Σ monthly gross revenue (Finance gross revenue report, job lines)"
          worked={`${money(totals.revenue)} in ${periodLabel(from, to)}, tying to the reports${
            totals.houseRevenue ? `; includes ${money(totals.houseRevenue)} booked to agency house accounts` : ""
          }`}
        />
        <Formula
          name="Staffing cost"
          formula={`Σ Maconomy ${basis === "base1" ? "CostPriceReg_Base1" : "CostPriceReg_Enterprise"} on client-work hours`}
          worked={`${money(totals.matchedCost)} on ${hours(totals.matchedHours)} h → ${rate(totals.costPerHour)} per hour`}
        />
        <Formula
          name="Margin after team cost"
          formula="gross revenue − staffing cost (gross margin)"
          worked={`${money(totals.matchedRevenue)} − ${money(totals.matchedCost)} = ${money(totals.margin)}`}
        />
        <Formula
          name="Margin %"
          formula="Σ margin ÷ Σ revenue (portfolio math, not an average of %)"
          worked={`${money(totals.margin)} ÷ ${money(totals.matchedRevenue)} = ${pct(totals.marginPct)}`}
        />
        <Formula
          name="Revenue per hour"
          formula="Σ revenue ÷ Σ client hours"
          worked={`${money(totals.matchedRevenue)} ÷ ${hours(totals.matchedHours)} h = ${rate(totals.revenuePerHour)}`}
        />
        <Formula
          name="Compared with"
          formula="the equally long period just before (Q2 vs Q1, Jul–Aug vs May–Jun…), when it is inside the revenue window"
          worked={vsLabel ? `this view: ${vsLabel}` : "this view: no earlier period with revenue to compare with"}
        />
        <Formula
          name="Needs review"
          formula={`staffing cost > revenue, or revenue per hour < ${OVER_SERVICED_RATIO * 100}% of the average — with ≥ ${FLAG_MIN_HOURS} client hours in the period`}
          worked={`average this view: ${rate(totals.revenuePerHour)} per hour → threshold ${rate(
            totals.revenuePerHour === null ? null : totals.revenuePerHour * OVER_SERVICED_RATIO,
          )}`}
        />
        <Formula
          name="Likely reason (first that fits)"
          formula="Foundation / charity: the name says so · Low return per hour: profitable but under the threshold · New: first hours in the last 6 months of the period · Little billed: revenue < 20% of staffing cost · otherwise Time > fee"
        />
        <Formula name="Net credit" formula="revenue ≤ 0 in the period (credit notes / reversals): labeled, no margin %, not reviewed" />
        <div className="mt-3 space-y-1.5 text-xs text-gray-600">
          <p>
            <strong>What counts as client work:</strong> hours with a client work code booked to a real client. Time off (15xx codes), internal work
            (16xx codes) and everything on the agencies’ own house accounts are overhead — {hours(totals.overheadHours)} h /{" "}
            {money(totals.overheadCost)} in this view — and are not charged to any account.
          </p>
          <p>
            <strong>Matching:</strong> revenue lines are tied to hours by Maconomy client number within the same agency (one by exact normalized
            name). No fuzzy matching; unmatched accounts are listed under “Unmatched” in All accounts.
          </p>
          <p>
            <strong>Currency:</strong> each scope stays in its own currency ({scope.currency}); CAD and USD are never added together.
          </p>
        </div>
      </HowCalculated>

      {selected && (
        <ClientDetailDrawer
          row={selected}
          from={from}
          to={to}
          basis={basis}
          currency={scope.currency}
          reason={selectedReason}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
