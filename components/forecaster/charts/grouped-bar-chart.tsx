// components/forecaster/charts/grouped-bar-chart.tsx
"use client";

/**
 * Grouped (side-by-side) bar chart — two series per category, used for the
 * LABS Partners chart (variant vs primary submission per partner). Series
 * names are passed in so they reflect the live RFQ selection. Brand-safe
 * colors (no orange).
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface GroupedBarRow {
  name: string;
  primary: number;
  variant: number;
}

export default function GroupedBarChart({
  data,
  primaryLabel,
  variantLabel,
  valueFormat = (v) => String(Math.round(v)),
  primaryColor = "#6366F1",
  variantColor = "#CBD5E1",
}: {
  data: GroupedBarRow[];
  primaryLabel: string;
  variantLabel: string;
  valueFormat?: (v: number) => string;
  primaryColor?: string;
  variantColor?: string;
}) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#64748b" }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v) => valueFormat(Number(v))}
            width={70}
          />
          <Tooltip formatter={(v, n) => [valueFormat(Number(v)), n]} />
          <Legend />
          <Bar dataKey="variant" name={variantLabel} fill={variantColor} radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey="variant"
              position="top"
              formatter={(v: unknown) => valueFormat(Number(v))}
              fontSize={9}
              fill="#94a3b8"
            />
          </Bar>
          <Bar dataKey="primary" name={primaryLabel} fill={primaryColor} radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey="primary"
              position="top"
              formatter={(v: unknown) => valueFormat(Number(v))}
              fontSize={9}
              fill="#64748b"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}