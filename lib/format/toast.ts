// lib/format/toast.ts

/**
 * Fire a one-off message into the global forecast toast (mounted once as
 * <CopyToast/> on the forecast page). Used by actions that aren't a clipboard
 * copy — e.g. pasting a MediaBox / MediaOcean month into the BL Input — so they
 * get the same lightweight confirmation without their own toast plumbing.
 */

/** Event name the forecast toast listens to for free-form messages. */
export const FORECAST_TOAST_EVENT = "forecast-toast";

export type ForecastToastKind = "success" | "warning";

export interface ForecastToastDetail {
  message: string;
  kind: ForecastToastKind;
}

export function showForecastToast(
  message: string,
  kind: ForecastToastKind = "success"
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ForecastToastDetail>(FORECAST_TOAST_EVENT, {
      detail: { message, kind },
    })
  );
}
