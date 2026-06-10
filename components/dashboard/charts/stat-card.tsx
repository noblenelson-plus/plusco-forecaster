// filepath: components/dashboard/charts/stat-card.tsx

/**
 * KPI tile — an icon + label over a large headline figure, with an optional
 * sub-line (context or a delta). Used for the metric strip atop each tab.
 * Built on the shared shadcn/ui Card primitive.
 * * Supports an optional `variance` object to display a comparison pill (e.g. +15%)
 * and an absolute difference label (e.g. +$1.2M vs comparison).
 */

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "../../ui/card";

export interface StatVariance {
  /** The text inside the pill, e.g. "+15%" or "−2%" */
  pillLabel: string;
  /** True = Green (Favorable), False = Red (Unfavorable) */
  isFavorable: boolean;
  /** Optional absolute difference text, e.g. "+$1.2M" */
  absoluteLabel?: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-primary",
  variance,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Tailwind text color for the icon. */
  accent?: string;
  variance?: StatVariance | null;
}) {
  // Determine the icon for the variance pill based on the label text
  const isDown = variance?.pillLabel.startsWith("-") || variance?.pillLabel.startsWith("−");
  const isFlat = variance?.pillLabel === "—" || variance?.pillLabel === "0%";

  return (
    <Card className="gap-0 p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {Icon && <Icon size={15} className={accent} />}
          {label}
        </div>
        
        <div className="mt-2 flex items-end gap-2">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {value}
          </div>
          
          {variance && (
            <div
              className={`mb-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                isFlat 
                  ? "bg-gray-100 text-gray-500" 
                  : variance.isFavorable
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
              }`}
            >
              {isDown ? (
                <TrendingDown size={11} />
              ) : isFlat ? (
                <Minus size={11} />
              ) : (
                <TrendingUp size={11} />
              )}
              {variance.pillLabel}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2">
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {variance?.absoluteLabel && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {variance.absoluteLabel} vs comparison
          </div>
        )}
      </div>
    </Card>
  );
}