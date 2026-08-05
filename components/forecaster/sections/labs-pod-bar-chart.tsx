// components/forecaster/sections/labs-pod-bar-chart.tsx
"use client";

/**
 * % of Target Booked by GM Pod — a grouped bar chart (x-axis = GM pod, one bar
 * per labs partner), with a dashed 100% target line and the % rotated above each
 * bar. Same data as the pacing matrix, shown as bars.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComponentProps } from "react";
import type { GmPodMatrix } from "./labs-pacing-data";

interface BarLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
}

/** % value rotated vertically above each (thin) bar. */
function renderPctLabel(props: BarLabelProps) {
  const { value } = props;
  if (value === undefined || value === null || value === "") return null;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const cx = x + width / 2;
  const cy = y - 3;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="start"
      transform={`rotate(-90 ${cx} ${cy})`}
      style={{ fontSize: 13, fill: "#6b7280" }}
    >
      {`${value}%`}
    </text>
  );
}

/** Categorical colours for the partner series. */
const PALETTE = [
  "#4f46e5", "#f59e0b", "#a855f7", "#84cc16", "#06b6d4", "#eab308",
  "#ec4899", "#6366f1", "#f97316", "#14b8a6", "#ef4444", "#8b5cf6",
];

export default function LabsPodBarChart({ matrix }: { matrix: GmPodMatrix }) {
  const partners = matrix.rows.map((r) => r.partnerName);

  const data = matrix.pods.map((pod) => {
    const row: Record<string, string | number> = { name: pod };
    for (const r of matrix.rows) {
      const v = r.byPod[pod];
      if (v !== null) row[r.partnerName] = Math.round(v);
    }
    return row;
  });

  if (data.length === 0 || partners.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No data to display.
      </p>
    );
  }

  const tooltipFormatter = ((value: number, name: string) => [
    `${value}%`,
    name,
  ]) as ComponentProps<typeof Tooltip>["formatter"];

  return (
    <div style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey="name"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ fillOpacity: 0.1 }}
            formatter={tooltipFormatter}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {partners.map((p, i) => (
            <Bar
              key={p}
              dataKey={p}
              fill={PALETTE[i % PALETTE.length]}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
            >
              <LabelList
                dataKey={p}
                content={renderPctLabel as ComponentProps<typeof LabelList>["content"]}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}