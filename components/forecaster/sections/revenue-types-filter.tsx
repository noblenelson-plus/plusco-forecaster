// components/forecaster/sections/revenue-types-filter.tsx
"use client";

/**
 * Revenue-types filter — a row of toggle pills, one per revenue stream, with
 * Commission and Commission Overwrite shown as a single "Commission" pill.
 * Selecting/deselecting narrows every table and the Revenue Types section.
 *
 * All streams are on by default; the "All" reset re-selects everything. A pill
 * carries its stream color as a dot so it reads against the pie and table.
 */

import { Check } from "lucide-react";
import type { StreamSlice } from "../../../lib/dashboard/data/aggregate";
import { filterableStreams } from "./revenue-types-data";

export default function RevenueTypesFilter({
  slices,
  selected,
  onChange,
}: {
  /** Raw stream slices from the primary breakdown (drives the pill list). */
  slices: StreamSlice[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const streams = filterableStreams(slices);
  if (streams.length === 0) return null;

  const allOn = streams.every((s) => selected.has(s.key));

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(streams.map((s) => s.key)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revenue types
      </span>

      {streams.map((stream) => {
        const on = selected.has(stream.key);
        return (
          <button
            key={stream.key}
            type="button"
            onClick={() => toggle(stream.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              on
                ? "border-border bg-card text-foreground"
                : "border-dashed border-border bg-muted text-muted-foreground"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: on ? stream.color : "transparent", border: on ? undefined : `1px solid ${stream.color}` }}
            />
            {stream.label}
            {on && <Check size={12} className="text-muted-foreground" />}
          </button>
        );
      })}

      <button
        type="button"
        onClick={selectAll}
        disabled={allOn}
        className="ml-1 text-xs font-medium text-primary transition-colors hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
      >
        All
      </button>
    </div>
  );
}