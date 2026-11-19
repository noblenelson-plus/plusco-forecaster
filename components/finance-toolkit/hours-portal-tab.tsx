// filepath: components/finance-toolkit/hours-portal-tab.tsx
"use client";

/**
 * Finance Toolkit · Tab 1 — Hours Report Portal. "Where does our time go":
 * filter the aggregated Maconomy hours by client, role, time type and month,
 * group them any way, and download the view. Also the QA surface for the
 * other two tabs — its totals tie back to the source files.
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3, Clock, DollarSign, Receipt, RotateCcw, Users } from "lucide-react";
import StatCard from "../dashboard/charts/stat-card";
import ChartCard from "../dashboard/charts/chart-card";
import { PLUS } from "../dashboard/charts/colors";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart";
import {
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
import { COVERAGE_NOTE_BELOW, COVERAGE_WARN_BELOW, DataTable, Field, InShort, MonthRange, Notice, Segmented, type Column } from "./ft-ui";
import { sheetMatrix, formatCompactMoney, hours, money, pct, rate } from "./ft-format";
import SheetExportButton from "../dashboard/sheet-export-button";

const GROUPS: { id: PortalGroup; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "role", label: "Role" },
  { id: "month", label: "Month" },
  { id: "time", label: "Time type" },
  { id: "agency", label: "Agency" },
];

const ALL_MONTHS = MODEL.months.map((_, i) => i);
const LAST = MODEL.months.length - 1;

const chartConfig: ChartConfig = {
  client: { label: "Client work", color: PLUS.purple },
  internal: { label: "Internal & overhead", color: PLUS.blue },
  timeoff: { label: "Time off", color: PLUS.lightPink },
};

export default function HoursPortalTab({ scope, basis }: { scope: Scope; basis: CostBasis }) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(LAST);
  const [clientSel, setClientSel] = useState<string[]>([]);
  const [roleSel, setRoleSel] = useState<string[]>([]);
  const [timeSel, setTimeSel] = useState<string[]>([]);
  const [group, setGroup] = useState<PortalGroup>("client");

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
  const clientHours = result.monthly.reduce((a, m) => a + m.client, 0);
  const internalHours = result.monthly.reduce((a, m) => a + m.internal, 0);
  const timeOffHours = result.monthly.reduce((a, m) => a + m.timeoff, 0);
  // Whole-percent split that always adds up to 100% (largest remainder).
  const split = (() => {
    const parts = [clientHours, internalHours, timeOffHours].map((h) => (totals.hours ? (h / totals.hours) * 100 : 0));
    const floors = parts.map(Math.floor);
    let left = Math.round(parts.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
    [...parts.keys()].sort((a, b) => parts[b] - floors[b] - (parts[a] - floors[a])).forEach((i) => left-- > 0 && floors[i]++);
    return floors;
  })();
  const filtered = validClients.length + roleSel.length + timeSel.length > 0 || from !== 0 || to !== LAST;

  const chartData = result.monthly.map((m) => ({
    month: monthLabel(m.month, true),
    client: Math.round(m.client),
    internal: Math.round(m.internal),
    timeoff: Math.round(m.timeoff),
  }));

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
    {
      id: "hours",
      label: "Hours",
      align: "right",
      sort: (r) => r.hours,
      render: (r) => hours(r.hours),
      total: hours(totals.hours),
    },
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

  const reset = () => {
    setFrom(0);
    setTo(LAST);
    setClientSel([]);
    setRoleSel([]);
    setTimeSel([]);
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border border-gray-200 bg-white px-5 py-4">
        <Field label="Period">
          <MonthRange months={ALL_MONTHS} from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
        </Field>
        <Field label="Filters">
          <div className="flex flex-wrap gap-2">
            <MultiSelectDropdown label="Clients" options={clientOptions} selectedValues={validClients} onChange={setClientSel} searchable />
            <MultiSelectDropdown label="Roles" options={roleOptions} selectedValues={roleSel} onChange={setRoleSel} searchable />
            <MultiSelectDropdown label="Time type" options={timeOptions} selectedValues={timeSel} onChange={setTimeSel} />
          </div>
        </Field>
        <Field label="Group by">
          <Segmented options={GROUPS} value={group} onChange={setGroup} ariaLabel="Group by" />
        </Field>
        {filtered && (
          <button
            type="button"
            onClick={reset}
            className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {totals.hours > 0 && (
        <InShort>
          In {periodLabel(from, to)}, {scope.id === "canada" ? "our Canadian agencies" : scope.label}
          {validClients.length + roleSel.length + timeSel.length > 0 ? " (with your filters)" : ""} logged{" "}
          <strong>{hours(totals.hours)} hours</strong>: <strong>{split[0]}% on client work</strong>, {split[1]}% on internal and overhead work and{" "}
          {split[2]}% on time off. That time cost {formatCompactMoney(totals.cost)} at Maconomy cost rates, about {rate(totals.costPerHour)} an hour.
        </InShort>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Hours logged"
          value={hours(totals.hours)}
          sub={`${pct(totals.hours ? clientHours / totals.hours : null)} on client work · ${periodLabel(from, to)}`}
        />
        <StatCard
          icon={DollarSign}
          label={`Staffing cost (${scope.currency})`}
          value={formatCompactMoney(totals.cost)}
          sub={`${rate(totals.costPerHour)} per hour · ${basis === "base1" ? "Standard (Base1)" : "Enterprise"} cost rates`}
        />
        <StatCard
          icon={Users}
          label="People on client work"
          value={result.people === null ? "—" : String(result.people)}
          sub={result.people === null ? "Not available with a role or time-type filter" : "Distinct employees who logged client hours"}
        />
        <StatCard
          icon={Receipt}
          label="Billed value at rate card"
          value={formatCompactMoney(totals.billed)}
          sub="Hours × Maconomy billing rate, where one is set"
        />
      </div>

      {totals.costCoverage !== null && totals.costCoverage < COVERAGE_NOTE_BELOW && (
        <Notice tone={totals.costCoverage < COVERAGE_WARN_BELOW ? "warn" : "info"}>
          <p>
            <strong>{pct(1 - totals.costCoverage)} of these hours carry no cost in Maconomy</strong> (employees without a cost rate on file), so
            staffing cost is understated by about that much for this selection.
          </p>
        </Notice>
      )}

      <ChartCard
        title="Hours by month"
        subtitle={`Client work vs internal time and time off${from < MODEL.firstFullMonth ? ` · ${monthLabel(0)} is nearly empty in the Maconomy export` : ""}`}
        icon={BarChart3}
      >
        <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: 240 }}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} />
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
              <Bar key={k} dataKey={k} stackId="h" fill={`var(--color-${k})`} isAnimationActive={false} />
            ))}
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title={`Hours by ${groupLabel.toLowerCase()}`}
        subtitle={`${result.rows.length} ${result.rows.length === 1 ? "row" : "rows"} · ${scope.label} · ${periodLabel(from, to)}`}
        icon={Clock}
        action={
          <SheetExportButton
            title={`Hours by ${groupLabel.toLowerCase()} · ${scope.label} · ${periodLabel(from, to)}`}
            sheetTitle="Hours"
            buildMatrix={buildSheet}
            disabled={result.rows.length === 0}
          />
        }
      >
        <DataTable columns={columns} rows={result.rows} rowKey={(r) => r.key} defaultSort={group === "month" ? null : { id: "hours", dir: "desc" }} />
        <p className="mt-3 text-[11px] text-gray-500">
          Totals are sums of the filtered entries; cost per hour = total cost ÷ total hours. “Internal &amp; overhead” covers 16xx work codes and
          everything booked to the agencies’ own house accounts; “Time off” is the 15xx codes (vacation, holidays, sick leave).
        </p>
      </ChartCard>
    </div>
  );
}
