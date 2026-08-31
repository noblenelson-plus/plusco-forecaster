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

type ReportsSubTab = "mir-raw" | "billing";

const SUBTABS: { id: ReportsSubTab; label: string }[] = [
  { id: "mir-raw", label: "Mediaocean Data (MIR)" },
  { id: "billing", label: "Mediaocean Billing Summary" },
];

export default function ReportsTabs() {
  const [sub, setSub] = useState<ReportsSubTab>("mir-raw");

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — matches the Executive KPIs / MediaOcean sub-tab strip. */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUBTABS.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
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
      {sub === "mir-raw" && <MirRawSection />}
      {sub === "billing" && <BillingSummarySection />}
    </div>
  );
}
