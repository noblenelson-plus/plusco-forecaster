// components/dashboard/charts/stat-card.tsx

/**
 * KPI tile — an icon + label over a large headline figure, with an optional
 * sub-line (context or a delta). Used for the metric strip atop each tab.
 */

import type { LucideIcon } from "lucide-react";

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-yellow-500",
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Tailwind text color for the icon. */
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {Icon && <Icon size={15} className={accent} />}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
