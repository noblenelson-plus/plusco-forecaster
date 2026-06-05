// components/dashboard/charts/bar-list.tsx

/**
 * Horizontal bar list — one labelled track per item, filled proportionally to
 * the largest value. Built with plain divs (no SVG), which keeps the labels
 * crisp and the bars responsive to the card width.
 */

import { ACCENT } from "./colors";

export interface BarItem {
  label: string;
  value: number;
  color?: string;
  /** Optional caption shown under the value (e.g. "120% of planned"). */
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
      <p className="py-8 text-center text-xs text-gray-400">No data to display.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-gray-600">{it.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="tabular-nums text-gray-800">
                {valueFormat(it.value)}
              </span>
              {it.hint && (
                <span className="tabular-nums text-gray-400">{it.hint}</span>
              )}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
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
