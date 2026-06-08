// components/dashboard/charts/stat-card.tsx

/**
 * KPI tile — an icon + label over a large headline figure, with an optional
 * sub-line (context or a delta). Used for the metric strip atop each tab.
 * Built on the shared shadcn/ui Card primitive.
 */

import type { LucideIcon } from "lucide-react";
import { Card } from "../../ui/card";

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-primary",
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Tailwind text color for the icon. */
  accent?: string;
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon size={15} className={accent} />}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
