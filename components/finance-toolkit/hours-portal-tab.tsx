// filepath: components/finance-toolkit/hours-portal-tab.tsx
"use client";

/**
 * Finance Toolkit · Team Time — "How much of our people's time goes to
 * clients, and where does the rest go?"
 *
 *   1. the answer in one sentence (client work share of all hours logged)
 *   2. three tiles: client work share, client time as full-time people, time
 *      not spent on clients
 *   3. where the time went month by month (client / internal / time off)
 *   4. client time by role: the roles with the most hours and how much of their
 *      time goes to clients
 *   5. folded away: "Explore the raw hours" — Finance's filterable view of the
 *      Maconomy hours (clients, roles, time type, any grouping) with the Sheets
 *      export; its totals tie back to the source files
 *
 * The period applies to the whole tab; the filters only to the explorer.
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3, Search, ShieldCheck, Users } from "lucide-react";
import { Card } from "../ui/card";
import { PLUS } from "../dashboard/charts/colors";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart";
import {
  FTE_HOURS_PER_MONTH,
  MODEL,
  TIME_TYPES,
  inScope,
  monthLabel,
  periodLabel,
  portal,
  type PortalGroup,
  type PortalRow,
  type Scope,
  type TimeType,
} from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { COVERAGE_WARN_BELOW, DataTable, Disclosure, Field, MonthRange, Notice, Segmented, type Column } from "./ft-ui";
import { sheetMatrix, formatCompactMoney, hours, money, pct, rate } from "./ft-format";
import SheetExportButton from "../dashboard/sheet-export-button";

const GROUPS: { id: PortalGroup; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "role", label: "Role" },
  { id: "month", label: "Month" },
  { id: "time", label: "Time type" },
  { id: "agency", label: "Agency" },
];

const LAST = MODEL.months.length - 1;
/** Months from the first populated export month (Jan 2025 is near-empty). */
const PICKABLE_MONTHS = MODEL.months.map((_, i) => i).filter((i) => i >= MODEL.firstFullMonth);
const YEAR_START = (y: string) => MODEL.months.findIndex((m) => m.startsWith(y));
const LAST_YEAR = MODEL.months[LAST].slice(0, 4);
const PREV_YEAR = String(Number(LAST_YEAR) - 1);

type Preset = "last12" | "ytd" | "prev" | "custom";
const PRESETS: { id: Preset; label: string; range?: [number, number] }[] = [
  { id: "last12", label: "Last 12 months", range: [Math.max(MODEL.firstFullMonth, LAST - 11), LAST] },
  { id: "ytd", label: `${LAST_YEAR} so far`, range: [YEAR_START(LAST_YEAR), LAST] },
  ...(YEAR_START(PREV_YEAR) >= 0
    ? [{ id: "prev" as const, label: PREV_YEAR, range: [Math.max(MODEL.firstFullMonth, YEAR_START(PREV_YEAR)), YEAR_START(LAST_YEAR) - 1] as [number, number] }]
    : []),
  { id: "custom", label: "Custom" },
];

const chartConfig: ChartConfig = {
  client: { label: "Client work", color: PLUS.purple },
  internal: { label: "Internal & overhead", color: PLUS.blue },
  timeoff: { label: "Time off", color: PLUS.lightPink },
};

const ALL_TIMES = new Set<TimeType>(TIME_TYPES.map((t) => t.id));

