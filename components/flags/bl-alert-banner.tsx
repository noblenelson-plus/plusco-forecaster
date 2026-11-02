// components/flags/bl-alert-banner.tsx
"use client";

/**
 * Renders one cat-2 "QA BL" alert (lib/flags/bl-alerts.ts) as a flat yellow banner:
 * title, one-line explanation, and one full-year line per flagged media type /
 * partner with its variance. "Show months" reveals the months over on their
 * own. Shown as a top-of-grid banner in the forecast module. Each row is also
 * a persisted flag once a validation runs (computeQaCheckFlags).
 *
 * Under-forecast rows are justifiable: given the stored flags, each shows
 * where it stands — justified, to justify, or picked up at the next
 * validation — with a link to the Flags page.
 * Labs over media rows are errors that can't be justified: each shows "To
 * correct", its Labs ÷ media coverage in the red "Over 100%" chip of the Labs
 * share panel, and the partners behind it. Only the chip is red — a fully red
 * banner reads as danger.
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import { qaFlagKey, type BlAlert, type BlAlertRow } from "../../lib/flags/bl-alerts";
import type { StoredFlag } from "../../lib/types/forecast-flags.types";
import { AXIS_STYLE } from "./axis-style";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Text / rule colours of the yellow banner surface. */
const TONE = {
  surface: "border-yellow-400 bg-yellow-400 text-gray-900",
  strong: "text-gray-900",
  soft: "text-gray-700",
  faint: "text-gray-600",
  detail: "border-gray-700 text-gray-800",
  icon: "text-gray-800",
} as const;

