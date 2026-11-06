// app/(protected)/how-to/page.tsx
"use client";

/**
 * How-to page — the user guide, reachable from the main sidebar. Narrated
 * training videos (EN / FR) sit on top (training-videos.tsx); the guide itself
 * lives in components/forecaster/how-to-guide.tsx and its "jump to a tab"
 * actions deep-link into the forecast page via the ?tab= query parameter.
 */

import { useRouter } from "next/navigation";
import HowToGuide from "../../../components/forecaster/how-to-guide";
import TrainingVideos from "../../../components/forecaster/training-videos";
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
        <TrainingVideos />
        <HowToGuide onJump={(tab) => router.push(`/forecast?tab=${tab}`)} />
      </div>
    </div>
  );
}
