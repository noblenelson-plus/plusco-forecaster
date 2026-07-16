// components/qa/qa-test-card.tsx
"use client";

/**
 * One QA check rendered as a card: pass/fail badge, rule description, and —
 * when the check fails — the list of violating client × month combinations
 * with both compared amounts. Long lists are truncated behind a "Show all"
 * toggle so a widespread failure doesn't swallow the page.
 */

import { useState } from "react";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { formatMoney } from "../../lib/format/money";
import type { QaCheckResult } from "../../lib/dashboard/data/qa-checks";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Violations shown before the "Show all" toggle. */
const PREVIEW_COUNT = 8;

/** formatMoney renders 0 as "—"; here a zero amount is meaningful ($0). */
const fmt = (v: number) => (v === 0 ? "$0" : `$${formatMoney(v)}`);

export default function QaTestCard({
  title,
  description,
  result,
  tolerance,
  onToleranceChange,
  labelHeader,
  valueHeaders,
  clientNameById,
}: {
  title: string;
  description: string;
  result: QaCheckResult;
  /** Acceptable relative gap (0..1) the check was run with. Omit both to hide
   *  the slider — for checks that must always run strict (0%). */
  tolerance?: number;
  onToleranceChange?: (tolerance: number) => void;
  /** Header of the channel/stream column — omit when the check has none. */
  labelHeader?: string;
  /** Headers of the two amount columns, matching each violation's left/right. */
  valueHeaders: [string, string];
  clientNameById: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { status, checkedCount, violations } = result;
  const shown = expanded ? violations : violations.slice(0, PREVIEW_COUNT);
  const hiddenCount = violations.length - shown.length;

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-start gap-2">
          {status === "pass" ? (
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          ) : status === "fail" ? (
            <XCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
          ) : (
            <MinusCircle size={18} className="mt-0.5 flex-shrink-0 text-gray-300" />
          )}
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-0.5">{description}</CardDescription>
          </div>
        </div>
        <CardAction>
          {status === "pass" ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Passed
            </span>
          ) : status === "fail" ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
              {violations.length} issue{violations.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              No data
            </span>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Acceptable-gap slider — a comparison only fails when it deviates by
            more than this share of the reference amount. Session-only. */}
        {tolerance !== undefined && onToleranceChange && (
          <div className="mb-2 flex items-center gap-3 border-b border-gray-100 pb-3">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Acceptable gap
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(tolerance * 100)}
              onChange={(e) => onToleranceChange(Number(e.target.value) / 100)}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
              aria-label={`Acceptable gap for "${title}"`}
            />
            <span className="w-10 text-right text-xs font-medium tabular-nums">
              {Math.round(tolerance * 100)}%
            </span>
          </div>
        )}
        {status === "empty" ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nothing to check in this scope yet.
          </p>
        ) : status === "pass" ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            All {checkedCount.toLocaleString("en-CA")} checked combination
            {checkedCount > 1 ? "s" : ""} pass.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Client</th>
                  <th className="py-1.5 pr-3 font-medium">Month</th>
                  {labelHeader && (
                    <th className="py-1.5 pr-3 font-medium">{labelHeader}</th>
                  )}
                  <th className="py-1.5 pr-3 text-right font-medium">
                    {valueHeaders[0]}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {valueHeaders[1]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v, i) => (
                  <tr
                    key={`${v.clientId}_${v.label ?? ""}_${v.month}_${i}`}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-1.5 pr-3">
                      {clientNameById[v.clientId] ?? v.clientId}
                    </td>
                    <td className="py-1.5 pr-3">{MONTH_LABELS[v.month - 1]}</td>
                    {labelHeader && <td className="py-1.5 pr-3">{v.label}</td>}
                    <td className="py-1.5 pr-3 text-right font-medium text-red-600 tabular-nums">
                      {fmt(v.left)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {fmt(v.right)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(hiddenCount > 0 || expanded) && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? "Show less" : `Show all (+${hiddenCount} more)`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
