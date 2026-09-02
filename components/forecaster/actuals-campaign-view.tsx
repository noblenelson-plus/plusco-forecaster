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
 * to the channels it spans. Every campaign (except the "— No campaign —" bucket)
 * carries a copy-to-BL button; "Copy all to BL" lives in the section header. The
 * copy reuses pasteCampaign(s), which maps each channel to the BL media type and
 * overwrites the project by name — so it can't double-count, and it's undoable
 * through the grid's history like any edit.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MONTHS } from "../../lib/types/common.types";
import {
  buildMediaOceanPivot,
  sumMonths,
  NO_CAMPAIGN,
  type PivotNode,
} from "../../lib/format/mediaocean-pivot";
import { CopyCampaignButton, type BlPasteApi, type CampaignCopySource } from "./bl-paste-target";
import type { ForecastRow } from "../../lib/types/forecaster.types";
import type { MonthlyMap } from "../../lib/types/common.types";
import type { actualsTheme } from "../../lib/format/actuals-theme";

type Theme = ReturnType<typeof actualsTheme>;

/** Read-only money cell — em dash for empty, matching the total row's style. */
function cell(value: number | undefined) {
  return value ? Math.round(value).toLocaleString("en-CA") : "—";
}

/** A pivot node → the copy payload: one entry per channel, keyed by the channel
 *  rowType value so the BL mapping is exact (no "not configured"). */
export function campaignSource(node: PivotNode): CampaignCopySource {
  return {
    name: node.label,
    types: node.children.map((c) => ({ label: c.channelRowType, byMonth: c.months })),
  };
}

export default function ActualsCampaignView({
  actuals,
  blPaste,
  showNotes,
  colCount,
  theme,
}: {
  actuals: ForecastRow[];
  blPaste?: BlPasteApi;
  showNotes: boolean;
  colCount: number;
  theme: Theme;
}) {
  const pivot = useMemo(() => buildMediaOceanPivot(actuals), [actuals]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

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
        return (
          <Fragment key={node.key}>
            {/* Campaign row */}
            <tr className={`border-b border-gray-100 ${theme.rowBg}`}>
              <td className={`sticky left-0 z-10 ${theme.rowBg} px-4 py-2`}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggle(node.key)}
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
                  {blPaste && !isNoCampaign && (
                    <CopyCampaignButton api={blPaste} campaign={campaignSource(node)} />
                  )}
                </div>
              </td>
              {showNotes && <td className={theme.rowBg} />}
              {MONTHS.map((m) => (
                <td key={m} className="px-2.5 py-2 text-right align-middle">
                  <p className="text-sm text-gray-700 tabular-nums">
                    {cell(node.months[m])}
                  </p>
                </td>
              ))}
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
                    <span className="ml-6 text-xs text-gray-600">{child.label}</span>
                  </td>
                  {showNotes && <td className="bg-white" />}
                  {MONTHS.map((m) => (
                    <td key={m} className="px-2.5 py-1.5 text-right align-middle">
                      <p className="text-xs text-gray-500 tabular-nums">
                        {cell((child.months as MonthlyMap)[m])}
                      </p>
                    </td>
                  ))}
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