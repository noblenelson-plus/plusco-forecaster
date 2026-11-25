// components/forecaster/training-videos.tsx
"use client";

/**
 * Training videos on the How to page — narrated walkthroughs with an EN / FR
 * toggle (most users are French). Each language is its own MP4 with the
 * captions burned in, served from `public/training/` (same origin as the app,
 * so networks that block Firebase Storage still play them).
 *
 * The videos live in the guide's menu, under "Video tutorials" (Adriana,
 * 2026-11-24: the grid of players took too much room): `useTrainingVideos`
 * says which videos the person gets, the guide lists them, and
 * `TrainingVideoPlayer` plays the one picked in the guide's content column.
 *
 * The language defaults to the browser's (French → FR) and the viewer's choice
 * is remembered in localStorage (a per-viewer convenience; safe to lose).
 * Add a video by adding an entry to TRAINING_VIDEOS and its files under
 * public/training/ (built in the plusco-training repo folder).
 *
 * Who sees what (lib/format/training-videos.ts): the forecast videos go to
 * people who open the team spaces; the dashboard has one video per dashboard,
 * shown to the people who can open that dashboard. Those show real dashboard
 * data, so their file names are not in this code: they come from
 * config/training_videos, readable only after sign-in.
 *
 * Shareable links: /how-to?video=<id>&lang=<en|fr> opens that video, in that
 * language (for this visit only — the viewer's saved choice is untouched).
 * Each video has a "Copy link" button. Signed-out people come back to the link
 * after sign-in (lib/format/return-to.ts). A link to a video the person can't
 * see shows a short note instead.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Link2 } from "lucide-react";
import { useAccess } from "../../lib/hooks/use-access";
import { dashboardVideoIds, seesForecastVideos, type DashboardVideoId } from "../../lib/format/training-videos";
import {
  fetchPrivateVideoFiles,
  type PrivateForecastVideoId,
  type PrivateVideoFiles,
} from "../../lib/services/training-video-service";

export type Lang = "en" | "fr";

export interface TrainingVideo {
  id: string;
  /** "forecast" or "dashboard" — the menu group it's listed under. */
  kind: "forecast" | "dashboard";
  title: Record<Lang, string>;
  summary: Record<Lang, string>;
  /** Duration label, e.g. "2:33". */
  length: Record<Lang, string>;
  src: Record<Lang, string>;
  poster: Record<Lang, string>;
}

// Forecast videos, in learning order: start with onboarding, end with validation.
const TRAINING_VIDEOS: TrainingVideo[] = [
  {
    id: "forecaster-onboarding",
    kind: "forecast",
    title: { en: "Forecaster onboarding", fr: "Prise en main du Forecaster" },
    summary: {
      en: "Your forecast page, section by section: selectors, tabs, the grid, reference data and more.",
      fr: "Votre page de prévision, section par section : sélecteurs, onglets, grille, données de référence et plus.",
    },
    length: { en: "3:09", fr: "3:20" },
    src: { en: "/training/forecaster-onboarding-en.mp4", fr: "/training/forecaster-onboarding-fr.mp4" },
    poster: { en: "/training/forecaster-onboarding-en.jpg", fr: "/training/forecaster-onboarding-fr.jpg" },
  },
  {
    id: "copy-paste",
    kind: "forecast",
    title: { en: "Copy and paste", fr: "Copier-coller" },
    summary: {
      en: "Five ways to fill your forecast faster: bookings, another year, one line, Media to Labs, Product.",
      fr: "Cinq façons de remplir votre prévision plus vite : réservations, autre année, une ligne, Média vers Labs, Product.",
    },
    length: { en: "2:27", fr: "2:36" },
    src: { en: "/training/copy-paste-en.mp4", fr: "/training/copy-paste-fr.mp4" },
    poster: { en: "/training/copy-paste-en.jpg", fr: "/training/copy-paste-fr.jpg" },
  },
  {
    id: "google-sheets",
    kind: "forecast",
    title: { en: "Working with Google Sheets", fr: "Travailler avec Google Sheets" },
    summary: {
      en: "Export, edit with your team, import back, and start a new RFQ from the previous one.",
      fr: "Exportez, modifiez en équipe, réimportez, et démarrez un nouveau RFQ à partir du précédent.",
    },
    length: { en: "2:11", fr: "2:15" },
    src: { en: "/training/google-sheets-en.mp4", fr: "/training/google-sheets-fr.mp4" },
    poster: { en: "/training/google-sheets-en.jpg", fr: "/training/google-sheets-fr.jpg" },
  },
  {
    id: "flags-overview",
    kind: "forecast",
    title: { en: "Overview of automated flags", fr: "Aperçu des signalements automatiques" },
    summary: {
      en: "Validate your forecast, resolve its flags and get your milestone to green.",
      fr: "Validez votre prévision, traitez ses signalements et faites passer votre jalon au vert.",
    },
    length: { en: "2:33", fr: "2:45" },
    src: { en: "/training/flags-overview-en.mp4", fr: "/training/flags-overview-fr.mp4" },
    poster: { en: "/training/flags-overview-en.jpg", fr: "/training/flags-overview-fr.jpg" },
  },
];

