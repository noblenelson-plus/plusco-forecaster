// components/forecaster/flags-drawer.tsx
"use client";

/**
 * Flags — a right-hand drawer listing every auto-raised flag for the selected
 * submission (all three axes together), each with its justification. The trigger
 * lives in the page's top bar (see forecast/page.tsx); this component is a
 * controlled drawer (open / onClose).
 *
 * Flags are computed live (lib/flags/flag-rules.ts via useFlags); this
 * component only renders them and lets a user acknowledge a flag and attach a
 * note. Warnings use the brand's flat yellow surface (yellow = warning);
 * acknowledged flags fade to a neutral card with a green check. Editing is
 * allowed even on a LOCKED RFQ (the justification is an annotation, not data).
 */

import { useState } from "react";
import {
  Flag as FlagIcon,
  X,
  Check,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  FlaskConical,
} from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { Flag, FlagReviewMap } from "../../lib/types/flag.types";

interface FlagsDrawerProps {
  /** Drawer visibility — controlled by the page (trigger lives in the top bar). */
  open: boolean;
  onClose: () => void;
  flags: Flag[];
  reviews: FlagReviewMap;
  unacknowledgedCount: number;
  loadingReference: boolean;
  /** Currency the client forecasts in — shown in the amounts caption. */
  currency: string;
  saveReview: (
    flagKey: string,
    review: { note: string; acknowledged: boolean }
  ) => Promise<void>;
}

const AXIS_ORDER: AxisId[] = ["revenue", "media", "labs"];

const AXIS_META: Record<
  AxisId,
  { label: string; icon: typeof FlagIcon }
> = {
  revenue: { label: "Revenue", icon: DollarSign },
  media: { label: "Media Spend", icon: TrendingUp },
  labs: { label: "Labs", icon: FlaskConical },
};

/** Human caption for what each rule compares. */
function ruleCaption(flag: Flag): string {
  switch (flag.ruleId) {
    case "revenue-bl-submission-vs-official-annual":
      return "BL Submission vs previous RFQ Official Revenue (year)";
    case "media-channel-variance-annual":
      return "Annual BL Input vs previous RFQ (channel)";
    case "labs-partner-variance-annual":
      return "Annual BL Input vs previous RFQ (partner)";
  }
}

/** Signed variance label — percentage for relative rules, dollars for absolute. */
function varianceLabel(flag: Flag): string {
  if (flag.kind === "relative" && flag.relative !== null) {
    const pct = Math.round(Math.abs(flag.relative) * 100);
    return `${flag.delta >= 0 ? "+" : "−"}${pct}%`;
  }
  return formatSigned(flag.delta);
}

export default function FlagsDrawer({
  open,
  onClose,
  flags,
  reviews,
  unacknowledgedCount,
  loadingReference,
  currency,
  saveReview,
}: FlagsDrawerProps) {
  // Local note drafts + dirty tracking — a dirty field shows the draft, a clean
  // one always reflects the live subscription value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const noteValue = (flag: Flag) =>
    dirty.has(flag.key) ? drafts[flag.key] ?? "" : reviews[flag.key]?.note ?? "";

  const onNoteChange = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    setDirty((s) => new Set(s).add(key));
  };

  const commitNote = async (flag: Flag) => {
    if (!dirty.has(flag.key)) return;
    const note = drafts[flag.key] ?? "";
    await saveReview(flag.key, {
      note,
      acknowledged: reviews[flag.key]?.acknowledged ?? false,
    });
    setDirty((s) => {
      const next = new Set(s);
      next.delete(flag.key);
      return next;
    });
  };

  const toggleAck = async (flag: Flag) => {
    const current = reviews[flag.key];
    await saveReview(flag.key, {
      note: noteValue(flag),
      acknowledged: !current?.acknowledged,
    });
    setDirty((s) => {
      const next = new Set(s);
      next.delete(flag.key);
      return next;
    });
  };

  const byAxis = (axis: AxisId) => flags.filter((f) => f.axis === axis);

  return (
    <>
      {/* Scrim */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transform transition-transform duration-250 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between bg-gray-900 px-6 py-5">
          <div className="min-w-0 pr-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <FlagIcon size={18} className="text-yellow-400" />
              Flags
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {flags.length === 0
                ? "No flags for this submission"
                : `${flags.length} flag${flags.length > 1 ? "s" : ""} · ${unacknowledgedCount} to review`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {flags.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
              <div className="mb-3 flex h-12 w-12 items-center justify-center bg-gray-100">
                <Check size={22} className="text-green-500" />
              </div>
              <p className="text-sm font-medium text-gray-500">
                Nothing to flag
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {loadingReference
                  ? "Comparing against the previous RFQ…"
                  : "This submission is within range of the previous RFQ."}
              </p>
            </div>
          ) : (
            AXIS_ORDER.map((axis) => {
              const axisFlags = byAxis(axis);
              if (axisFlags.length === 0) return null;
              const { label, icon: Icon } = AXIS_META[axis];
              return (
                <section key={axis} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <Icon size={14} className="text-gray-400" />
                    {label}
                    <span className="text-gray-400">({axisFlags.length})</span>
                  </div>
                  {axisFlags.map((flag) => {
                    const review = reviews[flag.key];
                    const acknowledged = !!review?.acknowledged;
                    return (
                      <div
                        key={flag.key}
                        className={`border ${
                          acknowledged
                            ? "border-gray-200 bg-white"
                            : "border-yellow-400 bg-yellow-400"
                        }`}
                      >
                        {/* Flag summary */}
                        <div
                          className={`px-4 py-3 ${
                            acknowledged ? "text-gray-800" : "text-gray-900"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 font-semibold">
                              {acknowledged ? (
                                <Check size={15} className="flex-shrink-0 text-green-600" />
                              ) : (
                                <AlertTriangle size={15} className="flex-shrink-0 text-gray-800" />
                              )}
                              {flag.title}
                            </div>
                            <span className="flex-shrink-0 font-bold tabular-nums">
                              {varianceLabel(flag)}
                            </span>
                          </div>
                          <p
                            className={`mt-1 text-[11px] ${
                              acknowledged ? "text-gray-500" : "text-gray-700"
                            }`}
                          >
                            {ruleCaption(flag)}
                          </p>
                          <p className="mt-1.5 text-[13px] tabular-nums">
                            <span className="font-semibold">{formatMoney(flag.current)}</span>
                            {" vs "}
                            <span>{formatMoney(flag.reference)}</span>
                            <span
                              className={`ml-1 ${
                                acknowledged ? "text-gray-400" : "text-gray-600"
                              }`}
                            >
                              {currency} · prev RFQ
                            </span>
                          </p>
                        </div>

                        {/* Justification */}
                        <div className="border-t border-black/10 bg-white px-4 py-3">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Justification
                          </label>
                          <textarea
                            value={noteValue(flag)}
                            onChange={(e) => onNoteChange(flag.key, e.target.value)}
                            onBlur={() => void commitNote(flag)}
                            rows={2}
                            placeholder="Explain this variance…"
                            className="mt-1 w-full resize-y border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => void toggleAck(flag)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                                acknowledged
                                  ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
                                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <Check size={13} />
                              {acknowledged ? "Acknowledged" : "Acknowledge"}
                            </button>
                            {review?.updatedAt && (
                              <span className="truncate text-[11px] text-gray-400">
                                {formatReviewStamp(review.updatedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

/** "2026-07-21T…" → "Jul 21, 2026" for the review timestamp. */
function formatReviewStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
