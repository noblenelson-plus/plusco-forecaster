// app/(protected)/how-to/page.tsx
"use client";

/**
 * How-to page — the user guide, reachable from the main sidebar. The guide
 * itself lives in components/forecaster/how-to-guide.tsx; its "jump to a tab"
 * actions deep-link into the forecast page via the ?tab= query parameter.
 */

import { useRouter } from "next/navigation";
import HowToGuide from "../../../components/forecaster/how-to-guide";
import PageHeader from "../../../components/_shared/page-header";

export default function HowToPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="How to"
        description="Step-by-step guide to forecasting in PlusCo Forecaster."
      />
      <div className="p-6 max-w-7xl mx-auto">
        <HowToGuide onJump={(tab) => router.push(`/forecast?tab=${tab}`)} />
      </div>
    </div>
  );
}
