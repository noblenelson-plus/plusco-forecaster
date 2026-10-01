// components/forecaster/sections/labs-pacing-page.tsx
"use client";

/**
 * Labs Pacing — target vs booked, then pacing with the GM-pod breakdown. One
 * page shown in two places: its own top-level dashboard tab (every role, over
 * their accessible clients) and the Exec KPI Dashboard's "Labs Pacing" sub-tab.
 */

import LabsPacingSection from "./labs-pacing-section";
import LabsTargetVsBookedSection from "./labs-target-vs-booked-section";
import type { Currency } from "../../../lib/types/client.types";

export default function LabsPacingPage({
  scopedClientIds,
  currencyByClient,
  usdToCad,
}: {
  scopedClientIds: string[];
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
}) {
  return (
    <div className="space-y-8">
      <LabsTargetVsBookedSection
        scopedClientIds={scopedClientIds}
        currencyByClient={currencyByClient}
        usdToCad={usdToCad}
      />
      <LabsPacingSection
        scopedClientIds={scopedClientIds}
        currencyByClient={currencyByClient}
        usdToCad={usdToCad}
        showPodBreakdown
      />
    </div>
  );
}
