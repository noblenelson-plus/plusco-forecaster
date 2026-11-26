// components/forecaster/sections/investments/programmatic-subtab.tsx
"use client";

/**
 * Exec KPI Dashboard → Programmatic: the master DSP report (same page as
 * /admin/programmatic). Its data (`programmatic_preview`) is readable by the
 * named viewers only (lib/programmatic/access.ts + the Firestore rule), so the
 * Exec container shows this sub-tab to them only. It has its own client / DSP /
 * month filters and doesn't follow the dashboard filters.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchProgrammaticPreview } from "../../../../lib/services/programmatic-preview-service";
import type { ProgrammaticPreviewData } from "../../../../lib/programmatic/programmatic.types";
import ProgrammaticPreview from "../../../programmatic/programmatic-preview";

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; data: ProgrammaticPreviewData }
  | { status: "error"; message: string };

export default function ProgrammaticSubtab() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchProgrammaticPreview()
      .then((data) => {
        if (!cancelled) setState(data ? { status: "ready", data } : { status: "empty" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading programmatic data…</span>
      </div>
    );
  }
  if (state.status === "empty") {
    return <p className="py-24 text-center text-sm text-muted-foreground">No programmatic data loaded yet.</p>;
  }
  if (state.status === "error") {
    return <p className="bg-red-500 px-4 py-3 text-sm text-white">Couldn&apos;t load the programmatic data: {state.message}</p>;
  }
  return <ProgrammaticPreview data={state.data} />;
}
