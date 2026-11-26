// components/dashboard/charts/grouped-bar-chart.tsx
"use client";

/**
 * Grouped bar chart — one group per category, one bar per series side by side
 * (e.g. 2025 vs 2026 share of spend by channel), inside the shared
 * <ChartContainer> with the dashboard tooltip. Values are labelled above each
 * bar with `valueFormat`. Long category names are angled when `angled` is set.
 */

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";

export interface GroupedBarSeries {
  /** Key in each data row. */
  key: string;
  label: string;
  color: string;
}

export default function GroupedBarChart({
  data,
  series,
  height = 280,
  valueFormat = (v) => String(v),
  angled = false,
}: {
  /** One row per category: { category, [series.key]: number }. */
  data: { category: string; [key: string]: string | number }[];
  series: GroupedBarSeries[];
  height?: number;
  valueFormat?: (value: number) => string;
  angled?: boolean;
}) {
  const config = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const s of series) cfg[s.key] = { label: s.label, color: s.color };
    return cfg;
  }, [series]);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: angled ? 40 : 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fontSize: 11 }}
          angle={angled ? -35 : 0}
          textAnchor={angled ? "end" : "middle"}
          height={angled ? 60 : 30}
        />
        <YAxis tickFormatter={(v) => valueFormat(Number(v))} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{config[name as string]?.label ?? name}</span>
                  </span>
                  <span className="font-medium tabular-nums text-foreground">{valueFormat(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} isAnimationActive={false}>
            <LabelList
              dataKey={s.key}
              position="top"
              fontSize={10}
              className="fill-muted-foreground"
              formatter={(v: unknown) => valueFormat(Number(v))}
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
