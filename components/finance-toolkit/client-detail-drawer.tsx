// filepath: components/finance-toolkit/client-detail-drawer.tsx
"use client";

/**
 * Finance Toolkit · Account Profitability — side drawer for one account:
 * headline figures, the monthly revenue vs staffing cost trend (with margin %)
 * and the role mix behind the hours.
 */

import { useEffect, useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart";
import { PLUS } from "../dashboard/charts/colors";
import { clientDetail, monthLabel, periodLabel, type ProfitRow } from "../../lib/finance-toolkit/model";
import type { CostBasis } from "../../lib/finance-toolkit/finance-toolkit.types";
import { Chip } from "./ft-ui";
import { formatCompactMoney, hours, money, pct, rate } from "./ft-format";

const config: ChartConfig = {
  revenue: { label: "Gross revenue", color: PLUS.green },
  cost: { label: "Staffing cost", color: PLUS.purple },
  margin: { label: "Margin %", color: PLUS.black },
};

export default function ClientDetailDrawer({
  row,
  from,
  to,
  basis,
  currency,
  onClose,
}: {
  row: ProfitRow;
  from: number;
  to: number;
  basis: CostBasis;
  currency: string;
  onClose: () => void;
}) {
  const detail = useMemo(() => clientDetail(row.client.index, from, to, basis), [row.client.index, from, to, basis]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = detail.monthly.map((m) => ({
    month: monthLabel(m.month, true),
    revenue: m.revenue === null ? null : Math.round(m.revenue),
    cost: Math.round(m.cost),
    margin: m.revenue && m.revenue > 0 ? Math.round(((m.revenue - m.cost) / m.revenue) * 1000) / 10 : null,
    hours: m.hours,
    people: m.people,
  }));
  const peakPeople = Math.max(0, ...detail.monthly.map((m) => m.people));

  const figures: { label: string; value: string; sub?: string }[] = [
    { label: "Gross revenue", value: row.revenue === null ? "No revenue match" : money(row.revenue) },
    { label: "Staffing cost", value: row.cost === null ? "No hours" : money(row.cost), sub: row.costPerHour === null ? undefined : `${rate(row.costPerHour)} / hour` },
    { label: "Gross margin", value: row.margin === null ? "—" : money(row.margin), sub: row.marginPct === null ? undefined : pct(row.marginPct) },
    { label: "Client hours", value: hours(row.hours), sub: `${row.people} people · peak ${peakPeople} in a month` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${row.client.name} detail`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="bg-gray-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">
                {row.client.agencyName} · Client #{row.client.number}
              </div>
              <h2 className="mt-1 text-lg font-bold leading-tight">{row.client.name}</h2>
              <div className="mt-1 text-xs text-gray-300">{periodLabel(from, to)} · amounts in {currency}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-300 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.flag === "loss" && <Chip tone="loss">Staffing cost exceeds revenue</Chip>}
            {row.flag === "over-serviced" && <Chip tone="over">Over-serviced</Chip>}
            {row.client.match === "name" && <Chip tone="neutral">Revenue matched by name</Chip>}
            {row.costCoverage !== null && row.costCoverage < 0.98 && (
              <Chip tone="over">{pct(1 - row.costCoverage, 0)} of hours have no cost on file</Chip>
            )}
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
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Revenue vs staffing cost by month</h3>
            <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 240 }}>
              <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="money" tickFormatter={(v) => formatCompactMoney(Number(v))} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="pct" orientation="right" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v, name) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{config[name as string]?.label}</span>
                          <span className="font-medium tabular-nums text-foreground">{name === "margin" ? `${v}%` : money(Number(v))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar yAxisId="money" dataKey="revenue" fill="var(--color-revenue)" isAnimationActive={false} />
                <Bar yAxisId="money" dataKey="cost" fill="var(--color-cost)" isAnimationActive={false} />
                <Line yAxisId="pct" dataKey="margin" stroke="var(--color-margin)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ChartContainer>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Monthly staffing</h3>
            <div className="overflow-x-auto border border-gray-200">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Month</th>
                    <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
                    <th className="px-3 py-2 text-right font-semibold">Margin %</th>
                    <th className="px-3 py-2 text-right font-semibold">Hours</th>
                    <th className="px-3 py-2 text-right font-semibold">People</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => (
                    <tr key={m.month} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5">{m.month}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.revenue === null ? "—" : money(m.revenue)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(m.cost)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.margin === null ? "—" : `${m.margin.toFixed(1)}%`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{hours(m.hours)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.people}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Role mix</h3>
            {detail.roles.length === 0 ? (
              <p className="text-xs text-gray-500">No client hours in this period.</p>
            ) : (
              <ul className="space-y-2.5">
                {detail.roles.map((r) => (
                  <li key={r.role}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-gray-800">{r.label}</span>
                      <span className="shrink-0 tabular-nums text-gray-500">
                        {hours(r.hours)} h · {pct(r.share)} · {money(r.cost)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 bg-gray-100">
                      <div className="h-full bg-purple-600" style={{ width: `${(r.share / detail.roles[0].share) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
