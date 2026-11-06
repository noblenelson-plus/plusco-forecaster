// components/flags/flag-card.tsx
"use client";

/**
 * One persisted flag (cat-2 QA check, cat-3 swing or cat-4 under-target) with
 * its justification editor: a required context dropdown + a comment. A flag
 * counts as justified only with BOTH. Shows the compared amounts, the analyzed
 * months (under-target), the partners behind a Labs-over-media check,
 * and — when the numbers drifted since it was justified — a "justified at $X,
 * now $Y" note. Editable even on a locked RFQ (the justification is an
 * annotation, not forecast data).
 *
 * Autosave: once BOTH a context and a comment are filled in, the justification
 * saves itself ~1.5 s after the last keystroke (and right away on blur, tab hide
 * or leaving the page), so a filled-in flag can't be left unsaved. Partial input
 * is never autosaved. The Save button stays for explicit saves, including
 * clearing a justification. Saving a justification never validates anything —
 * revalidating stays a deliberate action (Flags page / forecast page).
 *
 * A flag whose rule can't be justified (Labs over media) has no editor: it
 * says to correct the forecast, with the red "Over 100%" chip of the Labs
 * share panel (only the chip is red). Yellow = still to justify / correct;
 * white = justified.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import {
  FLAG_CONTEXTS,
  flagDrift,
  isJustifiableRule,
  type FlagContext,
  type StoredFlag,
} from "../../lib/types/forecast-flags.types";
import { AXIS_STYLE } from "./axis-style";

/** Idle time after the last keystroke before a complete justification autosaves. */
const AUTOSAVE_DELAY_MS = 1500;

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
    case "labs-over-media":
      return `QA error: Labs over media spend · ${flag.title}`;
    case "mediaocean-over-media":
    case "mediaocean-over-labs":
      // Flags stored before the per-media-type / per-partner split: "annual".
      return flag.subject === "annual" ? "QA: Under-forecast" : `QA: Under-forecast · ${flag.title}`;
    case "media-under-target":
    case "labs-under-target":
      return `Under target · ${flag.title}`;
    case "revenue-swing":
      return "Revenue swing";
    default:
      return flag.title; // media/labs swing → channel / partner
  }
}

