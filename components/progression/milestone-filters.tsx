// components/progression/milestone-filters.tsx
"use client";

/**
 * Milestones page filter bar: the checkpoint (one milestone, labelled with its
 * due month), the client facets (GM Pod, Agency, Region, Business Lead — same
 * cascading engine as the dashboard) and the status chips. Status applies to
 * the selected checkpoint and is multi-select (e.g. Not validated + Flags to
 * justify together); none selected = every status.
 *
 * The page is always limited to the clients active in the selected year, so
 * there is no client-status or tier filter here.
 */

import { Filter, X } from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import type { FacetView } from "../../lib/dashboard/filters/use-dashboard-filters";
import { CONFIRMATION_STEPS } from "../../lib/constants/confirmation-steps";
import { MILESTONE_STATUS_ORDER } from "../../lib/format/milestone-summary";
import type { RfqValidationStatus } from "../../lib/types/forecast-flags.types";
import { STATUS_META } from "./milestone-status";

interface MilestoneFiltersProps {
  checkpointId: string;
  onCheckpointChange: (stepId: string) => void;
  facetViews: FacetView[];
  statuses: RfqValidationStatus[];
  onStatusesChange: (s: RfqValidationStatus[]) => void;
  /** Active clients in the year after the facets + status filter, and before. */
  shownCount: number;
  activeCount: number;
  year: number | null;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export default function MilestoneFilters({
  checkpointId,
  onCheckpointChange,
  facetViews,
  statuses,
  onStatusesChange,
  shownCount,
  activeCount,
  year,
  hasActiveFilters,
  onReset,
}: MilestoneFiltersProps) {
  const toggleStatus = (s: RfqValidationStatus) =>
    onStatusesChange(
      statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]
    );

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

        {/* Status at the checkpoint — multi-select chips. */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Status at the checkpoint">
          <span className="text-xs font-medium text-gray-600">Status</span>
          {MILESTONE_STATUS_ORDER.map((s) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
                className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? `${STATUS_META[s].chip} border-gray-900 font-semibold`
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {STATUS_META[s].label}
              </button>
            );
          })}
        </div>

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
