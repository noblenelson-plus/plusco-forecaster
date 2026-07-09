// components/forecaster/submission-note.tsx
"use client";

/**
 * Submission note card — a shared free-text box for the selected submission
 * ({client, year, rfq}). The same note shows on the Media, Revenue and Labs
 * tabs and is saved on the data_entries doc, so any teammate with access sees
 * and can edit it. Edits autosave (debounced); blur flushes immediately.
 *
 * It is intentionally editable even when the RFQ is locked — a locked grid is a
 * frozen snapshot, but comments about that submission remain useful.
 */

import { StickyNote, Check, Loader2, AlertCircle } from "lucide-react";
import { useSubmissionNote } from "../../lib/hooks/use-submission-note";
import { useUsersMap } from "../../lib/hooks/use-users-map";
import SubmissionReadyMonths from "./submission-ready-months";

/** ISO → "Jun 10, 2026, 2:45 p.m." (en-CA); empty when never saved. */
function formatStamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIndicator({ status }: { status: ReturnType<typeof useSubmissionNote>["status"] }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        <Loader2 size={11} className="animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-600">
        <Check size={11} />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-red-600">
        <AlertCircle size={11} />
        Save failed
      </span>
    );
  }
  return null;
}

export default function SubmissionNote() {
  const { ready, loading, text, setText, flush, status, updatedAt, updatedBy } =
    useSubmissionNote();
  const usersMap = useUsersMap();

  if (!ready) return null;

  const editorName = updatedBy ? usersMap.get(updatedBy) ?? updatedBy : "";
  const stamp = formatStamp(updatedAt);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-amber-200/70">
        <div className="flex items-center gap-2">
          <StickyNote size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">Submission notes</h3>
          <span className="hidden sm:inline text-[11px] text-gray-500">
            · shared across Media, Revenue &amp; Labs for this submission
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator status={status} />
          {/* Ready-months picker lives beside the notes — same submission scope. */}
          <SubmissionReadyMonths />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <textarea
          value={text}
          disabled={loading}
          onChange={(e) => setText(e.target.value)}
          onBlur={flush}
          rows={3}
          placeholder={
            loading ? "Loading…" : "Add notes for this submission (visible to everyone with access)…"
          }
          className="w-full px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg resize-y
            focus:outline-none focus:ring-2 focus:ring-amber-400
            disabled:bg-gray-50 disabled:text-gray-400"
        />
        {stamp && (
          <p className="mt-1.5 text-[11px] text-gray-400">
            Last edited {stamp}
            {editorName ? ` by ${editorName}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
