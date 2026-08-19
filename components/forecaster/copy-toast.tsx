// components/forecaster/copy-toast.tsx
"use client";

/**
 * Tiny global toast for the forecast page. Two sources:
 *   — `forecast-cell-copied` — a read-only cell value was copied to the
 *     clipboard (dispatched by `copyCellValue`); rendered as "Copied {value}".
 *   — `forecast-toast` — a free-form action message (dispatched by
 *     `showForecastToast`), e.g. a MediaBox/MediaOcean month pasted into the BL.
 * Mounted once on the forecast page.
 */

import { useEffect, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { CELL_COPIED_EVENT } from "../../lib/format/copy-cell";
import {
  FORECAST_TOAST_EVENT,
  type ForecastToastDetail,
  type ForecastToastKind,
} from "../../lib/format/toast";

interface ToastState {
  message: string;
  kind: ForecastToastKind;
}

export default function CopyToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (state: ToastState, ms: number) => {
      setToast(state);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), ms);
    };
    const onCopy = (e: Event) =>
      show(
        { message: `Copied ${(e as CustomEvent<string>).detail}`, kind: "success" },
        1400
      );
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ForecastToastDetail>).detail;
      show(
        { message: detail.message, kind: detail.kind },
        detail.kind === "warning" ? 2600 : 1800
      );
    };
    window.addEventListener(CELL_COPIED_EVENT, onCopy);
    window.addEventListener(FORECAST_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(CELL_COPIED_EVENT, onCopy);
      window.removeEventListener(FORECAST_TOAST_EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);

  if (toast === null) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-lg animate-in fade-in">
      {toast.kind === "warning" ? (
        <AlertTriangle size={14} className="text-yellow-400" />
      ) : (
        <Check size={14} className="text-emerald-400" />
      )}
      <span className="tabular-nums">{toast.message}</span>
    </div>
  );
}