// Forecast videos that show (masked) real data: titles here, files from
// config/training_videos. Listed after the public ones, in this order.
const PRIVATE_FORECAST_TEXT: Record<PrivateForecastVideoId, { title: Record<Lang, string>; summary: Record<Lang, string> }> = {
  milestones: {
    title: { en: "The Milestones page", fr: "La page Milestones" },
    summary: {
      en: "Follow your clients' validation: statuses, Milestones by client, flag insights and every justification.",
      fr: "Suivez la validation de vos clients : statuts, Milestones by client, analyse des signalements et chaque justification.",
    },
  },
};

// One video per dashboard: titles here, files from config/training_videos.
const DASHBOARD_VIDEO_TEXT: Record<DashboardVideoId, { title: Record<Lang, string>; summary: Record<Lang, string> }> = {
  forecaster: {
    title: { en: "Forecaster Dashboard", fr: "Tableau de bord Forecaster" },
    summary: {
      en: "Your clients' forecasts: Forecast Summary, Media, Labs, Revenues, Product and the Flags list.",
      fr: "Les prévisions de vos clients : Forecast Summary, Media, Labs, Revenues, Product et la liste des signalements.",
    },
  },
  "labs-pacing": {
    title: { en: "Labs Pacing", fr: "Labs Pacing" },
    summary: {
      en: "MediaOcean bookings against each Labs partner's target, by partner and by client.",
      fr: "Les réservations MediaOcean par rapport à la cible de chaque partenaire Labs, par partenaire et par client.",
    },
  },
  "exec-kpis": {
    title: { en: "Exec KPI Dashboard", fr: "Tableau de bord Exec KPI" },
    summary: {
      en: "Media and Labs KPI goals by GM and client, month pacing, and Deal Pacing.",
      fr: "Objectifs KPI Média et Labs par DG et par client, rythme par mois, et Deal Pacing.",
    },
  },
  mediaocean: {
    title: { en: "Media Investments Report + Raw Data Download", fr: "Media Investments Report + Raw Data Download" },
    summary: {
      en: "Booked investment, top partners, KPIs, the MediaBox Planner view and the raw data reports.",
      fr: "Investissement réservé, principaux partenaires, KPI, vue MediaBox Planner et rapports de données brutes.",
    },
  },
  mediabox: {
    title: { en: "MediaBox Adoption", fr: "MediaBox Adoption" },
    summary: {
      en: "How much of the forecast spend is entered in MediaBox, and the largest gaps.",
      fr: "La part des dépenses prévues saisie dans MediaBox, et les plus grands écarts.",
    },
  },
};

