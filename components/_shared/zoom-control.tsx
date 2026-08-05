// components/_shared/zoom-control.tsx
"use client";

/**
 * App-wide zoom control (sidebar footer). Lets users whose display scaling makes
 * the layout overflow shrink the whole UI to fit. See lib/app-zoom.ts.
 */

import { useEffect, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import {
  ZOOM_KEY,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_DEFAULT,
  clampZoom,
  readStoredZoom,
  applyZoom,
} from "../../lib/app-zoom";

export default function ZoomControl({ collapsed = false }: { collapsed?: boolean }) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  // Sync the local state with whatever the inline root-layout script already
  // applied on load. The DOM is the source of truth; this only reflects it.
  useEffect(() => {
    setZoom(readStoredZoom());
  }, []);

  const set = (next: number) => {
    const clamped = clampZoom(next);
    setZoom(clamped);
    applyZoom(clamped);
    // Always persist — including the default and 100% — so an explicit choice
    // isn't re-overridden by ZOOM_DEFAULT on the next load.
    localStorage.setItem(ZOOM_KEY, String(clamped));
  };

  const atMin = zoom <= ZOOM_MIN;
  const atMax = zoom >= ZOOM_MAX;

  const iconBtn =
    "flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500";

  if (collapsed) {
    return (
      <div className="mb-1 flex flex-col items-center gap-0.5">
        <button
          onClick={() => set(zoom + ZOOM_STEP)}
          disabled={atMax}
          title="Zoom in"
          aria-label="Zoom in"
          className={`${iconBtn} h-7 w-7`}
        >
          <ZoomIn size={16} />
        </button>
        <span className="text-[10px] font-medium tabular-nums text-gray-400">{zoom}%</span>
        <button
          onClick={() => set(zoom - ZOOM_STEP)}
          disabled={atMin}
          title="Zoom out"
          aria-label="Zoom out"
          className={`${iconBtn} h-7 w-7`}
        >
          <ZoomOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-1 flex items-center gap-1 px-3 py-1.5">
      <button
        onClick={() => set(zoom - ZOOM_STEP)}
        disabled={atMin}
        title="Zoom out"
        aria-label="Zoom out"
        className={`${iconBtn} h-7 w-7 rounded-lg`}
      >
        <ZoomOut size={16} />
      </button>
      <span className="min-w-[3ch] text-center text-xs font-medium tabular-nums text-gray-500">
        {zoom}%
      </span>
      <button
        onClick={() => set(zoom + ZOOM_STEP)}
        disabled={atMax}
        title="Zoom in"
        aria-label="Zoom in"
        className={`${iconBtn} h-7 w-7 rounded-lg`}
      >
        <ZoomIn size={16} />
      </button>
      {zoom !== ZOOM_DEFAULT && (
        <button
          onClick={() => set(ZOOM_DEFAULT)}
          title={`Reset zoom to ${ZOOM_DEFAULT}%`}
          aria-label={`Reset zoom to ${ZOOM_DEFAULT}%`}
          className={`${iconBtn} ml-auto h-7 w-7 rounded-lg`}
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}
