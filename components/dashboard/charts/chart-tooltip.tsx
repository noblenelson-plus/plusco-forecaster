// components/dashboard/charts/chart-tooltip.tsx
"use client";

/**
 * Shared Recharts tooltip — a small white card matching the app's surfaces,
 * with a color swatch + formatted value per series. Pass it via
 * `<Tooltip content={<ChartTooltip valueFormat={fmt} />} />`; Recharts injects
 * `active`/`payload`/`label` at render time.
 */

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { color?: string };
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormat,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormat?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== "" && (
        <div className="mb-1 font-semibold text-gray-700">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: p.color ?? p.payload?.color ?? "#94a3b8" }}
          />
          {p.name !== undefined && <span className="text-gray-500">{p.name}</span>}
          <span className="ml-auto font-medium tabular-nums text-gray-800">
            {typeof p.value === "number" && valueFormat
              ? valueFormat(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
