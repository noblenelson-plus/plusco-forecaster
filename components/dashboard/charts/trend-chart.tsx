// components/dashboard/charts/trend-chart.tsx
"use client";

/**
 * Monthly trend chart (Recharts). A single series renders as a gradient area;
 * several series render as overlaid lines with a legend. Responsive width,
 * fixed height.
 */

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TRACK_COLOR } from "./colors";
import { ChartTooltip } from "./chart-tooltip";

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
}: {
  series: TrendSeries[];
  height?: number;
  valueFormat?: (value: number) => string;
}) {
  const data = MONTH_LABELS.map((month, i) => {
    const row: Record<string, string | number> = { month };
    for (const s of series) row[s.label] = s.points[i] ?? 0;
    return row;
  });

  const tick = { fontSize: 11, fill: "#94a3b8" };
  const yFmt = (v: number | string) =>
    valueFormat ? valueFormat(Number(v)) : String(v);

  const grid = (
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={TRACK_COLOR} />
  );
  const xAxis = (
    <XAxis
      dataKey="month"
      tickLine={false}
      axisLine={false}
      tick={tick}
      interval={0}
      minTickGap={2}
    />
  );
  const yAxis = (
    <YAxis
      tickFormatter={yFmt}
      tickLine={false}
      axisLine={false}
      width={52}
      tick={tick}
    />
  );
  const tooltip = (
    <Tooltip
      content={<ChartTooltip valueFormat={valueFormat} />}
      cursor={{ stroke: "#e2e8f0" }}
    />
  );

  if (series.length === 1) {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${slug(s.label)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Area
            type="monotone"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#grad-${slug(s.label)})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Line
            key={i}
            type="monotone"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
