// components/dashboard/charts/bar-list.tsx

/**
 * Horizontal ranked bars — one labelled track per item, filled proportionally
 * to the largest value. Intentionally built with plain divs (the same pattern
 * Tremor's <BarList> uses): for a ranked list the labels stay crisp, the value
 * and its hint sit inline without SVG label-clipping, and the bars stay
 * responsive to the card width. Colors use the shared chart palette.
 */

import { ACCENT } from "./colors";

export interface BarItem {
  label: string;
  value: number;
  color?: string;
  /** Optional caption shown after the value (e.g. "120% of planned"). */
  hint?: string;
}

export default function BarList({
  items,
  valueFormat = (v) => String(Math.round(v)),
}: {
  items: BarItem[];
  valueFormat?: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No data to display.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-muted-foreground">
              {it.label}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="tabular-nums text-foreground">
                {valueFormat(it.value)}
              </span>
              {it.hint && (
                <span className="tabular-nums text-muted-foreground">{it.hint}</span>
              )}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(it.value > 0 ? 2 : 0, (it.value / max) * 100)}%`,
                backgroundColor: it.color ?? ACCENT,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
