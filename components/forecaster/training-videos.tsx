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
 */

import { useSyncExternalStore } from "react";
import { PlayCircle } from "lucide-react";

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

// Listed in learning order: start with onboarding, end with validation.
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

export default function TrainingVideos() {
  const lang = useSyncExternalStore(subscribeLang, readLang, (): Lang => "en");
  const choose = saveLang;

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {TRAINING_VIDEOS.map((v) => (
          <article key={v.id} className="border border-gray-200 bg-white">
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
              <span className="flex-shrink-0 bg-gray-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                {v.length[lang]}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