/** What the flag's "current vs reference" compares, shown after the amounts. */
export function flagComparison(flag: StoredFlag): string {
  switch (flag.ruleId) {
    case "labs-over-media":
      return "· Labs partners vs media forecast";
    case "mediaocean-over-media":
    case "mediaocean-over-labs":
      return "· MediaOcean vs BL forecast";
    default:
      return flag.category === "swing" ? "· prev RFQ" : "· forecast";
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
  const [saveError, setSaveError] = useState(false);
  // Guards against a second write while one is in flight (the autosave timer,
  // a blur and the unmount flush can all fire close together).
  const savingRef = useRef(false);

  // Labs over media can't be justified — it only goes away once corrected.
  const correctable = !isJustifiableRule(flag.ruleId);
  const justified = flag.justified && !correctable;
  const drift = flagDrift(flag);
  const dirty = context !== (flag.context ?? "") || note !== (flag.note ?? "");
  const wouldJustify = !!context && !!note.trim();

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await onJustify(flag.key, { context: context || undefined, note });
    } catch (err) {
      console.error("Saving the flag justification failed:", err);
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Autosave only a complete justification (context + comment); partial input
  // waits for the user. Off for flags that can't be justified (no editor).
  const autosaveReady = !correctable && dirty && wouldJustify;
  // Latest save + readiness, read by the timer / unmount flush (no stale closures).
  const saveRef = useRef(save);
  const readyRef = useRef(autosaveReady);
  useEffect(() => {
    saveRef.current = save;
    readyRef.current = autosaveReady;
  });

  // True debounce: re-armed on every keystroke, so a comment is saved once the
  // user pauses — never half-typed mid-sentence.
  useEffect(() => {
    if (!autosaveReady) return;
    const t = setTimeout(() => {
      if (readyRef.current) void saveRef.current();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [autosaveReady, context, note]);

  // Leaving the page (route change) or the tab going away: save what's ready.
  useEffect(() => {
    const flush = () => {
      if (readyRef.current) void saveRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const saveOnBlur = () => {
    if (autosaveReady) void save();
  };

  // Brief "Saved" confirmation after a successful write.
  const [justSaved, setJustSaved] = useState(false);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (saving) {
      wasSaving.current = true;
      return;
    }
    if (!wasSaving.current || saveError) return;
    wasSaving.current = false;
    const show = setTimeout(() => setJustSaved(true), 0);
    const hide = setTimeout(() => setJustSaved(false), 2500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [saving, saveError]);

  const status: "error" | "saving" | "pending" | "saved" | "idle" = saveError
    ? "error"
    : saving
      ? "saving"
      : autosaveReady
        ? "pending"
        : justSaved
          ? "saved"
          : "idle";

  return (
    <div
      className={`border border-l-4 ${AXIS_STYLE[flag.axis].stripe} ${
        justified ? "border-gray-200 bg-white" : "border-yellow-400 bg-yellow-400"
      }`}
    >
      {/* Summary */}
      <div className={`px-4 py-3 ${justified ? "text-gray-800" : "text-gray-900"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            {justified ? (
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
          <span className={`ml-1 ${justified ? "text-gray-400" : "text-gray-600"}`}>
            {flagComparison(flag)}
          </span>
          {flag.ruleId === "labs-over-media" && <OverChip current={flag.current} reference={flag.reference} />}
        </p>
        {flag.ruleId === "labs-over-media" && (flag.breakdown?.length ?? 0) > 1 && (
          <div className="mt-1 border-l border-gray-700 pl-3 text-[11px] tabular-nums text-gray-800">
            <p className="font-semibold uppercase tracking-wide">Labs partners</p>
            <ul className="space-y-0.5">
              {flag.breakdown!.map((b) => (
                <li key={b.label}>
                  <span className="font-medium">{b.label}</span>
                  {" — "}
                  {formatMoney(b.current)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {flag.ruleId !== "labs-over-media" && flag.breakdown && flag.breakdown.length > 0 && (
          <div className={`mt-1 border-l pl-3 text-[11px] tabular-nums ${justified ? "border-gray-300 text-gray-500" : "border-gray-700 text-gray-800"}`}>
            <p className="font-semibold uppercase tracking-wide">
              Over forecast by {flag.axis === "labs" ? "partner" : "media type"}
            </p>
            <ul className="space-y-0.5">
              {flag.breakdown.map((b) => (
                <li key={b.label}>
                  <span className="font-medium">{b.label}</span>
                  {" — "}
                  <span className="font-semibold">{formatMoney(b.current)}</span>
                  {" vs "}
                  {formatMoney(b.reference)}
                  <span className="ml-1 font-semibold">({formatSigned(b.delta)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {flag.category === "under_target" && (
          <p className={`mt-1 text-[11px] ${justified ? "text-gray-400" : "text-gray-700"}`}>
            Months analyzed: {formatMonths(flag.analyzedMonths ?? [])}
          </p>
        )}
        {drift.changed && !correctable && (
          <p className="mt-1 text-[11px] font-medium text-gray-700">
            Justified when it was {formatSigned(drift.fromDelta)} — now{" "}
            {formatSigned(drift.toDelta)}. Review the justification.
          </p>
        )}
      </div>

      {correctable ? (
        <div className="border-t border-black/10 bg-white px-4 py-3 text-[12px] text-gray-700">
          <span className="font-semibold text-gray-900">Can&apos;t be justified.</span> Correct the
          Labs or Media forecast on the forecast page so the Labs partners don&apos;t exceed the
          media type&apos;s forecast, then re-validate.
        </div>
      ) : (
      /* Justification editor */
      <div className="border-t border-black/10 bg-white px-4 py-3">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Context
        </label>
        <select
          value={context}
          onChange={(e) => setContext(e.target.value as FlagContext | "")}
          onBlur={saveOnBlur}
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
          onBlur={saveOnBlur}
          rows={2}
          placeholder="Explain this variance…"
          className="mt-1 w-full resize-y border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            {status === "error" ? (
              <span className="font-medium text-red-600">Couldn&apos;t save — try Save justification.</span>
            ) : status === "saving" || status === "pending" ? (
              "Saving…"
            ) : status === "saved" ? (
              <span className="font-medium text-green-700">Saved — counts as justified.</span>
            ) : !wouldJustify ? (
              "A context and a comment are both required. Saves automatically once both are set."
            ) : dirty ? (
              "Unsaved changes."
            ) : (
              "Context + comment set — counts as justified."
            )}
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
      )}
    </div>
  );
}

/**
 * Labs ÷ media coverage of a Labs-over-media flag, in the red "Over 100%" chip
 * of the Labs share panel. No reference = no media forecast for that type.
 */
function OverChip({ current, reference }: { current: number; reference: number }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      <AlertTriangle size={10} />
      {reference > 0.5 ? `Over 100% · ${Math.round((current / reference) * 100)}%` : "No media forecast"}
    </span>
  );
}
