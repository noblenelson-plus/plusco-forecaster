// components/forecaster/save-status.tsx
"use client";

/**
 * Autosave state indicator for the grid toolbar. Reflects the debounced
 * autosave from useForecasterGrid: edits save on their own after a short pause;
 * the manual Save button stays as a way to force an immediate write.
 */

import { Loader2, Check, CircleDashed, AlertCircle } from "lucide-react";
import type { SaveStatus } from "../../lib/hooks/use-autosave";

export default function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "clean") return null;

  const config = {
    pending: {
      icon: <CircleDashed size={13} className="text-gray-400" />,
      label: "Unsaved — autosaving…",
      className: "text-gray-500",
    },
    saving: {
      icon: <Loader2 size={13} className="animate-spin text-gray-400" />,
      label: "Saving…",
      className: "text-gray-500",
    },
    saved: {
      icon: <Check size={13} className="text-emerald-500" />,
      label: "Saved",
      className: "text-emerald-600",
    },
    error: {
      icon: <AlertCircle size={13} className="text-red-500" />,
      label: "Save failed — retrying on next change",
      className: "text-red-600",
    },
  }[status];

  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
