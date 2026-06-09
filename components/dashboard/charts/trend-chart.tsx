// components/dashboard/charts/trend-chart.tsx
"use client";

/**
 * Monthly trend chart — rendered inside the shared <ChartContainer>. A single
 * series renders as a gradient area; several series render as overlaid lines
 * with a shared legend. Responsive width, fixed height; colors/labels are
 * driven by a ChartConfig so the tooltip and legend stay in sync.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface TrendSeries {
  label: string;
  color: string;
  /** 12 values, index 0 = January. */
  points: number[];
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "");

export default function TrendChart({
  series,
  height = 220,
  valueFormat,
  reference,
}: {
  series: TrendSeries[];
  height?: number;
  valueFormat?: (value: number) => string;
  /** Optional horizontal target line (e.g. a 25% goal). */
  reference?: { value: number; label?: string; color?: string };
}) {
  // ChartConfig keyed by a slug so the dataKey, the color CSS variable and the
  // tooltip/legend label all resolve from one place.
  const { config, data, keys } = useMemo(() => {
    const cfg: ChartConfig = {};
    const ks = series.map((s) => {
      const key = slug(s.label);
      cfg[key] = { label: s.label, color: s.color };
      return key;
    });
    const rows = MONTH_LABELS.map((month, i) => {
      const row: Record<string, string | number> = { month };
      series.forEach((s, si) => (row[ks[si]] = s.points[i] ?? 0));
      return row;
    });
    return { config: cfg, data: rows, keys: ks };
  }, [series]);

  const yFmt = (v: number | string) =>
    valueFormat ? valueFormat(Number(v)) : String(v);
  const tickProps = { fontSize: 11 };

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="month"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        interval={0}
        minTickGap={2}
        tick={tickProps}
      />
      <YAxis
        tickFormatter={yFmt}
        tickLine={false}
        axisLine={false}
        width={52}
        tick={tickProps}
      />
      <ChartTooltip
        cursor={{ strokeDasharray: "3 3" }}
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
      {reference && (
        <ReferenceLine
          y={reference.value}
          stroke={reference.color ?? "#94a3b8"}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={
            reference.label
              ? {
                  value: reference.label,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: reference.color ?? "#94a3b8",
                }
              : undefined
          }
        />
      )}
    </>
  );

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      {keys.length === 1 ? (
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${keys[0]}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${keys[0]})`} stopOpacity={0.35} />
              <stop offset="100%" stopColor={`var(--color-${keys[0]})`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes}
          <Area
            type="monotone"
            dataKey={keys[0]}
            stroke={`var(--color-${keys[0]})`}
            strokeWidth={2.5}
            fill={`url(#grad-${keys[0]})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {axes}
          <ChartLegend content={<ChartLegendContent />} />
          {keys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  );
}
