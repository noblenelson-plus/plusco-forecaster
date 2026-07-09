// components/forecaster/rfq-timeline-bar.tsx
"use client";

/**
 * Sticky timeline (échéancier) bar pinned to the bottom of the forecast page.
 * Renders the selected RFQ's periods as a horizontal row of steps, styled by
 * status relative to today: completed (done), active (current), or future.
 *
 * Read-only — periods are authored by admins on the RFQ admin page. The bar
 * shows nothing when the selected RFQ has no periods.
 */

import { Check, CircleDot, Clock } from "lucide-react";
import {
  RFQPeriod,
  PeriodStatus,
  resolvePeriodStatus,
  sortPeriods,
  todayISODate,
} from "../../lib/types/rfq.types";

// Display a "YYYY-MM-DD" date as a short, locale-friendly label (e.g. "Mar 3").
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  // Construct in local time to avoid a UTC off-by-one.
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

const STATUS_STYLES: Record<
  PeriodStatus,
  { dot: string; card: string; label: string; icon: typeof Check }
> = {
  completed: {
    dot: "bg-emerald-500 text-white border-emerald-500",
    card: "border-emerald-200 bg-emerald-50/60",
    label: "text-emerald-700",
    icon: Check,
  },
  active: {
    dot: "bg-yellow-400 text-gray-900 border-yellow-400 ring-4 ring-yellow-100",
    card: "border-yellow-300 bg-yellow-50 shadow-sm",
    label: "text-gray-900",
    icon: CircleDot,
  },
  future: {
    dot: "bg-white text-gray-400 border-gray-300",
    card: "border-gray-200 bg-white",
    label: "text-gray-500",
    icon: Clock,
  },
};

export default function RFQTimelineBar({ periods }: { periods: RFQPeriod[] }) {
  const today = todayISODate();
  const sorted = sortPeriods(periods);

  if (sorted.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-[1700px] mx-auto px-6 py-3">
        {/* flex-wrap (not overflow-x-auto) so the hover tooltip can render
            above a card without being clipped: setting overflow-x also forces
            overflow-y to clip vertically. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {sorted.map((period, i) => {
            const status = resolvePeriodStatus(period, today);
            const styles = STATUS_STYLES[status];
            const Icon = styles.icon;
            return (
              <div key={period.id} className="flex items-center gap-2 flex-shrink-0">
                {/* Connector before every step except the first */}
                {i > 0 && (
                  <div
                    className={`h-px w-6 ${
                      status === "future" ? "bg-gray-200" : "bg-emerald-300"
                    }`}
                  />
                )}

                <div
                  className={`group relative flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${styles.card}`}
                >
                  {/* Status dot */}
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border ${styles.dot}`}
                  >
                    <Icon size={14} />
                  </span>

                  {/* Name + date range */}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium leading-tight ${styles.label}`}>
                      {period.name}
                    </p>
                    <p className="text-[11px] text-gray-400 leading-tight whitespace-nowrap">
                      {formatDate(period.startDate)} – {formatDate(period.endDate)}
                    </p>
                  </div>

                  {/* Custom tooltip — shown on hover when the period has a
                      description. Positioned above the card (the bar sits at
                      the bottom of the screen) with a small arrow. */}
                  {period.description && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-max max-w-xs -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                    >
                      <p className="text-xs font-semibold text-white">
                        {period.name}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-gray-300 whitespace-normal">
                        {period.description}
                      </p>
                      {/* Arrow */}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rotate-45 h-2 w-2 bg-gray-900" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
