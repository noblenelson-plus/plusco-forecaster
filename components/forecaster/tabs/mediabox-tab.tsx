// components/forecaster/tabs/mediabox-tab.tsx
"use client";

/**
 * MediaBox Adoption tab — how much of the forecasted (BL) media spend is
 * actually entered in MediaBox, and where the two disagree the most. Always
 * scope-wide (the coverage story only makes sense across many clients), so this
 * tab ignores the client focus.
 */

import MediaboxCoverageSection from "../../dashboard/mediabox-coverage-section";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { ScopeMediaboxData } from "../../../lib/dashboard/data/use-scope-mediabox-totals";

export default function MediaboxTab({
  data,
  mediabox,
  clientNameById,
}: {
  data: ScopeForecastData;
  mediabox: ScopeMediaboxData;
  clientNameById: Record<string, string>;
}) {
  return (
    <div className="space-y-8">
      <MediaboxCoverageSection data={data} mediabox={mediabox} clientNameById={clientNameById} />
    </div>
  );
}
