// components/progression/rfq-variance-band.tsx
"use client";

/**
 * Milestones page — "RFQ total variance", above the RFQ Swings table: per
 * axis (Media, Revenue, Labs) the total change of the checkpoint's RFQ vs the
 * previous RFQ over the filtered clients, and how much of that change the
 * Business Leads justified (bar: justified / not justified / no flag needed).
 * Only a part of the change ever needs a justification — lines under the
 * swing threshold don't. Presentational; amounts in CAD.
 */

import { DollarSign, FlaskConical, Loader2, TrendingUp, type LucideIcon } from "lucide-react";
import { formatCompactMoney } from "../dashboard/charts/format";
import type { AxisVariance, VarianceAxis } from "../../lib/format/rfq-variance";

const AXES: { axis: VarianceAxis; label: string; icon: LucideIcon }[] = [
  { axis: "media", label: "Total media spend", icon: TrendingUp },
  { axis: "revenue", label: "Total revenue", icon: DollarSign },
  { axis: "labs", label: "Total Labs spend", icon: FlaskConical },
];

const BUCKETS = [
  { key: "justified", label: "Justified", color: "bg-green-500" },
  { key: "notJustified", label: "Not justified", color: "bg-yellow-400" },
  { key: "noFlag", label: "No flag needed", color: "bg-gray-300" },
] as const;

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatCompactMoney(v)}`;
const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function RfqVarianceBand({
  variance,
  axes,
  rfqLabel,
  previousLabel,
  loading,
  error,
}: {
  variance: Record<VarianceAxis, AxisVariance> | null;
  /** Axes whose swing flag is selected in the filter bar. */
  axes: VarianceAxis[];
  /** e.g. "RFQ3 2026". */
  rfqLabel: string;
  /** e.g. "RFQ2 2026"; null when no RFQ precedes it. */
  previousLabel: string | null;
  loading: boolean;
  error: string | null;
}) {
  const shown = AXES.filter((a) => axes.includes(a.axis));
  if (shown.length === 0) return null;

  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        RFQ total variance · {rfqLabel}
        {previousLabel ? ` vs ${previousLabel}` : ""}
      </p>
      {error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="flex h-24 items-center justify-center text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !previousLabel || !variance ? (
        <p className="mt-2 text-sm text-gray-400">No previous RFQ to compare with.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {shown.map(({ axis, label, icon: Icon }) => {
              const v = variance[axis];
              const pct = share(v.justified, v.moved);
              return (
                <div key={axis} className="border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <Icon size={13} />
                        {label}
                      </div>
                      <div
                        className={`mt-1 text-2xl font-bold tabular-nums ${
                          v.net < 0 ? "text-red-600" : "text-gray-900"
                        }`}
                      >
                        {signed(v.net)}
                      </div>
                      <div className="text-xs text-gray-500">vs {previousLabel}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold tabular-nums text-gray-900">
                        {v.moved > 0 ? `${pct}%` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">justified</div>
                    </div>
                  </div>
                  {v.moved > 0 && (
                    <>
                      <div
                        className="mt-2.5 flex h-2.5 w-full bg-gray-100"
                        title={BUCKETS.map((b) => `${b.label}: ${formatCompactMoney(v[b.key])}`).join(" · ")}
                      >
                        {BUCKETS.map((b) =>
                          v[b.key] > 0 ? (
                            <div key={b.key} className={b.color} style={{ width: `${(v[b.key] / v.moved) * 100}%` }} />
                          ) : null
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-600">
                        {BUCKETS.map((b) => (
                          <div key={b.key} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 ${b.color}`} aria-hidden="true" />
                              {b.label}
                            </span>
                            <span className="tabular-nums">
                              {formatCompactMoney(v[b.key])} · {share(v[b.key], v.moved)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            % of every change, up and down (per client, media type and Labs partner).{" "}
            &ldquo;No flag needed&rdquo; = changes under the swing threshold, or new lines with no previous
            amount.
          </p>
        </>
      )}
    </div>
  );
}
