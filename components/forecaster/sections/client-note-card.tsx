// components/forecaster/sections/client-note-card.tsx
"use client";

/**
 * Notes card for the Forecaster dashboard.
 *
 * Appears at the top of the Media & Labs / Revenue tabs when a client is
 * focused (you clicked their row). It shows — and lets you edit — that client's
 * submission note for the primary Year/RFQ. It is the SAME note BLs write on the
 * Forecast page (same {client, year, rfq} record), so edits sync both ways in
 * real time. Autosaves as you type; editable even on a locked round.
 *
 * Mirrors the look of the Forecast page's submission-note card, minus the
 * ready-months picker (that is tied to the global grid selection).
 */

import { StickyNote, Check, Loader2, AlertCircle, X } from "lucide-react";
import { useSubmissionNoteFor, type NoteSaveStatus } from "../../../lib/hooks/use-submission-note-for";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import type { RFQType } from "../../../lib/types/rfq.types";

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

function StatusIndicator({ status }: { status: NoteSaveStatus }) {
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
      <span className="flex items-center gap-1 text-[11px] text-green-600">
        <Check size={11} />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-red-700">
        <AlertCircle size={11} />
        Save failed
      </span>
    );
  }
  return null;
}

export default function ClientNoteCard({
  clientId,
  clientName,
  year,
  rfq,
  onClose,
}: {
  clientId: string;
  clientName: string;
  year: number;
  rfq: RFQType;
  /** Optional: dismiss the card (e.g. clear the focus). */
  onClose?: () => void;
}) {
  const { loading, text, setText, flush, status, updatedAt, updatedBy } =
    useSubmissionNoteFor(clientId, year, rfq);
  const usersMap = useUsersMap();

  const editorName = updatedBy ? usersMap.get(updatedBy) ?? updatedBy : "";
  const stamp = formatStamp(updatedAt);

  return (
    // Calm flat white card — yellow is reserved for warnings, so notes get a
    // neutral surface with a Plus Purple accent instead.
    <section className="mb-6 bg-white border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <StickyNote size={15} className="text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">Submission notes</h3>
          <span className="text-[11px] font-medium text-gray-700">· {clientName}</span>
          <span className="hidden sm:inline text-[11px] text-gray-500">
            · {rfq} {year} · shared across Media, Revenue &amp; Labs
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator status={status} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close notes"
              className="text-gray-400 transition-colors hover:text-gray-700"
            >
              <X size={14} />
            </button>
          )}
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
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 resize-y
            focus:outline-none focus:ring-2 focus:ring-blue-400
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