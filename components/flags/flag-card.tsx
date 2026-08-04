// components/flags/flag-card.tsx
"use client";

/**
 * One persisted flag (cat-3 swing or cat-4 under-target) with its justification
 * editor: a required context dropdown + a comment. A flag counts as justified
 * only with BOTH. Shows the compared amounts, the analyzed months (under-target),
 * and — when the numbers drifted since it was justified — a "justified at $X,
 * now $Y" note. Editable even on a locked RFQ (the justification is an
 * annotation, not forecast data).
 *
 * Yellow = still to justify (warning); green = justified. No red — an unresolved
 * flag is an attention state, not an error, per the brand rules.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import {
  FLAG_CONTEXTS,
  flagDrift,
  type FlagContext,
  type StoredFlag,
} from "../../lib/types/forecast-flags.types";
import { AXIS_STYLE } from "./axis-style";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Short, explicit flag name. Revenue swings get a fixed name; media/labs swings
 * and under-target flags are named by their subject (channel / partner) carried
 * in the stored title. Derived from ruleId so renames apply to already-stored
 * flags without waiting for a re-validation.
 */
export function flagName(flag: StoredFlag): string {
  switch (flag.ruleId) {
    case "media-under-target":
    case "labs-under-target":
      return `Under target · ${flag.title}`;
    case "revenue-swing":
      return "Revenue swing";
    default:
      return flag.title; // media/labs swing → channel / partner
  }
}

/** "1,2,3" → "Jan–Mar" when contiguous, else "Jan, Feb, May". */
export function formatMonths(months: number[]): string {
  if (months.length === 0) return "none";
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 1) {
    return `${MONTH_SHORT[sorted[0] - 1]}–${MONTH_SHORT[sorted[sorted.length - 1] - 1]}`;
  }
  return sorted.map((m) => MONTH_SHORT[m - 1]).join(", ");
}

export default function FlagCard({
  flag,
  currency,
  onJustify,
}: {
  flag: StoredFlag;
  currency?: string;
  onJustify: (
    flagKey: string,
    input: { context?: FlagContext; note: string }
  ) => Promise<void>;
}) {
  const [context, setContext] = useState<FlagContext | "">(flag.context ?? "");
  const [note, setNote] = useState(flag.note ?? "");
  const [saving, setSaving] = useState(false);

  const drift = flagDrift(flag);
  const dirty = context !== (flag.context ?? "") || note !== (flag.note ?? "");
  const wouldJustify = !!context && !!note.trim();

  const save = async () => {
    setSaving(true);
    try {
      await onJustify(flag.key, { context: context || undefined, note });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`border border-l-4 ${AXIS_STYLE[flag.axis].stripe} ${
        flag.justified ? "border-gray-200 bg-white" : "border-yellow-400 bg-yellow-400"
      }`}
    >
      {/* Summary */}
      <div className={`px-4 py-3 ${flag.justified ? "text-gray-800" : "text-gray-900"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            {flag.justified ? (
              <Check size={15} className="flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle size={15} className="flex-shrink-0 text-gray-800" />
            )}
            <span className="flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${AXIS_STYLE[flag.axis].chip}`}
              >
                {AXIS_STYLE[flag.axis].label}
              </span>
              {flagName(flag)}
            </span>
          </div>
          <span className="flex-shrink-0 font-bold tabular-nums">
            {formatSigned(flag.delta)}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] tabular-nums">
          <span className="font-semibold">{formatMoney(flag.current)}</span>
          {" vs "}
          <span>{formatMoney(flag.reference)}</span>
          {currency ? <span className="ml-1 text-gray-600">{currency}</span> : null}
          <span className={`ml-1 ${flag.justified ? "text-gray-400" : "text-gray-600"}`}>
            {flag.category === "swing" ? "· prev RFQ" : "· forecast"}
          </span>
        </p>
        {flag.category === "under_target" && (
          <p className={`mt-1 text-[11px] ${flag.justified ? "text-gray-400" : "text-gray-700"}`}>
            Months analyzed: {formatMonths(flag.analyzedMonths ?? [])}
          </p>
        )}
        {drift.changed && (
          <p className="mt-1 text-[11px] font-medium text-gray-700">
            Justified when it was {formatSigned(drift.fromDelta)} — now{" "}
            {formatSigned(drift.toDelta)}. Review the justification.
          </p>
        )}
      </div>

      {/* Justification editor */}
      <div className="border-t border-black/10 bg-white px-4 py-3">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Context
        </label>
        <select
          value={context}
          onChange={(e) => setContext(e.target.value as FlagContext | "")}
          className="mt-1 w-full border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        >
          <option value="">Select a context…</option>
          {FLAG_CONTEXTS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Comment
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Explain this variance…"
          className="mt-1 w-full resize-y border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            {wouldJustify
              ? "Context + comment set — counts as justified."
              : "A context and a comment are both required."}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save justification
          </button>
        </div>
      </div>
    </div>
  );
}
