// components/forecaster/sections/labs-variance-chart.tsx
"use client";

/**
 * $ Variance to Target — a vertical diverging bar chart (one bar per partner,
 * green above zero / red below), sorted from most-ahead to most-behind, with the
 * signed dollar amount above/below each bar. Matches the Looker "variance vs
 * target" chart, which BarList can't render (it has no negative axis).
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ComponentProps } from "react";
import { formatCompactMoney } from "../../dashboard/charts/format";
import { pacingMoney } from "./labs-pacing-data";
import type { LabsPacingRow } from "./labs-pacing-data";

const AHEAD = "#15803d";
const BEHIND = "#b91c1c";

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}

/** Signed amount above positive bars, below negative ones. */
function renderValueLabel(props: LabelProps) {
  const value = Number(props.value ?? 0);
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const cx = x + width / 2;
  const cy = value >= 0 ? y - 5 : y + height + 12;
  return (
    <text x={cx} y={cy} textAnchor="middle" style={{ fontSize: 10, fill: "#374151" }}>
      {pacingMoney(value)}
    </text>
  );
}

export default function LabsVarianceChart({ rows }: { rows: LabsPacingRow[] }) {
  const data = rows
    .map((r) => ({ name: r.partnerName, value: r.variance }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No data to display.
      </p>
    );
  }

  return (
    <div style={{ height: 380 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey="name"
            interval={0}
            tickLine={false}
            axisLine={false}
            height={48}
            angle={-35}
            textAnchor="end"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatCompactMoney}
            tick={{ fontSize: 11 }}
            width={60}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? AHEAD : BEHIND} />
            ))}
            <LabelList
              dataKey="value"
              content={renderValueLabel as ComponentProps<typeof LabelList>["content"]}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}