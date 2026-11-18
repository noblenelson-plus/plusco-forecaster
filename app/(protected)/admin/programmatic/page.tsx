// app/(protected)/admin/programmatic/page.tsx
"use client";

/**
 * Programmatic (preview) — demo of cross-DSP programmatic spend by publisher
 * and local media. Restricted to the named viewers in
 * lib/programmatic/access.ts (the Firestore rule on `programmatic_preview`
 * enforces the same list); everyone else is sent home.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../../lib/auth-context";
import { canViewProgrammaticPreview } from "../../../../lib/programmatic/access";
import { fetchProgrammaticPreview } from "../../../../lib/services/programmatic-preview-service";
import type { ProgrammaticPreviewData } from "../../../../lib/programmatic/programmatic.types";
import PageHeader from "../../../../components/_shared/page-header";
import ProgrammaticPreview from "../../../../components/programmatic/programmatic-preview";

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; data: ProgrammaticPreviewData }
  | { status: "error"; message: string };

export default function ProgrammaticPreviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = canViewProgrammaticPreview(user?.email);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [allowed, loading, router]);

  useEffect(() => {
    if (!user || !allowed) return;
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
  }, [user, allowed]);

  if (loading || !allowed) return null;

  return (
    <div>
      <PageHeader title="Programmatic (preview)" description="Where our programmatic money goes: which DSPs, which publishers, and how much is Canadian. Demo, visible to you only." />
      <div className="p-6">
        {state.status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-24 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading programmatic data…</span>
          </div>
        )}
        {state.status === "empty" && (
          <p className="py-24 text-center text-sm text-gray-500">
            No data yet. Run <code>scripts/build-programmatic-preview.mjs --write</code>.
          </p>
        )}
        {state.status === "error" && (
          <p className="bg-red-500 px-4 py-3 text-sm text-white">Couldn&apos;t load the programmatic data: {state.message}</p>
        )}
        {state.status === "ready" && <ProgrammaticPreview data={state.data} />}
      </div>
    </div>
  );
}
