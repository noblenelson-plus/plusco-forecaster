// lib/app-zoom.ts

/**
 * App-wide zoom. Lets users on high OS/browser display-scaling (where the
 * layout gets cramped and overflows) shrink the whole UI to fit, independent
 * of the browser's own zoom. Implemented with the CSS `zoom` property on the
 * document root — it reflows the layout (unlike `transform: scale`, which would
 * leave blank space and break scrolling). The preference persists in
 * localStorage under ZOOM_KEY and is re-applied on load by an inline script in
 * the root layout (to avoid a flash of unzoomed content).
 */

export const ZOOM_KEY = "app-zoom";
export const ZOOM_MIN = 60;
export const ZOOM_MAX = 120;
export const ZOOM_STEP = 10;
/**
 * Zoom applied when the user hasn't chosen one. Many colleagues run their OS
 * at high display scaling, which crops the layout, so the app opens slightly
 * zoomed out to fit more on screen. A user's explicit choice (persisted in
 * localStorage) always wins — including picking 100% (ZOOM_NEUTRAL), which is
 * why the control stores every value rather than clearing at the default.
 */
export const ZOOM_DEFAULT = 80;
/** Native size — the zoom at which no CSS `zoom` override is applied. */
export const ZOOM_NEUTRAL = 100;

/** Clamp to the allowed range and snap to the nearest step. */
export function clampZoom(percent: number): number {
  const snapped = Math.round(percent / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped));
}

/** Read the stored zoom, falling back to ZOOM_DEFAULT when nothing is saved. */
export function readStoredZoom(): number {
  if (typeof localStorage === "undefined") return ZOOM_DEFAULT;
  const raw = Number(localStorage.getItem(ZOOM_KEY));
  return raw ? clampZoom(raw) : ZOOM_DEFAULT;
}

/**
 * Apply a zoom percentage to the document root; ZOOM_NEUTRAL (100%) removes the
 * override. Also exposes the factor as the `--app-zoom` CSS variable: CSS `zoom`
 * scales `vh` units too, so full-viewport-height boxes (the app shell, the
 * sidebar, the forecast grids) must divide their height by this factor to still
 * cover the real viewport — otherwise a `zoom < 1` leaves a blank strip at the
 * bottom. See the `calc(100vh/var(--app-zoom,1))` heights across the app.
 */
export function applyZoom(percent: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (percent === ZOOM_NEUTRAL) {
    root.style.removeProperty("zoom");
    root.style.removeProperty("--app-zoom");
  } else {
    const factor = percent / 100;
    root.style.setProperty("zoom", String(factor));
    root.style.setProperty("--app-zoom", String(factor));
  }
}
