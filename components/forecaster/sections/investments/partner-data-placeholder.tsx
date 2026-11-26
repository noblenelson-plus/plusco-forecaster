// components/forecaster/sections/investments/partner-data-placeholder.tsx

/**
 * Exec KPI Dashboard → Partner Data. Placeholder until partner-reported data
 * (delivery / spend from the media partners themselves) is added to the pipeline.
 */

import { Database } from "lucide-react";

export default function PartnerDataPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 px-6 py-20 text-center">
      <Database size={28} className="text-primary" />
      <h2 className="text-lg font-semibold text-foreground">Partner Data — coming soon</h2>
      <p className="max-w-xl text-sm text-muted-foreground">
        This page will show the data our media partners report directly, side by side with what we booked in Mediaocean. It
        appears here as soon as that data is added to the pipeline.
      </p>
    </div>
  );
}
