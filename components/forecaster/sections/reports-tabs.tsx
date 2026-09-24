// components/forecaster/sections/reports-tabs.tsx
"use client";

/**
 * Reports — sub-tab container. Groups the two data-export pages that replace
 * Looker's export function under a single top-level tab:
 *   MIR Raw Data · Billing Summary
 *
 * Self-contained: the active sub-tab is local state (like ExecKpisTabs), since
 * neither section needs props and the parent doesn't depend on which sub-page
 * is open. Both sections keep their own internal filters + export controls
 * untouched. The dashboard's global filter bar renders above this from
 * page.tsx, exactly as it did when these were two separate top-level tabs.
 */

import { useState } from "react";
import MirRawSection from "./mir-raw-section";
import BillingSummarySection from "./billing-summary-section";
import {
  REPORTS_SUBTABS,
  visibleSubtabs,
  type ReportsSubTab,
} from "../dashboard-pages.config";

const NO_HIDDEN: ReadonlySet<string> = new Set();

export default function ReportsTabs({
  hidden = NO_HIDDEN,
}: {
  /** Page ids hidden by an admin (Admin → Dashboard Pages). */
  hidden?: ReadonlySet<string>;
}) {
  const [sub, setSub] = useState<ReportsSubTab>("mir-raw");
  const subtabs = visibleSubtabs("reports", REPORTS_SUBTABS, hidden);
  // If an admin hid the chosen sub-tab, show the first visible one instead.
  const active = subtabs.some((t) => t.id === sub) ? sub : (subtabs[0]?.id ?? sub);

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — matches the Executive KPIs / MediaOcean sub-tab strip. */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {subtabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
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

      {/* Active sub-page — each keeps its own filters and export controls. */}
      {active === "mir-raw" && <MirRawSection />}
      {active === "billing" && <BillingSummarySection />}
    </div>
  );
}
