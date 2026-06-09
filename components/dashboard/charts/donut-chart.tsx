// components/dashboard/charts/donut-chart.tsx
"use client";

/**
 * Donut chart — a Recharts Pie inside the shared <ChartContainer>, so it is
 * responsive (the ring follows the card width), themed via per-segment CSS
 * variables, and uses the dashboard's shared tooltip. A centered headline sits
 * in the ring; a value/percent legend sits beside it.
 */

import { useMemo } from "react";
import { Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";
import { TRACK_COLOR } from "./colors";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const keyFor = (label: string, i: number) =>
  `seg${i}_${label.replace(/[^a-zA-Z0-9]/g, "")}`;

export default function DonutChart({
  segments,
  centerValue,
  centerLabel,
  valueFormat = (v) => String(Math.round(v)),
}: {
  segments: DonutSegment[];
  /** Unused now the ring is responsive; kept for call-site compatibility. */
  size?: number;
  centerValue?: string;
  centerLabel?: string;
  valueFormat?: (value: number) => string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);

  // One config entry per segment drives both the slice fill (var(--color-key))
  // and the tooltip label, so colors/labels are declared once.
  const { config, data } = useMemo(() => {
    const cfg: ChartConfig = {};
    const rows = segments
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const key = keyFor(s.label, i);
        cfg[key] = { label: s.label, color: s.color };
        return { key, label: s.label, value: s.value, fill: `var(--color-${key})` };
      });
    return { config: cfg, data: rows };
  }, [segments]);

  return (
    <div className="@container flex flex-col items-center justify-center gap-6 @sm:flex-row @sm:gap-10">
      <div className="relative aspect-square w-full max-w-[200px] flex-shrink-0">
        {data.length > 0 ? (
          <ChartContainer config={config} className="aspect-square h-full w-full">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    nameKey="key"
                    hideLabel
                    formatter={(value, _name, item) => {
                      const p = item.payload as { fill?: string; label?: string };
                      return (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-[2px]"
                            style={{ backgroundColor: p?.fill }}
                          />
                          <span className="text-muted-foreground">
                            {p?.label}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {valueFormat(Number(value))}
                        </span>
                      </div>
                      );
                    }}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="key"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={data.length > 1 ? 2 : 0}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              />
            </PieChart>
          </ChartContainer>
        ) : (
          <div
            className="h-full w-full rounded-full"
            style={{ boxShadow: `inset 0 0 0 18% ${TRACK_COLOR}` }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <span className="text-xl font-bold tabular-nums text-foreground">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="tabular-nums text-foreground">
                {valueFormat(s.value)}
              </span>
              <span className="w-9 text-right tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