export default function BlAlertBanner({
  alert,
  currency,
  year,
  flags,
  onOpenFlags,
}: {
  alert: BlAlert;
  /** Client currency shown next to amounts (no FX — per-client figures). */
  currency?: string;
  /** Submission year, shown as the row heading ("Full year" when unknown). */
  year?: number | null;
  /** The submission's stored flags — enables the per-row justification status. */
  flags?: StoredFlag[];
  /** Opens the Flags page (where under-forecast flags are justified). */
  onOpenFlags?: () => void;
}) {
  const axis = AXIS_STYLE[alert.axis];
  const tone = TONE;
  const [showMonths, setShowMonths] = useState(false);
  const hasMonths = alert.rows.some((r) => r.months.length > 0);
  const stored = new Map((flags ?? []).map((f) => [f.key, f]));
  const statusOf = (r: BlAlertRow): keyof typeof STATUS_CHIP => {
    if (!alert.justifiable) return "to_correct";
    const f = stored.get(qaFlagKey(alert, r));
    return !f ? "pending" : f.justified ? "justified" : "to_justify";
  };
  const needsAction = !!flags && alert.rows.some((r) => statusOf(r) !== "justified");
  const cur = currency ? <span className={`ml-1 ${tone.faint}`}>{currency}</span> : null;
  // Left amount bold (it matches the bold lead of the explanation). The year
  // line also names both amounts and says what the variance means; the month
  // lines below it keep the same order without repeating the names.
  const amounts = (left: number, right: number, variance: number, labelled = false) => (
    <>
      <span className="font-semibold">{formatMoney(left)}</span>
      {labelled && <span className={tone.soft}> {alert.leftLabel}</span>}
      {" vs "}
      <span>{formatMoney(right)}</span>
      {labelled && <span className={tone.soft}> {alert.rightLabel}</span>}
      <span className="ml-1 font-semibold">
        ({formatSigned(variance)}
        {labelled && <span className={`font-normal ${tone.soft}`}> {alert.varianceLabel}</span>})
      </span>
      {cur}
    </>
  );

  return (
    <div className={`border border-l-4 ${axis.stripe} ${tone.surface} px-4 py-3 text-sm`}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className={`flex-shrink-0 ${tone.icon}`} />
        {alert.title}
        <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${axis.chip}`}>
          {axis.label}
        </span>
      </div>
      <p className={`mt-0.5 pl-6 text-[12px] ${tone.soft}`}>
        <span className={`font-semibold ${tone.strong}`}>{alert.explanationLead}</span>
        {alert.explanation}
      </p>
      <ul className="mt-1.5 space-y-0.5 pl-6 text-[13px]">
        {alert.rows.map((r) => (
          <li key={r.subject} className="tabular-nums">
            <span className="font-semibold">{year ?? "Full year"}</span>
            {r.leftName ? (
              // Labs over media: "Billups-OOH = 4,000,000 vs OOH = 2,000,000".
              <>
                <span className={tone.soft}> · </span>
                <span className="font-medium">{r.leftName}</span>
                {" = "}
                <span className="font-semibold">{formatMoney(r.left)}</span>
                {" vs "}
                <span className="font-medium">{r.label}</span>
                {" = "}
                {formatMoney(r.right)}
                <span className={tone.soft}> {alert.rightLabel}</span>
                <span className="ml-1 font-semibold">
                  ({formatSigned(r.variance)}
                  <span className={`font-normal ${tone.soft}`}> {alert.varianceLabel}</span>)
                </span>
                {cur}
                <OverChip ratio={r.ratio} />
              </>
            ) : (
              <>
                {r.label ? <span className={tone.soft}> · {r.label}</span> : null}
                {" — "}
                {amounts(r.left, r.right, r.variance, true)}
              </>
            )}
            {(flags || !alert.justifiable) && <StatusChip status={statusOf(r)} />}
            {r.partners && r.partners.length > 1 && (
              <ul className={`mt-0.5 mb-1 space-y-0.5 border-l pl-3 text-[12px] ${tone.detail}`}>
                {r.partners.map((p) => (
                  <li key={p.label}>
                    <span className="font-medium">{p.label}</span>
                    {" — "}
                    {formatMoney(p.amount)}
                    {cur}
                  </li>
                ))}
              </ul>
            )}
            {showMonths && r.months.length > 0 && (
              <ul className={`mt-0.5 mb-1 space-y-0.5 border-l pl-3 text-[12px] ${tone.detail}`}>
                {r.months.map((m) => (
                  <li key={m.month}>
                    <span className="font-semibold">{MONTH_SHORT[m.month - 1]}</span>
                    {" — "}
                    {amounts(m.left, m.right, m.variance)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {hasMonths && (
        <button
          type="button"
          onClick={() => setShowMonths((v) => !v)}
          aria-expanded={showMonths}
          className={`mt-1 ml-6 flex items-center gap-1 text-[12px] font-medium underline underline-offset-2 ${tone.strong}`}
        >
          {showMonths ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showMonths ? "Hide months" : "Show months"}
        </button>
      )}
      {!alert.justifiable ? (
        <p className={`mt-1.5 ml-6 text-[12px] font-semibold ${tone.strong}`}>
          Correct the forecast to validate — this error can&apos;t be justified.
        </p>
      ) : (
        needsAction &&
        onOpenFlags && (
          <button
            type="button"
            onClick={onOpenFlags}
            className={`mt-1.5 ml-6 flex items-center gap-1 text-[12px] font-semibold underline underline-offset-2 ${tone.strong}`}
          >
            Correct your forecast and revalidate, or justify on the Flags page
            <ArrowRight size={12} />
          </button>
        )
      )}
    </div>
  );
}

/**
 * Labs ÷ media coverage of a Labs-over-media row, in the red "Over 100%" chip
 * of the Labs share panel (labs-penetration-panel.tsx). No ratio = no media
 * forecast at all for that type.
 */
function OverChip({ ratio }: { ratio?: number }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      <AlertTriangle size={10} />
      {ratio === undefined ? "No media forecast" : `Over 100% · ${Math.round(ratio * 100)}%`}
    </span>
  );
}

const STATUS_CHIP = {
  justified: { label: "Justified", className: "bg-green-500 text-white" },
  to_justify: { label: "To justify", className: "bg-gray-900 text-white" },
  pending: { label: "Justify after the next validation", className: "bg-white text-gray-900" },
  to_correct: { label: "To correct", className: "bg-gray-900 text-white" },
} as const;

function StatusChip({ status }: { status: keyof typeof STATUS_CHIP }) {
  const s = STATUS_CHIP[status];
  return (
    <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.className}`}>
      {s.label}
    </span>
  );
}
