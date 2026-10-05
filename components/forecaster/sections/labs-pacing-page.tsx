// components/forecaster/sections/labs-pacing-page.tsx
"use client";

/**
 * Labs Pacing — target vs booked, then pacing with the GM-pod breakdown. One
 * page shown in two places: its own top-level dashboard tab (every role, over
 * their accessible clients) and the Exec KPI Dashboard's "Deal Pacing" sub-tab.
 *
 * The GM-level sections (Target vs Booked by Partner, By GM Pod) belong to
 * Exec/Admin only: the top-level tab, open to every role, passes
 * `showGmSections={false}` and keeps the partner/client pacing alone.
 */

import LabsPacingSection from "./labs-pacing-section";
import LabsTargetVsBookedSection from "./labs-target-vs-booked-section";
import type { Currency } from "../../../lib/types/client.types";

export default function LabsPacingPage({
  scopedClientIds,
  currencyByClient,
  usdToCad,
  showGmSections = true,
}: {
  scopedClientIds: string[];
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  /** Target vs Booked by Partner + the By GM Pod cards (Exec KPI only). */
  showGmSections?: boolean;
}) {
  return (
    <div className="space-y-8">
      {showGmSections && (
        <LabsTargetVsBookedSection
          scopedClientIds={scopedClientIds}
          currencyByClient={currencyByClient}
          usdToCad={usdToCad}
        />
      )}
      <LabsPacingSection
        scopedClientIds={scopedClientIds}
        currencyByClient={currencyByClient}
        usdToCad={usdToCad}
        showPodBreakdown={showGmSections}
      />
    </div>
  );
}
