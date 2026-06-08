// components/dashboard/charts/gauge-chart.tsx
"use client";

/**
 * Radial gauge — a thin wrapper over the Tremor ProgressCircle. The headline
 * value is passed as the centered child, so the component positions it for us
 * (no manual overlay math). An optional caption sits below the ring.
 */

import { ProgressCircle, type ProgressCircleProps } from "../../ui/progress-circle";

export default function GaugeChart({
  value,
  variant = "default",
  valueLabel,
  caption,
}: {
  /** Ratio to display (0–1+); the ring fill is clamped to [0,1]. */
  value: number;
  variant?: ProgressCircleProps["variant"];
  /** Big centered label (e.g. "25%"). */
  valueLabel: string;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <ProgressCircle value={pct} radius={76} strokeWidth={14} variant={variant}>
        <span className="text-3xl font-bold tabular-nums text-gray-900">
          {valueLabel}
        </span>
      </ProgressCircle>
      {caption && (
        <p className="mt-3 max-w-[15rem] text-center text-xs leading-tight text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
