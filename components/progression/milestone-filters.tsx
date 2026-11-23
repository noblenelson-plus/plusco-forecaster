// components/progression/milestone-filters.tsx
"use client";

/**
 * Milestones page filter bar: the checkpoint (one milestone, labelled with its
 * due month) and the client facets (GM Pod, Agency, Region, Business Lead —
 * same cascading engine as the dashboard). The status chips live on the
 * Milestones by client table.
 *
 * The flag filters (category, flag type and "On" — the media types / partners
 * flagged) only narrow the flag sections; the Flag list follows the selected
 * categories.
 *
 * The page is always limited to the clients active in the selected year, so
 * there is no client-status or tier filter here.
 */

import { Filter, X } from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import type { FacetView } from "../../lib/dashboard/filters/use-dashboard-filters";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import { FLAG_CATEGORIES, FLAG_TYPES } from "../../lib/format/flag-insights";

interface MilestoneFiltersProps {
  checkpointId: string;
  onCheckpointChange: (stepId: string) => void;
  facetViews: FacetView[];
  /** Active clients in the year after the facets, and before. */
  shownCount: number;
  activeCount: number;
  year: number | null;
  hasActiveFilters: boolean;
  onReset: () => void;
  flagCategories: string[];
  onFlagCategoriesChange: (v: string[]) => void;
  flagTypes: string[];
  onFlagTypesChange: (v: string[]) => void;
  /** "On" filter: media types / partners flagged (flagOnKey values). */
  onOptions: { value: string; label: string }[];
  on: string[];
  onOnChange: (v: string[]) => void;
}

export default function MilestoneFilters({
  checkpointId,
  onCheckpointChange,
  facetViews,
  shownCount,
  activeCount,
  year,
  hasActiveFilters,
  onReset,
  flagCategories,
  onFlagCategoriesChange,
  flagTypes,
  onFlagTypesChange,
  onOptions,
  on,
  onOnChange,
}: MilestoneFiltersProps) {
  const typeOptions = FLAG_TYPES.filter(
    (t) => flagCategories.length === 0 || flagCategories.includes(t.category)
  ).map((t) => ({ value: t.id, label: t.label }));

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="mr-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none">
          <Filter size={14} />
          Filters
        </div>
        <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

        {/* Checkpoint — the milestone every status on the page refers to. */}
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          Checkpoint
          <select
            value={checkpointId}
            onChange={(e) => onCheckpointChange(e.target.value)}
            className="border border-gray-900 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 focus:outline-none"
          >
            {CONFIRMATION_STEPS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

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

        <div className="h-7 w-px bg-gray-200" aria-hidden="true" />

        {/* Flag filters — narrow the flag sections only. */}
        <MultiSelectDropdown
          label="Flag category"
          options={FLAG_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          selectedValues={flagCategories}
          onChange={(v) => {
            onFlagCategoriesChange(v);
            // Drop picked flags that left the category selection.
            const allowed = new Set<string>(
              FLAG_TYPES.filter((t) => v.length === 0 || v.includes(t.category)).map((t) => t.id)
            );
            const kept = flagTypes.filter((id) => allowed.has(id));
            if (kept.length !== flagTypes.length) onFlagTypesChange(kept);
          }}
        />
        <MultiSelectDropdown
          label="Flag"
          options={typeOptions}
          selectedValues={flagTypes}
          onChange={onFlagTypesChange}
        />
        <MultiSelectDropdown
          label="Media type / Partner"
          options={
            // Keep a picked value listed even when no flag has it any more.
            [...onOptions, ...on.filter((v) => !onOptions.some((o) => o.value === v)).map((v) => ({ value: v, label: v.replace(":", ": ") }))]
          }
          selectedValues={on}
          onChange={onOnChange}
          searchable
        />

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 tabular-nums">
            {shownCount} / {activeCount} active client{activeCount !== 1 ? "s" : ""}
            {year ? ` in ${year}` : ""}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
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