/** Whole-percent split that always adds up to 100% (largest remainder). */
function split100(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  const parts = values.map((h) => (total ? (h / total) * 100 : 0));
  const floors = parts.map(Math.floor);
  let left = Math.round(parts.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  [...parts.keys()].sort((a, b) => parts[b] - floors[b] - (parts[a] - floors[a])).forEach((i) => left-- > 0 && floors[i]++);
  return floors;
}

function Tile({ label, value, context }: { label: string; value: string; context: React.ReactNode }) {
  return (
    <Card className="gap-0 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</div>
      <div className="mt-1.5 text-sm leading-snug text-gray-600">{context}</div>
    </Card>
  );
}

const ROLES_SHOWN = 12;

export default function HoursPortalTab({ scope, basis }: { scope: Scope; basis: CostBasis }) {
  const [preset, setPreset] = useState<Preset>("last12");
  const [from, setFrom] = useState(PRESETS[0].range![0]);
  const [to, setTo] = useState(PRESETS[0].range![1]);
  const [clientSel, setClientSel] = useState<string[]>([]);
  const [roleSel, setRoleSel] = useState<string[]>([]);
  const [timeSel, setTimeSel] = useState<string[]>([]);
  const [group, setGroup] = useState<PortalGroup>("client");
  const [allRoles, setAllRoles] = useState(false);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const range = PRESETS.find((x) => x.id === p)?.range;
    if (range) {
      setFrom(range[0]);
      setTo(range[1]);
    }
  };

  // ─── Overview (period + agency only) ───────────────────────────────────────

  const base = { scope, clients: null, roles: null, from, to };
  const overview = useMemo(() => portal({ ...base, times: ALL_TIMES }, "role", basis), [scope, from, to, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const clientByRole = useMemo(() => portal({ ...base, times: new Set<TimeType>(["client"]) }, "role", basis), [scope, from, to, basis]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientHours = overview.monthly.reduce((a, m) => a + m.client, 0);
  const internalHours = overview.monthly.reduce((a, m) => a + m.internal, 0);
  const timeOffHours = overview.monthly.reduce((a, m) => a + m.timeoff, 0);
  const [clientPct, internalPct, timeOffPct] = split100([clientHours, internalHours, timeOffHours]);
  const months = to - from + 1;
  const clientFte = clientHours / months / FTE_HOURS_PER_MONTH;

  const roles = useMemo(() => {
    const clientMap = new Map(clientByRole.rows.map((r) => [r.key, r.hours]));
    return overview.rows
      .map((r) => ({ key: r.key, label: r.label, hours: r.hours, client: clientMap.get(r.key) ?? 0 }))
      .filter((r) => r.hours > 0)
      .sort((a, b) => b.hours - a.hours);
  }, [overview, clientByRole]);
  const shownRoles = allRoles ? roles : roles.slice(0, ROLES_SHOWN);
  const maxRoleHours = roles[0]?.hours ?? 0;

  const chartData = overview.monthly.map((m) => ({
    month: monthLabel(m.month, true),
    client: Math.round(m.client),
    internal: Math.round(m.internal),
    timeoff: Math.round(m.timeoff),
  }));
  const monthlyShare = overview.monthly.filter((m) => m.client + m.internal + m.timeoff > 0).map((m) => ({ m, share: m.client / (m.client + m.internal + m.timeoff) }));
  const best = monthlyShare.length >= 3 ? monthlyShare.reduce((a, x) => (x.share > a.share ? x : a)) : null;
  const worst = monthlyShare.length >= 3 ? monthlyShare.reduce((a, x) => (x.share < a.share ? x : a)) : null;

  const who = scope.id === "canada" ? "our Canadian agencies" : scope.label;

  // ─── Explorer (filters) ────────────────────────────────────────────────────

  const clientOptions = useMemo(
    () =>
      MODEL.clients
        .filter((c) => inScope(scope, c) && c.match !== "revenue-only")
        .map((c) => ({ value: String(c.index), label: `${c.name}${scope.agencyIds.length > 1 ? ` · ${c.agencyName}` : ""}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [scope],
  );
  const roleOptions = useMemo(() => MODEL.roles.map((r, i) => ({ value: String(i), label: r })).sort((a, b) => a.label.localeCompare(b.label)), []);
  const timeOptions = TIME_TYPES.map((t) => ({ value: t.id, label: t.label }));
  // Drop client picks that left the scope.
  const validClients = useMemo(() => clientSel.filter((v) => clientOptions.some((o) => o.value === v)), [clientSel, clientOptions]);

  const result = useMemo(
    () =>
      portal(
        {
          scope,
          clients: validClients.length ? new Set(validClients.map(Number)) : null,
          roles: roleSel.length ? new Set(roleSel.map(Number)) : null,
          times: new Set<TimeType>(timeSel.length ? (timeSel as TimeType[]) : TIME_TYPES.map((t) => t.id)),
          from,
          to,
        },
        group,
        basis,
      ),
    [scope, validClients, roleSel, timeSel, from, to, group, basis],
  );
  const { totals } = result;
  const filtered = validClients.length + roleSel.length + timeSel.length > 0;

  const groupLabel = GROUPS.find((g) => g.id === group)!.label;
  const columns: Column<PortalRow>[] = [
    {
      id: "label",
      label: groupLabel,
      sort: group === "month" ? (r) => r.key : (r) => r.label,
      render: (r) => (
        <div className="max-w-[360px]">
          <div className="truncate font-medium text-gray-900" title={r.label}>
            {r.label}
          </div>
          {r.sublabel && <div className="text-[11px] text-gray-500">{r.sublabel}</div>}
        </div>
      ),
    },
    { id: "hours", label: "Hours", align: "right", sort: (r) => r.hours, render: (r) => hours(r.hours), total: hours(totals.hours) },
    {
      id: "share",
      label: "Share of hours",
      align: "right",
      sort: (r) => r.share,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 bg-gray-100">
            <div className="h-full bg-purple-600" style={{ width: `${Math.min(100, r.share * 100)}%` }} />
          </div>
          <span className="w-12 text-right">{pct(r.share)}</span>
        </div>
      ),
      total: "100.0%",
    },
    {
      id: "cost",
      label: `Staffing cost (${scope.currency})`,
      align: "right",
      sort: (r) => r.cost,
      render: (r) => money(r.cost),
      total: money(totals.cost),
    },
    {
      id: "cph",
      label: "Cost / hour",
      align: "right",
      sort: (r) => (r.hours ? r.cost / r.hours : null),
      render: (r) => rate(r.hours ? r.cost / r.hours : null),
      total: rate(totals.costPerHour),
    },
    {
      id: "billed",
      label: "Billed value",
      align: "right",
      headerTitle: "Time valued at Maconomy billing rates (0 where no billing rate is set)",
      sort: (r) => r.billed,
      render: (r) => money(r.billed),
      total: money(totals.billed),
    },
  ];

  const buildSheet = () =>
    sheetMatrix(
      [
        groupLabel,
        ...(group === "client" ? ["Agency · client #"] : []),
        "Hours",
        "Share of hours",
        `Staffing cost (${scope.currency}, ${basis === "base1" ? "Base1" : "Enterprise"})`,
        "Cost per hour",
        "Billed value",
      ],
      [
        ...result.rows.map((r) => [
          r.label,
          ...(group === "client" ? [r.sublabel ?? ""] : []),
          r.hours,
          r.share,
          r.cost,
          r.hours ? r.cost / r.hours : null,
          r.billed,
        ]),
        ["Total", ...(group === "client" ? [""] : []), totals.hours, 1, totals.cost, totals.costPerHour, totals.billed],
      ],
    );

  const coverage = overview.totals.costCoverage;

  return (
    <div className="space-y-5">
      {/* 1 · The answer */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="plus-pattern h-1" aria-hidden />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {periodLabel(from, to)} · {scope.label}
            </div>
            {overview.totals.hours === 0 ? (
              <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900">No hours logged in this period.</h2>
            ) : (
              <>
                <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900 md:text-[28px]">
                  <span className="bg-yellow-400 px-1">{clientPct}%</span> of our people’s time went to client work.
                </h2>
                <p className="mt-3 text-base leading-relaxed text-gray-700">
                  People at {who} logged <strong className="text-gray-900">{hours(overview.totals.hours)} hours</strong>. {internalPct}% went to
                  internal work and overhead (admin, training, new business, the agencies’ own accounts) and {timeOffPct}% was time off. Client work
                  equals about <strong className="text-gray-900">{Math.round(clientFte).toLocaleString("en-CA")} full-time people</strong>.
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Period</span>
            <Segmented options={PRESETS} value={preset} onChange={choosePreset} ariaLabel="Period" />
            {preset === "custom" && <MonthRange months={PICKABLE_MONTHS} from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-6 py-2.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-green-500" /> Every hour logged in Maconomy timesheets
          </span>
          <span>1 full-time person = {FTE_HOURS_PER_MONTH} client hours a month</span>
        </div>
      </Card>

      {coverage !== null && coverage < COVERAGE_WARN_BELOW && (
        <Notice tone="warn">
          <p>
            <strong>{pct(1 - coverage)} of these hours carry no cost in Maconomy</strong> (employees without a cost rate on file), so time costs on this
            tab are understated.
          </p>
        </Notice>
      )}

      {/* 2 · Tiles */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tile label="Time on client work" value={`${clientPct}%`} context={`${hours(clientHours)} hours on client accounts`} />
        <Tile
          label="Client work in people"
          value={Math.round(clientFte).toLocaleString("en-CA")}
          context={`full-time people’s worth of client hours each month`}
        />
        <Tile
          label="Time not on clients"
          value={`${internalPct + timeOffPct}%`}
          context={`${internalPct}% internal & overhead · ${timeOffPct}% time off`}
        />
      </div>

      {/* 3 · Month by month */}
      <Card className="gap-0 p-5">
        <div className="mb-4 flex items-start gap-2">
          <BarChart3 size={18} className="mt-0.5 shrink-0 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-gray-900">Where the time went, month by month</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {best && worst
                ? `Most client-focused month ${monthLabel(best.m.month)} (${pct(best.share, 0)}) · least ${monthLabel(worst.m.month)} (${pct(worst.share, 0)})`
                : "Hours logged each month, by type of work"}
            </p>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: 260 }}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K h`} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 12 }} />
            <ChartTooltip
              cursor={{ fillOpacity: 0.4 }}
              content={
                <ChartTooltipContent
                  formatter={(v, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{chartConfig[name as string]?.label}</span>
                      <span className="font-medium tabular-nums text-foreground">{hours(Number(v))} h</span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {(["client", "internal", "timeoff"] as const).map((k) => (
              <Bar key={k} dataKey={k} stackId="h" fill={`var(--color-${k})`} maxBarSize={56} isAnimationActive={false} />
            ))}
          </BarChart>
        </ChartContainer>
      </Card>

      {/* 4 · By role */}
      <Card className="gap-0 p-5">
        <div className="mb-4 flex items-start gap-2">
          <Users size={18} className="mt-0.5 shrink-0 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-gray-900">Client time by role</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              The roles that log the most hours, and how much of their time goes to clients.
            </p>
          </div>
        </div>
        {roles.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No hours in this period.</p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
              <span className="hidden text-xs text-gray-500 md:block">Role</span>
              <span className="hidden text-xs text-gray-500 md:block">Hours logged · purple = client work</span>
              <span className="text-right text-xs text-gray-500 md:col-auto">On clients</span>
              {shownRoles.map((r) => {
                const share = r.hours ? r.client / r.hours : 0;
                return (
                  <div key={r.key} className="contents">
                    <span className="truncate text-sm font-medium text-gray-900" title={r.label}>
                      {r.label}
                    </span>
                    <div className="hidden h-3 bg-gray-100 md:block" title={`${hours(r.client)} of ${hours(r.hours)} hours on clients`}>
                      <div className="flex h-full" style={{ width: `${(r.hours / maxRoleHours) * 100}%` }}>
                        <div className="h-full bg-purple-600" style={{ width: `${share * 100}%` }} />
                        <div className="h-full flex-1 bg-gray-300" />
                      </div>
                    </div>
                    <span className="text-right text-sm font-semibold tabular-nums text-gray-900">{pct(share, 0)}</span>
                  </div>
                );
              })}
            </div>
            {roles.length > ROLES_SHOWN && (
              <button type="button" onClick={() => setAllRoles((v) => !v)} className="mt-3 text-sm font-semibold text-gray-500 hover:text-gray-900">
                {allRoles ? "Show fewer roles" : `Show all ${roles.length} roles`}
              </button>
            )}
          </>
        )}
      </Card>

      {/* 5 · Explorer (Finance) */}
      <Disclosure title="Explore the raw hours" subtitle="Filter by client, role or type of work, group any way, export to Google Sheets" icon={Search}>
        <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3">
          <Field label="Filters">
            <div className="flex flex-wrap gap-2">
              <MultiSelectDropdown label="Clients" options={clientOptions} selectedValues={validClients} onChange={setClientSel} searchable />
              <MultiSelectDropdown label="Roles" options={roleOptions} selectedValues={roleSel} onChange={setRoleSel} searchable />
              <MultiSelectDropdown label="Time type" options={timeOptions} selectedValues={timeSel} onChange={setTimeSel} />
            </div>
          </Field>
          <Field label="Group by">
            <Segmented options={GROUPS} value={group} onChange={setGroup} ariaLabel="Group by" size="sm" />
          </Field>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setClientSel([]);
                setRoleSel([]);
                setTimeSel([]);
              }}
              className="mb-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto">
            <SheetExportButton
              title={`Hours by ${groupLabel.toLowerCase()} · ${scope.label} · ${periodLabel(from, to)}`}
              sheetTitle="Hours"
              buildMatrix={buildSheet}
              disabled={result.rows.length === 0}
            />
          </div>
        </div>
        <p className="mb-3 text-xs text-gray-600">
          {hours(totals.hours)} hours · {formatCompactMoney(totals.cost)} at Maconomy cost rates ({rate(totals.costPerHour)} an hour) ·{" "}
          {periodLabel(from, to)}
          {filtered ? " · with your filters" : ""}
          {result.people !== null ? ` · ${result.people} people on client work` : ""}
        </p>
        <DataTable columns={columns} rows={result.rows} rowKey={(r) => r.key} defaultSort={group === "month" ? null : { id: "hours", dir: "desc" }} />
        <p className="mt-3 text-[11px] text-gray-500">
          Totals are sums of the filtered entries; cost per hour = total cost ÷ total hours. “Internal &amp; overhead” covers 16xx work codes and
          everything booked to the agencies’ own house accounts; “Time off” is the 15xx codes (vacation, holidays, sick leave).
        </p>
      </Disclosure>
    </div>
  );
}
