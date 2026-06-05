// components/dashboard/charts/gauge-chart.tsx
"use client";

/**
 * Semicircular gauge (Recharts RadialBarChart) filled to `value` (0–1, clamped
 * for the sweep), with an optional target tick drawn over the band. Fixed size
 * with the bottom half cropped, the headline value centered in the opening.
 */

import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { TRACK_COLOR } from "./colors";

const W = 224; // full chart box (a square; we crop the bottom half)
const GAUGE_H = 128; // visible height after cropping
const INNER = 80;
const OUTER = 106;

export default function GaugeChart({
  value,
  target,
  color = "#6366f1",
  valueLabel,
  caption,
}: {
  /** Ratio to display (0–1+); the sweep is clamped to [0,1]. */
  value: number;
  /** Optional target ratio, drawn as a tick across the band. */
  target?: number;
  color?: string;
  /** Big centered label (e.g. "25%"). */
  valueLabel: string;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  const cx = W / 2;
  const cy = W / 2;

  // Target tick endpoints on the band, in the cropped overlay's coordinates.
  let tick: React.ReactNode = null;
  if (target !== undefined) {
    const tf = Math.max(0, Math.min(1, target));
    const t = Math.PI * (1 - tf);
    const r1 = INNER - 4;
    const r2 = OUTER + 4;
    tick = (
      <line
        x1={cx + r1 * Math.cos(t)}
        y1={cy - r1 * Math.sin(t)}
        x2={cx + r2 * Math.cos(t)}
        y2={cy - r2 * Math.sin(t)}
        stroke="#0f172a"
        strokeWidth={2}
      />
    );
  }

  return (
    <div
      className="relative mx-auto overflow-hidden"
      style={{ width: W, height: GAUGE_H }}
    >
      <RadialBarChart
        width={W}
        height={W}
        cx={cx}
        cy={cy}
        innerRadius={INNER}
        outerRadius={OUTER}
        startAngle={180}
        endAngle={0}
        data={[{ name: "value", value: pct }]}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          background={{ fill: TRACK_COLOR }}
          dataKey="value"
          cornerRadius={13}
          fill={color}
        />
      </RadialBarChart>

      {tick && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={W}
          height={GAUGE_H}
          viewBox={`0 0 ${W} ${GAUGE_H}`}
        >
          {tick}
        </svg>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-gray-900">
          {valueLabel}
        </span>
        {caption && (
          <span className="mt-0.5 px-2 text-center text-xs text-gray-400">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
