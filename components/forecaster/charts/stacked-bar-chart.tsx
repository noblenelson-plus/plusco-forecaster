// components/forecaster/charts/stacked-bar-chart.tsx
"use client";

/**
 * Stacked bar chart — one bar per category, split into colored segments that
 * stay consistent across bars. Supports vertical or horizontal layout, fills
 * its container height, prints a total at the end of each bar plus per-segment
 * values inside, and hides zero-value segments from the tooltip.
 *
 * Row totals are drawn in a single Customized layer that reads the chart's own
 * axis scales, rather than from a LabelList attached to one of the series.
 * Deriving the position from a segment's rect requires knowing which segment
 * ends (or starts) the stack, and Recharts does not draw them in the order the
 * series are declared — so any such guess misplaces the label on rows whose
 * order differs. Asking the scale for the pixel of the total value is exact.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Customized,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface StackedRow {
  name: string;
  segments: { label: string; value: number }[];
  total: number;
}

const TOTAL_KEY = "__total";

// Tooltip that drops zero-value segments (no point listing products a client
// doesn't have) and appends the row total.
function ZeroFreeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.dataKey !== TOTAL_KEY && Number(p.value) > 0);
  if (rows.length === 0) return null;
  const total = rows.reduce((a: number, p: any) => a + Number(p.value), 0);
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {rows.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-foreground">{Math.round(Number(p.value))}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-border pt-1 font-medium text-foreground">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  );
}

export default function StackedBarChart({
  rows,
  colorFor,
  layout = "vertical",
}: {
  rows: StackedRow[];
  colorFor: (label: string) => string;
  /** "vertical" = bars rise from the x-axis; "horizontal" = bars run rightward. */
  layout?: "vertical" | "horizontal";
}) {
  // Segment order by total contribution (largest first), for a stable legend.
  const totals = new Map<string, number>();
  for (const r of rows) for (const s of r.segments) totals.set(s.label, (totals.get(s.label) ?? 0) + s.value);
  const labels = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);

  const data = rows.map((r) => {
    const row: Record<string, string | number> = { name: r.name, [TOTAL_KEY]: r.total };
    for (const l of labels) row[l] = 0;
    for (const s of r.segments) row[s.label] = s.value;
    return row;
  });

  const horizontal = layout === "horizontal";

  /**
   * Total for each bar, positioned from the chart's own scales: the value axis
   * gives the pixel where the stack ends, the category axis gives the band to
   * centre against.
   */
  const renderTotals = (props: any) => {
    const xAxis: any = props.xAxisMap ? Object.values(props.xAxisMap)[0] : null;
    const yAxis: any = props.yAxisMap ? Object.values(props.yAxisMap)[0] : null;
    if (typeof xAxis?.scale !== "function" || typeof yAxis?.scale !== "function") return null;

    const valueAxis = horizontal ? xAxis : yAxis;
    const categoryAxis = horizontal ? yAxis : xAxis;
    const band = categoryAxis.scale.bandwidth ? categoryAxis.scale.bandwidth() : 0;

    return (
      <g>
        {data.map((row, index) => {
          const total = Number(row[TOTAL_KEY]);
          if (!total) return null;

          const start = categoryAxis.scale(String(row.name));
          const end = valueAxis.scale(total);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

          return (
            <text
              key={index}
              x={horizontal ? end + 14 : start + band / 2}
              y={horizontal ? start + band / 2 : end - 8}
              textAnchor={horizontal ? "start" : "middle"}
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              fill="#374151"
            >
              {Math.round(total)}
            </text>
          );
        })}
      </g>
    );
  };

  return (
    <div className="h-full w-full" style={{ minHeight: horizontal ? rows.length * 34 + 60 : 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 20, right: horizontal ? 48 : 8, left: 8, bottom: 8 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={130} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} width={32} />
            </>
          )}
          <Tooltip content={<ZeroFreeTooltip />} cursor={{ fillOpacity: 0.15 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {labels.map((label, i) => {
            const isLast = i === labels.length - 1;
            return (
              <Bar
                key={label}
                dataKey={label}
                stackId="s"
                fill={colorFor(label)}
                isAnimationActive={false}
                radius={isLast ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0}
              >
                <LabelList
                  dataKey={label}
                  position="center"
                  formatter={(v: unknown) => (Number(v) > 0 ? String(Math.round(Number(v))) : "")}
                  fontSize={10}
                  fill="#fff"
                />
              </Bar>
            );
          })}
          <Customized component={renderTotals} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}