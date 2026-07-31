// components/flags/bl-alert-banner.tsx
"use client";

/**
 * Renders one cat-2 "QA BL" alert (lib/flags/bl-alerts.ts) as a flat yellow
 * warning banner: title, one-line explanation, and the offending months with
 * their variance. Used both as a top-of-grid banner in the forecast module and
 * in section 1 of the Flags page. Yellow = warning per the brand rules; these
 * alerts are informational and never persisted.
 */

import { AlertTriangle } from "lucide-react";
import { formatMoney, formatSigned } from "../../lib/format/money";
import type { BlAlert } from "../../lib/flags/bl-alerts";
import { AXIS_STYLE } from "./axis-style";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function BlAlertBanner({
  alert,
  currency,
}: {
  alert: BlAlert;
  /** Client currency shown next to amounts (no FX — per-client figures). */
  currency?: string;
}) {
  const axis = AXIS_STYLE[alert.axis];
  return (
    <div className={`border border-l-4 border-yellow-400 ${axis.stripe} bg-yellow-400 px-4 py-3 text-sm text-gray-900`}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0 text-gray-800" />
        {alert.title}
        <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${axis.chip}`}>
          {axis.label}
        </span>
      </div>
      <p className="mt-0.5 pl-6 text-[12px] text-gray-700">{alert.explanation}</p>
      <ul className="mt-1.5 space-y-0.5 pl-6 text-[13px]">
        {alert.rows.map((r, i) => (
          <li key={`${r.month}_${r.label ?? ""}_${i}`} className="tabular-nums">
            <span className="font-semibold">{MONTH_SHORT[r.month - 1]}</span>
            {r.label ? <span className="text-gray-700"> · {r.label}</span> : null}
            {" — "}
            <span className="font-semibold">{formatMoney(r.left)}</span>
            {" vs "}
            <span>{formatMoney(r.right)}</span>
            <span className="ml-1 font-semibold">({formatSigned(r.variance)})</span>
            {currency ? <span className="ml-1 text-gray-600">{currency}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
