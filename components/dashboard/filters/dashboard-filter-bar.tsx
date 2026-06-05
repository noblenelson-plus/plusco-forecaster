// components/dashboard/filters/dashboard-filter-bar.tsx
"use client";

/**
 * Presentational filter bar — renders one dropdown per facet from the filter
 * engine's view models, plus a result count and a Reset action. All logic
 * (options, cascading, selection) lives in useDashboardFilters; this component
 * only maps view models to UI.
 */

import { Filter, X } from "lucide-react";
import MultiSelectDropdown from "../../_shared/multi-select-dropdown";
import type { FacetView } from "../../../lib/dashboard/filters/use-dashboard-filters";

interface DashboardFilterBarProps {
  facetViews: FacetView[];
  filteredCount: number;
  totalAccessible: number;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export default function DashboardFilterBar({
  facetViews,
  filteredCount,
  totalAccessible,
  hasActiveFilters,
  onReset,
}: DashboardFilterBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none mr-2">
          <Filter size={14} />
          Filters
        </div>

        <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

        {facetViews.map((view) => (
          <MultiSelectDropdown
            key={view.key}
            label={view.label}
            options={view.options}
            selectedValues={view.selected}
            onChange={view.onChange}
            searchable={view.searchable}
          />
        ))}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 tabular-nums">
            {filteredCount} / {totalAccessible} client{totalAccessible !== 1 ? "s" : ""}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <X size={13} />
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
