// components/dashboard/charts/horizontal-stacked-bar.tsx
"use client";

/**
 * Horizontal stacked bar chart — one bar per row (e.g. a client), the bar
 * length is the row total and the colored segments are the per-category split
 * (e.g. media type). Rows are expected pre-sorted by the caller. Built on the
 * shared <ChartContainer>; the row total is printed at the end of each bar.
 */

import { useMemo } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";

export interface StackSeries {
  /** Stable key used for the dataKey and the `--color-<key>` variable. */
  key: string;
  label: string;
  color: string;
}

export interface StackRow {
  label: string;
  /** Value per series key; missing keys count as 0. */
  values: Record<string, number>;
}

const ROW_HEIGHT = 34;
const TOTAL_KEY = "__total";

const truncate = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function HorizontalStackedBar({
  series,
  rows,
  valueFormat = (v) => String(Math.round(v)),
}: {
  series: StackSeries[];
  rows: StackRow[];
  valueFormat?: (value: number) => string;
}) {
  // Drop series with no spend across the visible rows, so the legend only
  // lists categories that actually appear.
  const activeSeries = useMemo(
    () => series.filter((s) => rows.some((r) => (r.values[s.key] ?? 0) > 0)),
    [series, rows]
  );

  const { config, data } = useMemo(() => {
    const cfg: ChartConfig = {};
    activeSeries.forEach((s) => (cfg[s.key] = { label: s.label, color: s.color }));
    const d = rows.map((r) => {
      const row: Record<string, string | number> = { label: r.label };
      let total = 0;
      activeSeries.forEach((s) => {
        const v = r.values[s.key] ?? 0;
        row[s.key] = v;
        total += v;
      });
      row[TOTAL_KEY] = total;
      return row;
    });
    return { config: cfg, data: d };
  }, [activeSeries, rows]);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No data to display.
      </p>
    );
  }

  const lastKey = activeSeries[activeSeries.length - 1]?.key;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: rows.length * ROW_HEIGHT + 48 }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, left: 4, bottom: 0 }}
        barCategoryGap="22%"
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={130}
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => truncate(v)}
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
                    {valueFormat(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {activeSeries.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="spend"
            fill={`var(--color-${s.key})`}
            isAnimationActive={false}
            radius={s.key === lastKey ? [0, 4, 4, 0] : 0}
          >
            {s.key === lastKey && (
              <LabelList
                dataKey={TOTAL_KEY}
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={11}
                formatter={(v) => valueFormat(Number(v))}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