/** Links shared before the per-dashboard split point to the closest new video. */
const OLD_VIDEO_IDS: Record<string, string> = {
  "dashboard-agency": "dashboard-mediaocean",
  "dashboard-leads": "dashboard-forecaster",
  "dashboard-leadership": "dashboard-exec-kpis",
};

// ─── Language preference (external store: localStorage + in-memory fallback) ──
// Read through useSyncExternalStore so the server render ("en") and the first
// client render agree, then the stored / browser language takes over.
const LANG_KEY = "training-video-lang";
const LANG_EVENT = "training-video-lang-change";
let memoryLang: Lang | null = null; // used when localStorage is unavailable

function readLang(): Lang {
  if (memoryLang) return memoryLang;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "fr") return saved;
  } catch {
    // Storage unavailable (private window, blocked site data) — fall through.
  }
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function subscribeLang(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(LANG_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LANG_EVENT, onChange);
  };
}

function saveLang(l: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, l);
    memoryLang = null;
  } catch {
    memoryLang = l; // not persisted — the toggle still works for this visit
  }
  window.dispatchEvent(new Event(LANG_EVENT));
}

/** The query string doesn't change while the How to page is open. */
const subscribeNothing = () => () => {};

/** Query parameters of a shareable video link. */
const VIDEO_PARAM = "video";
const LANG_PARAM = "lang";

/** The full shareable URL of one video in one language. */
function videoLink(id: string, l: Lang): string {
  const params = new URLSearchParams({ [VIDEO_PARAM]: id, [LANG_PARAM]: l });
  return `${window.location.origin}/how-to?${params.toString()}`;
}

export interface TrainingVideosState {
  videos: TrainingVideo[];
  lang: Lang;
  chooseLang: (l: Lang) => void;
  /** The video a shared link points to (once it's in the list), else null. */
  linkedId: string | null;
  /** A shared link points to a video this person can't see. */
  linkedMissing: boolean;
}

