// components/forecaster/copy-toast.tsx
"use client";

/**
 * Tiny global toast shown when a read-only cell value is copied to the
 * clipboard. Mounted once on the forecast page; listens for the
 * `forecast-cell-copied` window event dispatched by `copyCellValue`.
 */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { CELL_COPIED_EVENT } from "../../lib/format/copy-cell";

export default function CopyToast() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setText(null), 1400);
    };
    window.addEventListener(CELL_COPIED_EVENT, handler);
    return () => {
      window.removeEventListener(CELL_COPIED_EVENT, handler);
      clearTimeout(timer);
    };
  }, []);

  if (text === null) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-lg animate-in fade-in">
      <Check size={14} className="text-emerald-400" />
      <span className="tabular-nums">Copied {text}</span>
    </div>
  );
}
