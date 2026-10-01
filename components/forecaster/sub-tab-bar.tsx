// components/forecaster/sub-tab-bar.tsx
"use client";

/**
 * The dashboard's secondary tab strip — a lighter bar under the main purple
 * tabs, shared by every tab that has sub-tabs (Forecaster Dashboard, Exec KPI
 * Dashboard, Media Investments Report, Reports). Scrolls horizontally when the
 * viewport is too narrow.
 */

export default function SubTabBar<Id extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { id: Id; label: string }[];
  active: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
