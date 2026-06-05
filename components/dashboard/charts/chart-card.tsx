// components/dashboard/charts/chart-card.tsx

/**
 * Card shell for a dashboard chart — title row (optional icon + subtitle) over
 * the chart body. Matches the app's card style (rounded-xl, subtle shadow).
 */

import type { LucideIcon } from "lucide-react";

export default function ChartCard({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${
        className ?? ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="flex-shrink-0 text-yellow-500" />}
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
