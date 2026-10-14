// components/forecaster/actuals-campaign-view.tsx
"use client";

/**
 * Read-only pivot rows of the MediaOcean (pink) actuals strip. Two uses:
 *   - the Campaign → Channel view of the edited year (the inverted orientation
 *     of the editable channel view — editing stays there, where the source
 *     detail lines live);
 *   - either orientation of ANOTHER year's MediaOcean (the reference-year
 *     peek), which is never editable.
 *
 * Rows come from buildMediaOceanPivot(actuals): `byCampaign` (each campaign
 * expands to the channels it spans) or `byChannel` (each channel expands to its
 * campaigns — the MIR estimates). Every row carries a checkbox for the "Copy to
 * my submission" selection (a parent ticks all its children); leaf keys are the
 * same (channel × campaign) atoms the editable channel view uses. Month cells
 * join the grid's cell selection (select + Ctrl/Cmd+C, read-only); the grid
 * owns the pivot and the expanded set, since it orders that selection model.
 */

import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  leafKey,
  type ReferenceOrientation,
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
  type PivotNode,
} from "../../lib/format/mediaocean-pivot";
import type { actualsTheme } from "../../lib/format/actuals-theme";

type Theme = ReturnType<typeof actualsTheme>;

/** Read-only money cell — em dash for empty, matching the total row's style. */
function cell(value: number | undefined) {
  return value ? Math.round(value).toLocaleString("en-CA") : "—";
}

export default function ActualsCampaignView({
  nodes,
  orientation,
  rowKey,
  showNotes,
  colCount,
  theme,
  selection,
  expanded,
  onToggle,
  cells,
}: {
  /** buildMediaOceanPivot(actuals).byCampaign or .byChannel, owned by the grid. */
  nodes: PivotNode[];
  /** Which pivot `nodes` is: parents are campaigns, or channels. */
  orientation: ReferenceOrientation;
  /** Selection-model key of a parent row, or of one of its children. */
  rowKey: (parentKey: string, childKey?: string) => string;
  showNotes: boolean;
  colCount: number;
  theme: Theme;
  /** Row-checkbox selection; undefined hides the checkboxes. */
  selection?: ReferenceSelection;
  /** Parent rows expanded to show their children (keyed by parent key). */
  expanded: Set<string>;
  onToggle: (parentKey: string) => void;
  /** The grid's cell-selection plumbing for the month cells. */
  cells: ReferenceCellsApi;
}) {
  if (nodes.length === 0) {
    return (
      <tr>
        <td colSpan={colCount} className={`px-8 py-2.5 text-xs ${theme.labelClass} ${theme.emptyRow}`}>
          No campaign detail to group.
        </td>
      </tr>
    );
  }

  const byCampaign = orientation === "campaign";

  return (
    <>
      {nodes.map((node) => {
        // The campaign half of a child's (channel × campaign) atom.
        const campaignOf = (childKey: string) => (byCampaign ? node.key : childKey);
        // A channel with no campaign lines only has a lone NO_CAMPAIGN child —
        // nothing worth expanding to.
        const expandable =
          byCampaign || node.children.some((c) => c.label !== NO_CAMPAIGN);
        const isOpen = expandable && expanded.has(node.key);
        const isNoCampaign = node.label === NO_CAMPAIGN;
        const leaves = node.children.map((c) =>
          leafKey(c.channelRowType, campaignOf(c.key))
        );
        return (
          <Fragment key={node.key}>
            {/* Parent row (a campaign, or a channel) */}
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
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => onToggle(node.key)}
                      title={
                        isOpen
                          ? "Collapse"
                          : byCampaign
                            ? "Expand channels"
                            : "Expand campaigns"
                      }
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
                  ) : (
                    <span className="pl-[18px] text-xs font-medium text-gray-900">
                      {node.label}
                    </span>
                  )}
                </div>
              </td>
              {showNotes && <td className={theme.rowBg} />}
              <ReferenceMonthCells
                rowKey={rowKey(node.key)}
                months={node.months}
                cells={cells}
              />
              <td className="px-2.5 py-2 text-right align-middle bg-gray-50">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">
                  {cell(sumMonths(node.months))}
                </p>
              </td>
            </tr>

            {/* Children (channels of a campaign, or campaigns of a channel) */}
            {isOpen &&
              node.children.map((child) => (
                <tr key={child.key} className="border-b border-gray-100 bg-white">
                  <td className="sticky left-0 z-10 bg-white px-4 py-1.5">
                    <div className="ml-6 flex items-center gap-1.5">
                      {selection && (
                        <RowCheckbox
                          selection={selection}
                          keys={[leafKey(child.channelRowType, campaignOf(child.key))]}
                          label={`${child.label} (${node.label})`}
                        />
                      )}
                      <span
                        className={`text-xs ${
                          child.label === NO_CAMPAIGN ? "italic text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {child.label}
                      </span>
                    </div>
                  </td>
                  {showNotes && <td className="bg-white" />}
                  <ReferenceMonthCells
                    rowKey={rowKey(node.key, child.key)}
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
