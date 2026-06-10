// components/forecaster/grid-last-updated.tsx
"use client";

/**
 * Compact "last updated" indicator for a forecast axis — shows when the
 * BL_INPUT and the ADMIN_INPUT (actuals, labelled per axis e.g. MediaOcean /
 * GAIA) were last saved. Rendered in each grid's toolbar.
 */

import { Clock } from "lucide-react";

/** ISO → "Jun 10, 2026, 2:45 p.m." (en-CA); a dash when never saved. */
function formatStamp(iso?: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GridLastUpdated({
  blUpdatedAt,
  actualsUpdatedAt,
  actualsLabel,
}: {
  blUpdatedAt?: string;
  actualsUpdatedAt?: string;
  /** Display name of the actuals source (config.actualsLabel). */
  actualsLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
      <span className="flex items-center gap-1">
        <Clock size={11} className="flex-shrink-0" />
        <span>BL Input updated</span>
        <span className="font-medium text-gray-600">{formatStamp(blUpdatedAt)}</span>
      </span>
      <span className="flex items-center gap-1">
        <span>{actualsLabel} updated</span>
        <span className="font-medium text-gray-600">
          {formatStamp(actualsUpdatedAt)}
        </span>
      </span>
    </div>
  );
}
