// components/dashboard/charts/donut-chart.tsx
"use client";

/**
 * Donut chart (Recharts PieChart) with a centered headline and a value/percent
 * legend beside it. Fixed-size chart (no ResponsiveContainer) so it renders
 * cleanly during SSR and stays crisp.
 */

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { TRACK_COLOR } from "./colors";
import { ChartTooltip } from "./chart-tooltip";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export default function DonutChart({
  segments,
  size = 184,
  centerValue,
  centerLabel,
  valueFormat = (v) => String(Math.round(v)),
}: {
  segments: DonutSegment[];
  size?: number;
  centerValue?: string;
  centerLabel?: string;
  valueFormat?: (value: number) => string;
}) {
  const data = segments.filter((s) => s.value > 0);
  const total = segments.reduce((acc, s) => acc + s.value, 0);

  return (
    // @container: the legend stays to the right of the donut whenever the
    // *card* is wide enough (≥ 24rem), with a generous gap; only a very narrow
    // column makes it stack — independent of the viewport width.
    <div className="@container flex flex-col items-center justify-center gap-6 @sm:flex-row @sm:gap-12">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {data.length > 0 ? (
          <PieChart width={size} height={size}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={size * 0.32}
              outerRadius={size * 0.5}
              paddingAngle={data.length > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((s, i) => (
                <Cell key={i} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
          </PieChart>
        ) : (
          <div
            className="h-full w-full rounded-full"
            style={{ boxShadow: `inset 0 0 0 ${size * 0.18}px ${TRACK_COLOR}` }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <span className="text-xl font-bold tabular-nums text-gray-900">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="w-full max-w-xs space-y-2.5 @sm:w-auto @sm:min-w-[170px]">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2.5 text-xs">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate text-gray-600">{s.label}</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="tabular-nums text-gray-800">
                {valueFormat(s.value)}
              </span>
              <span className="w-9 text-right tabular-nums text-gray-400">
                {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
