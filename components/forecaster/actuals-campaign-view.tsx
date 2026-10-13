// components/forecaster/actuals-campaign-view.tsx
"use client";

/**
 * Campaign → Channel view of the MediaOcean (pink) actuals strip — the inverted
 * orientation of the editable channel view. Read-only (like the MediaBox strip):
 * it exists to *see* the same numbers grouped by campaign and to copy them into
 * the BL, not to edit. Editing stays in the default channel view, where the
 * source detail lines live.
 *
 * Rows come from buildMediaOceanPivot(actuals).byCampaign: each campaign expands
 * to the channels it spans. Every row carries a checkbox for the "Copy to my
 * submission" selection (a campaign ticks all its channels); leaf keys are the
 * same (channel × campaign) atoms the editable channel view uses. Month cells
 * join the grid's cell selection (select + Ctrl/Cmd+C, read-only); the grid
 * owns the pivot and the expanded set, since it orders that selection model.
 */

import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  leafKey,
  type ReferenceSelection,
} from "../../lib/hooks/use-reference-selection";
import {
  ReferenceMonthCells,
  RowCheckbox,
  type ReferenceCellsApi,
} from "./reference-selection-controls";
import {
  sumMonths,
  NO_CAMPAIGN,
  type MediaOceanPivot,
} from "../../lib/format/mediaocean-pivot";
import { referenceRowKey } from "../../lib/format/reference-copy";
import type { actualsTheme } from "../../lib/format/actuals-theme";

type Theme = ReturnType<typeof actualsTheme>;

/** Read-only money cell — em dash for empty, matching the total row's style. */
function cell(value: number | undefined) {
  return value ? Math.round(value).toLocaleString("en-CA") : "—";
}

export default function ActualsCampaignView({
  pivot,
  showNotes,
  colCount,
  theme,
  selection,
  expanded,
  onToggle,
  cells,
}: {
  /** buildMediaOceanPivot(actuals), owned by the grid. */
  pivot: MediaOceanPivot;
  showNotes: boolean;
  colCount: number;
  theme: Theme;
  /** Row-checkbox selection; undefined hides the checkboxes. */
  selection?: ReferenceSelection;
  /** Campaign rows expanded to show their channels (keyed by campaign key). */
  expanded: Set<string>;
  onToggle: (campaignKey: string) => void;
  /** The grid's cell-selection plumbing for the month cells. */
  cells: ReferenceCellsApi;
}) {
  if (pivot.byCampaign.length === 0) {
    return (
      <tr>
        <td colSpan={colCount} className={`px-8 py-2.5 text-xs ${theme.labelClass} ${theme.emptyRow}`}>
          No campaign detail to group.
        </td>
      </tr>
    );
  }

  return (
    <>
      {pivot.byCampaign.map((node) => {
        const isOpen = expanded.has(node.key);
        const isNoCampaign = node.label === NO_CAMPAIGN;
        const leaves = node.children.map((c) => leafKey(c.channelRowType, node.key));
        return (
          <Fragment key={node.key}>
            {/* Campaign row */}
            <tr className={`border-b border-gray-100 ${theme.rowBg}`}>
              <td className={`sticky left-0 z-10 ${theme.rowBg} px-4 py-2`}>
                <div className="flex items-center gap-1.5">
                  {selection && (
                    <RowCheckbox
                      selection={selection}
                      keys={leaves}
                      parent
                      label={node.label}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onToggle(node.key)}
                    title={isOpen ? "Collapse" : "Expand channels"}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-900 hover:opacity-70 transition-opacity"
                  >
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className={isNoCampaign ? "italic text-gray-500" : ""}>
                      {node.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      ({node.children.length})
                    </span>
                  </button>
                </div>
              </td>
              {showNotes && <td className={theme.rowBg} />}
              <ReferenceMonthCells
                rowKey={referenceRowKey.mediaocean(node.key)}
                months={node.months}
                cells={cells}
              />
              <td className="px-2.5 py-2 text-right align-middle bg-gray-50">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">
                  {cell(sumMonths(node.months))}
                </p>
              </td>
            </tr>

            {/* Channel children */}
            {isOpen &&
              node.children.map((child) => (
                <tr key={child.key} className="border-b border-gray-100 bg-white">
                  <td className="sticky left-0 z-10 bg-white px-4 py-1.5">
                    <div className="ml-6 flex items-center gap-1.5">
                      {selection && (
                        <RowCheckbox
                          selection={selection}
                          keys={[leafKey(child.channelRowType, node.key)]}
                          label={`${child.label} (${node.label})`}
                        />
                      )}
                      <span className="text-xs text-gray-600">{child.label}</span>
                    </div>
                  </td>
                  {showNotes && <td className="bg-white" />}
                  <ReferenceMonthCells
                    rowKey={referenceRowKey.mediaocean(node.key, child.key)}
                    months={child.months}
                    cells={cells}
                  />
                  <td className="px-2.5 py-1.5 text-right align-middle bg-gray-50">
                    <p className="text-xs text-gray-600 tabular-nums">
                      {cell(sumMonths(child.months))}
                    </p>
                  </td>
                </tr>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}