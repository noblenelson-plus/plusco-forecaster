// components/dashboard/charts/stacked-bar-chart.tsx
"use client";

/**
 * Monthly stacked bar chart — one bar per month inside the shared
 * <ChartContainer>. Each bar's height is the month's total; the colored
 * segments are the per-category split (e.g. media type). Takes the same series
 * shape as <TrendChart> (label · color · 12 points), so call sites stay
 * symmetric. Categories with no spend are dropped from the stack and legend.
 */

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";
import type { TrendSeries } from "./trend-chart";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "");

export default function StackedBarChart({
  series,
  height = 240,
  valueFormat,
}: {
  series: TrendSeries[];
  height?: number;
  valueFormat?: (value: number) => string;
}) {
  // Keep only categories that have spend somewhere in the year.
  const active = useMemo(
    () => series.filter((s) => s.points.some((p) => p > 0)),
    [series]
  );

  const { config, data, keys } = useMemo(() => {
    const cfg: ChartConfig = {};
    const ks = active.map((s) => {
      const key = slug(s.label);
      cfg[key] = { label: s.label, color: s.color };
      return key;
    });
    const rows = MONTH_LABELS.map((month, i) => {
      const row: Record<string, string | number> = { month };
      active.forEach((s, si) => (row[ks[si]] = s.points[i] ?? 0));
      return row;
    });
    return { config: cfg, data: rows, keys: ks };
  }, [active]);

  const yFmt = (v: number | string) =>
    valueFormat ? valueFormat(Number(v)) : String(v);
  const lastIdx = keys.length - 1;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          minTickGap={2}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickFormatter={yFmt}
          tickLine={false}
          axisLine={false}
          width={52}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">
                      {config[name as string]?.label ?? name}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {valueFormat ? valueFormat(Number(value)) : value}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="media"
            fill={`var(--color-${key})`}
            radius={i === lastIdx ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
