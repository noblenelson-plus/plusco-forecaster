// components/flags/bl-alert-banner.tsx
"use client";

/**
 * Renders one cat-2 "QA BL" alert (lib/flags/bl-alerts.ts) as a flat yellow
 * warning banner: title, one-line explanation, and the full-year figures with
 * their variance. The MediaOcean alerts list, under the year and under each
 * month, the media types / partners whose actuals exceed their forecast (what
 * drives the variance). "Show months" reveals the months over on their own.
 * Used both as a top-of-grid banner in the forecast module and in section 1 of
 * the Flags page. Yellow = warning per the brand rules; these alerts are
 * informational and never persisted.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import type { BlAlert, BlAlertPart } from "../../lib/flags/bl-alerts";
import { AXIS_STYLE } from "./axis-style";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function BlAlertBanner({
  alert,
  currency,
  year,
}: {
  alert: BlAlert;
  /** Client currency shown next to amounts (no FX — per-client figures). */
  currency?: string;
  /** Submission year, shown as the row heading ("Full year" when unknown). */
  year?: number | null;
}) {
  const axis = AXIS_STYLE[alert.axis];
  const [showMonths, setShowMonths] = useState(false);
  const hasMonths = alert.rows.some((r) => r.months.length > 0);
  // Left amount bold (it matches the bold lead of the explanation). The year
  // line also names both amounts and says what the variance means; the detail
  // lines below it keep the same order without repeating the names.
  const amounts = (left: number, right: number, variance: number, labelled = false) => (
    <>
      <span className="font-semibold">{formatMoney(left)}</span>
      {labelled && <span className="text-gray-700"> {alert.leftLabel}</span>}
      {" vs "}
      <span>{formatMoney(right)}</span>
      {labelled && <span className="text-gray-700"> {alert.rightLabel}</span>}
      <span className="ml-1 font-semibold">
        ({formatSigned(variance)}
        {labelled && <span className="font-normal text-gray-700"> {alert.varianceLabel}</span>})
      </span>
      {currency ? <span className="ml-1 text-gray-600">{currency}</span> : null}
    </>
  );
  // Media types / partners over their forecast — what drives a MediaOcean alert.
  const partsList = (parts: BlAlertPart[] | undefined) =>
    parts && parts.length > 0 ? (
      <ul className="mt-0.5 space-y-0.5 text-[12px] text-gray-800">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="font-medium">{p.label}</span>
            {" — "}
            {amounts(p.left, p.right, p.variance)}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className={`border border-l-4 border-yellow-400 ${axis.stripe} bg-yellow-400 px-4 py-3 text-sm text-gray-900`}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0 text-gray-800" />
        {alert.title}
        <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${axis.chip}`}>
          {axis.label}
        </span>
      </div>
      <p className="mt-0.5 pl-6 text-[12px] text-gray-700">
        <span className="font-semibold text-gray-900">{alert.explanationLead}</span>
        {alert.explanation}
      </p>
      <ul className="mt-1.5 space-y-0.5 pl-6 text-[13px]">
        {alert.rows.map((r, i) => (
          <li key={`${r.label ?? ""}_${i}`} className="tabular-nums">
            <span className="font-semibold">{year ?? "Full year"}</span>
            {r.label ? <span className="text-gray-700"> · {r.label}</span> : null}
            {" — "}
            {amounts(r.left, r.right, r.variance, true)}
            {r.parts && r.parts.length > 0 && (
              <div className="mt-0.5 mb-1 border-l border-gray-700 pl-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  Over forecast by {alert.axis === "labs" ? "partner" : "media type"}
                </span>
                {partsList(r.parts)}
              </div>
            )}
            {showMonths && r.months.length > 0 && (
              <ul className="mt-0.5 mb-1 space-y-0.5 border-l border-gray-700 pl-3 text-[12px] text-gray-800">
                {r.months.map((m) => (
                  <li key={m.month}>
                    <span className="font-semibold">{MONTH_SHORT[m.month - 1]}</span>
                    {" — "}
                    {amounts(m.left, m.right, m.variance)}
                    {m.parts && m.parts.length > 0 && (
                      <div className="pl-3">{partsList(m.parts)}</div>
                    )}
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
          className="mt-1 ml-6 flex items-center gap-1 text-[12px] font-medium text-gray-800 underline underline-offset-2 hover:text-gray-900"
        >
          {showMonths ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showMonths ? "Hide months" : "Show months"}
        </button>
      )}
    </div>
  );
}
