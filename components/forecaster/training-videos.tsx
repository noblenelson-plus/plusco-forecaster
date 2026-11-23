// components/forecaster/training-videos.tsx
"use client";

/**
 * Training videos on the How to page — narrated walkthroughs with an EN / FR
 * toggle (most users are French). Each language is its own MP4 with the
 * captions burned in, served from `public/training/` (same origin as the app,
 * so networks that block Firebase Storage still play them).
 *
 * The language defaults to the browser's (French → FR) and the viewer's choice
 * is remembered in localStorage (a per-viewer convenience; safe to lose).
 * Add a video by adding an entry to TRAINING_VIDEOS and its files under
 * public/training/ (built in the plusco-training repo folder).
 *
 * Who sees what (lib/format/training-videos.ts): the forecast videos go to
 * people who open the team spaces; the dashboard overview comes in one video
 * per access level, and each person gets the one matching their tabs. Those
 * show real dashboard data, so their file names are not in this code: they
 * come from config/training_videos, readable only after sign-in.
 *
 * Shareable links: /how-to?video=<id>&lang=<en|fr> scrolls to that video and
 * highlights it, in that language (for this visit only — the viewer's saved
 * choice is untouched). Each card has a "Copy link" button. Signed-out people
 * come back to the link after sign-in (lib/format/return-to.ts). A link to a
 * video the person can't see shows a short note instead.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, Link2, PlayCircle } from "lucide-react";
import { useAccess } from "../../lib/hooks/use-access";
import { dashboardVideoLevels, seesForecastVideos, type DashboardVideoLevel } from "../../lib/format/training-videos";
import { fetchDashboardVideoFiles, type DashboardVideoFiles } from "../../lib/services/training-video-service";

type Lang = "en" | "fr";

interface TrainingVideo {
  id: string;
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

// Dashboard overview: titles here, files from config/training_videos.
const DASHBOARD_VIDEO_TEXT: Record<DashboardVideoLevel, { title: Record<Lang, string>; summary: Record<Lang, string> }> = {
  agency: {
    title: { en: "Dashboard overview", fr: "Aperçu du tableau de bord" },
    summary: {
      en: "Filters, Media Investments, Labs Pacing and Reports.",
      fr: "Filtres, Media Investments, Labs Pacing et Reports.",
    },
  },
  leads: {
    title: { en: "Dashboard overview for business and digital leads", fr: "Aperçu du tableau de bord : business et digital leads" },
    summary: {
      en: "Filters, the Forecaster tab, Media Investments, Labs Pacing and Reports.",
      fr: "Filtres, onglet Forecaster, Media Investments, Labs Pacing et Reports.",
    },
  },
  leadership: {
    title: { en: "Dashboard overview for leadership", fr: "Aperçu du tableau de bord : direction" },
    summary: {
      en: "Every tab, including Exec KPI and MediaBox Adoption.",
      fr: "Tous les onglets, y compris Exec KPI et MediaBox Adoption.",
    },
  },
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

export default function TrainingVideos() {
  const savedLang = useSyncExternalStore(subscribeLang, readLang, (): Lang => "en");
  // A link's ?lang= wins for this visit, until the viewer flips the toggle.
  const [ignoreLinkLang, setIgnoreLinkLang] = useState(false);
  const choose = (l: Lang) => {
    setIgnoreLinkLang(true);
    saveLang(l);
  };
  const { ctx, hasTeamSpaces, openTabs, loading } = useAccess();

  const audience = { isAdmin: ctx.isAdmin, hasTeamSpaces, openTabs };
  const forecast = !loading && seesForecastVideos(audience);
  const levelsKey = loading ? "" : dashboardVideoLevels(audience).join(",");

  // The video a shared link points to, and its language.
  const search = useSyncExternalStore(subscribeNothing, () => window.location.search, () => "");
  const linkParams = useMemo(() => new URLSearchParams(search), [search]);
  const linkedId = linkParams.get(VIDEO_PARAM);
  const rawLinkLang = linkParams.get(LANG_PARAM);
  const linkLang: Lang | null = rawLinkLang === "en" || rawLinkLang === "fr" ? rawLinkLang : null;
  const lang = (!ignoreLinkLang && linkLang) || savedLang;

  // The private dashboard files, fetched once the person's levels are known.
  const [files, setFiles] = useState<DashboardVideoFiles>({});
  const [filesSettled, setFilesSettled] = useState(false);
  useEffect(() => {
    if (!levelsKey) return;
    let cancelled = false;
    fetchDashboardVideoFiles()
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
  }, [levelsKey]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  async function copyLink(id: string) {
    const key = `${id}-${lang}`;
    try {
      await navigator.clipboard.writeText(videoLink(id, lang));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch (err) {
      console.error("Failed to copy the video link: ", err);
    }
  }

  const videos: TrainingVideo[] = useMemo(() => {
    const levels = levelsKey ? (levelsKey.split(",") as DashboardVideoLevel[]) : [];
    const dashboard = levels.flatMap((level): TrainingVideo[] => {
      const f = files[level];
      if (!f) return [];
      return [{
        id: `dashboard-${level}`,
        ...DASHBOARD_VIDEO_TEXT[level],
        length: { en: f.en.length, fr: f.fr.length },
        src: { en: f.en.src, fr: f.fr.src },
        poster: { en: f.en.poster, fr: f.fr.poster },
      }];
    });
    return [...(forecast ? TRAINING_VIDEOS : []), ...dashboard];
  }, [forecast, levelsKey, files]);

  // Scroll to the linked video once it's on the page (dashboard videos arrive
  // after a fetch), once per visit.
  const linkedFound = linkedId != null && videos.some((v) => v.id === linkedId);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!linkedFound || scrolledRef.current) return;
    scrolledRef.current = true;
    document.getElementById(`video-${linkedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [linkedFound, linkedId]);

  // Everything this person can see is loaded, and the linked video isn't there.
  const listSettled = !loading && (!levelsKey || filesSettled);
  const linkedMissing = linkedId != null && listSettled && !linkedFound;

  if (videos.length === 0 && !linkedMissing) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b-2 border-gray-900 pb-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-gray-900 text-yellow-400">
            <PlayCircle size={18} />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight text-gray-900">
              {lang === "fr" ? "Vidéos de formation" : "Training videos"}
            </h2>
            <p className="text-xs text-gray-500">
              {lang === "fr"
                ? "Courtes démonstrations narrées, sous-titrées."
                : "Short narrated walkthroughs, with captions."}
            </p>
          </div>
        </div>
        <div role="group" aria-label="Video language" className="flex border border-gray-900">
          {(["en", "fr"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => choose(l)}
              aria-pressed={lang === l}
              className={`px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${
                lang === l ? "bg-gray-900 text-yellow-400" : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {l === "en" ? "EN · English" : "FR · Français"}
            </button>
          ))}
        </div>
      </div>

      {linkedMissing && (
        <p className="mb-4 bg-yellow-400 px-4 py-3 text-sm text-gray-900">
          {lang === "fr"
            ? "La vidéo de ce lien n’est pas disponible avec votre accès."
            : "The video in this link isn’t available with your access."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {videos.map((v) => (
          <article
            key={v.id}
            id={`video-${v.id}`}
            className={`bg-white ${
              v.id === linkedId ? "border-2 border-yellow-400" : "border border-gray-200"
            }`}
          >
            {/* key={lang}: switching language loads the other file from the start. */}
            <video
              key={`${v.id}-${lang}`}
              controls
              preload="metadata"
              poster={v.poster[lang]}
              className="block aspect-video w-full bg-black"
            >
              <source src={v.src[lang]} type="video/mp4" />
            </video>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <h3 className="font-semibold text-gray-900">{v.title[lang]}</h3>
                <p className="mt-0.5 text-sm text-gray-500">{v.summary[lang]}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                <span className="bg-gray-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                  {v.length[lang]}
                </span>
                <button
                  type="button"
                  onClick={() => copyLink(v.id)}
                  title={
                    lang === "fr"
                      ? "Copier un lien vers cette vidéo (en français), à partager par courriel ou dans une présentation"
                      : "Copy a link to this video (in English) to share in an email or a deck"
                  }
                  className="flex items-center gap-1 border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {copiedKey === `${v.id}-${lang}` ? <Check size={12} /> : <Link2 size={12} />}
                  {copiedKey === `${v.id}-${lang}`
                    ? lang === "fr" ? "Lien copié" : "Link copied"
                    : lang === "fr" ? "Copier le lien" : "Copy link"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