/** The videos this person gets, the language, and the shared link's target. */
export function useTrainingVideos(): TrainingVideosState {
  const savedLang = useSyncExternalStore(subscribeLang, readLang, (): Lang => "en");
  // A link's ?lang= wins for this visit, until the viewer flips the toggle.
  const [ignoreLinkLang, setIgnoreLinkLang] = useState(false);
  const chooseLang = (l: Lang) => {
    setIgnoreLinkLang(true);
    saveLang(l);
  };
  const { ctx, hasTeamSpaces, openTabs, loading } = useAccess();

  const audience = { isAdmin: ctx.isAdmin, hasTeamSpaces, openTabs };
  const forecast = !loading && seesForecastVideos(audience);
  const idsKey = loading ? "" : dashboardVideoIds(audience).join(",");

  // The video a shared link points to, and its language.
  const search = useSyncExternalStore(subscribeNothing, () => window.location.search, () => "");
  const linkParams = useMemo(() => new URLSearchParams(search), [search]);
  const rawLinkedId = linkParams.get(VIDEO_PARAM);
  const wantedId = rawLinkedId ? (OLD_VIDEO_IDS[rawLinkedId] ?? rawLinkedId) : null;
  const rawLinkLang = linkParams.get(LANG_PARAM);
  const linkLang: Lang | null = rawLinkLang === "en" || rawLinkLang === "fr" ? rawLinkLang : null;
  const lang = (!ignoreLinkLang && linkLang) || savedLang;

  // The private files, fetched once the person's videos are known.
  const [files, setFiles] = useState<PrivateVideoFiles>({ dashboard: {}, forecast: {} });
  const [filesSettled, setFilesSettled] = useState(false);
  const needsFiles = forecast || idsKey !== "";
  useEffect(() => {
    if (!needsFiles) return;
    let cancelled = false;
    fetchPrivateVideoFiles()
      .then((f) => {
        if (!cancelled) setFiles(f);
      })
      .catch(() => {}) // not published yet / offline: just no dashboard videos
      .finally(() => {
        if (!cancelled) setFilesSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFiles]);

  const videos: TrainingVideo[] = useMemo(() => {
    const ids = idsKey ? (idsKey.split(",") as DashboardVideoId[]) : [];
    const dashboard = ids.flatMap((id): TrainingVideo[] => {
      const f = files.dashboard[id];
      if (!f) return [];
      return [{
        id: `dashboard-${id}`,
        kind: "dashboard",
        ...DASHBOARD_VIDEO_TEXT[id],
        length: { en: f.en.length, fr: f.fr.length },
        src: { en: f.en.src, fr: f.fr.src },
        poster: { en: f.en.poster, fr: f.fr.poster },
      }];
    });
    const privateForecast = (Object.keys(PRIVATE_FORECAST_TEXT) as PrivateForecastVideoId[]).flatMap((id): TrainingVideo[] => {
      const f = files.forecast[id];
      if (!f) return [];
      return [{
        id,
        kind: "forecast",
        ...PRIVATE_FORECAST_TEXT[id],
        length: { en: f.en.length, fr: f.fr.length },
        src: { en: f.en.src, fr: f.fr.src },
        poster: { en: f.en.poster, fr: f.fr.poster },
      }];
    });
    return [...(forecast ? [...TRAINING_VIDEOS, ...privateForecast] : []), ...dashboard];
  }, [forecast, idsKey, files]);

  const linkedFound = wantedId != null && videos.some((v) => v.id === wantedId);
  // Everything this person can see is loaded, and the linked video isn't there.
  const listSettled = !loading && (!needsFiles || filesSettled);
  const linkedMissing = wantedId != null && listSettled && !linkedFound;

  return { videos, lang, chooseLang, linkedId: linkedFound ? wantedId : null, linkedMissing };
}

/** The EN / FR switch. */
export function VideoLangToggle({ lang, onChoose }: { lang: Lang; onChoose: (l: Lang) => void }) {
  return (
    <div role="group" aria-label="Video language" className="flex border border-gray-900">
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChoose(l)}
          aria-pressed={lang === l}
          className={`px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${
            lang === l ? "bg-gray-900 text-yellow-400" : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          {l === "en" ? "EN · English" : "FR · Français"}
        </button>
      ))}
    </div>
  );
}

/** One video, full width of the guide's content column, with its language switch and link. */
export function TrainingVideoPlayer({
  video: v,
  lang,
  onChooseLang,
}: {
  video: TrainingVideo;
  lang: Lang;
  onChooseLang: (l: Lang) => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const key = `${v.id}-${lang}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(videoLink(v.id, lang));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch (err) {
      console.error("Failed to copy the video link: ", err);
    }
  }
  const copied = copiedKey === key;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-gray-700">{v.summary[lang]}</p>
        <VideoLangToggle lang={lang} onChoose={onChooseLang} />
      </div>
      {/* key: switching video or language loads the other file from the start. */}
      <video
        key={key}
        controls
        preload="metadata"
        poster={v.poster[lang]}
        className="block aspect-video w-full bg-black"
      >
        <source src={v.src[lang]} type="video/mp4" />
      </video>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-gray-500">
          {lang === "fr" ? "Narration et sous-titres" : "Narrated, with captions"} ·{" "}
          <span className="font-semibold tabular-nums text-gray-900">{v.length[lang]}</span>
        </span>
        <button
          type="button"
          onClick={copyLink}
          title={
            lang === "fr"
              ? "Copier un lien vers cette vidéo (en français), à partager par courriel ou dans une présentation"
              : "Copy a link to this video (in English) to share in an email or a deck"
          }
          className="flex items-center gap-1 border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          {copied ? <Check size={12} /> : <Link2 size={12} />}
          {copied ? (lang === "fr" ? "Lien copié" : "Link copied") : lang === "fr" ? "Copier le lien" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
