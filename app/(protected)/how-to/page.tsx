// app/(protected)/how-to/page.tsx
"use client";

/**
 * How-to page — the user guide, reachable from the main sidebar. The guide
 * itself lives in components/forecaster/how-to-guide.tsx and its "jump to a
 * tab" actions deep-link into the forecast page via the ?tab= query parameter.
 *
 * Narrated training videos (EN / FR, training-videos.tsx) sit in the guide's
 * menu, first, under "Video tutorials" (forecast) and "Dashboard tutorials",
 * and play in the content column (Adriana, 2026-11-24: the grid of players took
 * too much room). A slim bar on top points newcomers to the first video. A
 * shared link (?video=<id>) opens that video.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, PlayCircle } from "lucide-react";
import HowToGuide, { type GuideExtraGroup } from "../../../components/forecaster/how-to-guide";
import {
  TrainingVideoPlayer,
  useTrainingVideos,
} from "../../../components/forecaster/training-videos";
import PageHeader from "../../../components/_shared/page-header";

/** Menu ids of the videos, kept apart from the chapter ids. */
const VIDEO_PREFIX = "video:";

export default function HowToPage() {
  const router = useRouter();
  const { videos, lang, chooseLang, linkedId, linkedMissing } = useTrainingVideos();

  // What's open: what the reader picked, else the shared link's video, else
  // the first chapter (the guide's own default).
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = picked ?? (linkedId ? `${VIDEO_PREFIX}${linkedId}` : undefined);

  const fr = lang === "fr";
  const forecastVideos = videos.filter((v) => v.kind === "forecast");
  const dashboardVideos = videos.filter((v) => v.kind === "dashboard");
  const groups: GuideExtraGroup[] = [
    {
      title: fr ? "Vidéos de formation" : "Video tutorials",
      items: forecastVideos.map((v) => ({
        id: `${VIDEO_PREFIX}${v.id}`,
        label: v.title[lang],
        meta: v.length[lang],
        icon: PlayCircle,
      })),
    },
    {
      title: fr ? "Tutoriels des tableaux de bord" : "Dashboard tutorials",
      items: dashboardVideos.map((v) => ({
        id: `${VIDEO_PREFIX}${v.id}`,
        label: v.title[lang],
        meta: v.length[lang],
        icon: LayoutDashboard,
      })),
    },
  ].filter((g) => g.items.length > 0);

  const first = videos[0];
  const openVideo = activeId?.startsWith(VIDEO_PREFIX) ?? false;

  return (
    <div>
      <PageHeader
        title="How to"
        description="Step-by-step guide to forecasting in PlusCo Forecaster."
      />
      <div className="p-6 max-w-7xl mx-auto">
        {linkedMissing && (
          <p className="mb-4 bg-yellow-400 px-4 py-3 text-sm text-gray-900">
            {fr
              ? "La vidéo de ce lien n’est pas disponible avec votre accès."
              : "The video in this link isn’t available with your access."}
          </p>
        )}

        {/* Newcomers: one slim line pointing to the videos (they're also first in the menu). */}
        {first && !openVideo && (
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 bg-gray-900 px-4 py-2.5 text-sm text-white">
            <PlayCircle size={18} className="flex-shrink-0 text-yellow-400" />
            <span className="font-semibold">{fr ? "Nouveau ici ?" : "New here?"}</span>
            <span className="text-gray-300">
              {fr
                ? `${videos.length} courtes vidéos narrées (EN / FR) dans le menu, sous « Vidéos de formation ».`
                : `${videos.length} short narrated videos (EN / FR) in the menu, under “Video tutorials”.`}
            </span>
            <button
              type="button"
              onClick={() => setPicked(`${VIDEO_PREFIX}${first.id}`)}
              className="ml-auto flex items-center gap-1.5 bg-yellow-400 px-3 py-1 text-xs font-bold text-gray-900 transition-colors hover:bg-yellow-300"
            >
              {fr ? "Commencer :" : "Start with:"} {first.title[lang]} · {first.length[lang]}
            </button>
          </div>
        )}

        <HowToGuide
          onJump={(tab) => router.push(`/forecast?tab=${tab}`)}
          extraGroups={groups}
          extraKicker={fr ? "Vidéo de formation" : "Video tutorial"}
          renderExtra={(id) => {
            const v = videos.find((x) => `${VIDEO_PREFIX}${x.id}` === id);
            return v ? <TrainingVideoPlayer video={v} lang={lang} onChooseLang={chooseLang} /> : null;
          }}
          activeId={activeId}
          onSelect={setPicked}
        />
      </div>
    </div>
  );
}
