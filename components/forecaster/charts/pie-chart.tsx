// components/forecaster/charts/pie-chart.tsx
"use client";

/**
 * Full pie chart (Looker style) for the Forecaster dashboard. Each segment is
 * drawn in its own color with its share printed inside the slice; a legend
 * beside it lists the channels. Zero-value segments are dropped.
 * Self-contained: depends only on Recharts.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieSegment {
  label: string;
  value: number;
  color: string;
}

export default function ForecasterPieChart({
  segments,
  valueFormat = (v) => String(Math.round(v)),
  size = 256,
}: {
  segments: PieSegment[];
  /** Formats the raw value shown in the tooltip (e.g. money formatter). */
  valueFormat?: (value: number) => string;
  /** Square size (px) of the pie drawing area. Defaults to 256 (h-64 w-64). */
  size?: number;
}) {
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((acc, s) => acc + s.value, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  // Draw the share centred inside each slice. Tiny slices are skipped so the
  // labels don't overlap; their values are still in the legend and tooltip.
  const renderLabel = ({ cx, cy, midAngle, outerRadius, value }: any) => {
    const share = pct(Number(value));
    if (share < 3) return null;
    const RADIAN = Math.PI / 180;
    const r = outerRadius * 0.6;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {share.toFixed(1)}%
      </text>
    );
  };

  return (
    <div className="@container flex flex-col items-center gap-4">
      <div className="flex-shrink-0" style={{ height: size, width: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={0}
              outerRadius="100%"
              stroke="#fff"
              strokeWidth={1}
              labelLine={false}
              label={renderLabel}
            >
              {data.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [valueFormat(Number(value)), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — color dot · label (shares now live inside the slices) */}
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm @sm:justify-start">
        {data.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-gray-700">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}