// components/forecaster/rfq-timeline-bar.tsx
"use client";

/**
 * Sticky timeline (schedule) pinned to the bottom of the forecast page,
 * rendered as a two-state mini gantt:
 *
 * - At rest it is an ultra-slim yellow strip labeled "Timeline": thin colored
 *   bars on a proportional time axis (green done / orange active / dark-gray
 *   upcoming) and a red "today" line — just enough to see where the round
 *   stands without stealing screen space.
 * - When the mouse enters the strip, the panel expands **upward as an
 *   overlay** (the outer sticky element keeps its rest height, so the page
 *   never reflows): bars grow into labeled gantt rows, month labels fade in,
 *   and each bar gets a detail tooltip on hover.
 *
 * Overlapping periods stack on extra lanes (greedy first-fit packing).
 *
 * Read-only — periods are authored by admins on the RFQ admin page. The bar
 * shows nothing when the selected RFQ has no periods.
 */

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  RFQPeriod,
  PeriodStatus,
  PeriodOwner,
  PERIOD_OWNERS,
  periodOwnerLabel,
  resolvePeriodStatus,
  sortPeriods,
  todayISODate,
} from "../../lib/types/rfq.types";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** "YYYY-MM-DD" → whole days since the UTC epoch (calendar arithmetic only). */
function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

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

/** First-of-month gridline positions (in % of the domain) with short labels. */
function monthTicks(
  d0: number,
  span: number
): { pct: number; label: string }[] {
  const ticks: { pct: number; label: string }[] = [];
  const start = new Date(d0 * MS_PER_DAY);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  // Advance to the first month boundary at or after the domain start.
  if (start.getUTCDate() !== 1) {
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  for (;;) {
    const idx = Date.UTC(y, m, 1) / MS_PER_DAY;
    if (idx >= d0 + span) break;
    const label = new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-CA", {
      month: "short",
      timeZone: "UTC",
    });
    ticks.push({
      pct: ((idx - d0) / span) * 100,
      // Disambiguate January with the year (a domain can cross year ends).
      label: m === 0 ? `${label} ${y}` : label,
    });
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return ticks;
}

// ─── Lane packing ─────────────────────────────────────────────────────────────

/**
 * Greedy first-fit lane assignment over start-sorted periods: reuse the first
 * lane whose last period ended strictly before this one starts (dates are
 * inclusive, so same-day touching counts as overlap). Non-overlapping
 * timelines stay on a single lane.
 */
function assignLanes(sorted: RFQPeriod[]): { period: RFQPeriod; lane: number }[] {
  const laneEnds: string[] = [];
  return sorted.map((period) => {
    let lane = laneEnds.findIndex((end) => end < period.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(period.endDate);
    } else {
      laneEnds[lane] = period.endDate;
    }
    return { period, lane };
  });
}

// ─── Layout & styling ─────────────────────────────────────────────────────────

// Vertical metrics for the two states; every bar position/size interpolates
// between them via a CSS transition on the inline styles.
const REST = { axis: 0, pitch: 10, bar: 6, padTop: 10, padBottom: 10 };
const OPEN = { axis: 20, pitch: 30, bar: 22, padTop: 12, padBottom: 12 };

// Bar palette on the yellow (sidebar-avatar yellow-400) strip: green = done,
// orange = in progress, dark gray = not started yet.
const STATUS_STYLES: Record<
  PeriodStatus,
  { bar: string; tooltipStatus: string; label: string }
> = {
  completed: {
    bar: "bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-400",
    tooltipStatus: "text-emerald-300",
    label: "Completed",
  },
  active: {
    bar: "bg-orange-500 border-orange-600 text-white hover:bg-orange-400",
    tooltipStatus: "text-orange-300",
    label: "Active",
  },
  future: {
    bar: "bg-gray-800 border-gray-900 text-gray-100 hover:bg-gray-700",
    tooltipStatus: "text-gray-300",
    label: "Upcoming",
  },
};

const OWNER_SHORT: Record<PeriodOwner, string> = Object.fromEntries(
  PERIOD_OWNERS.map((o) => [o.value, o.short])
) as Record<PeriodOwner, string>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RFQTimelineBar({ periods }: { periods: RFQPeriod[] }) {
  const [open, setOpen] = useState(false);

  const today = todayISODate();
  const sorted = sortPeriods(periods);

  if (sorted.length === 0) return null;

  // Time domain: first start → last end, inclusive on both ends. When today
  // falls just outside the scheduled window (≤ 62 days away), stretch the
  // domain to include it so the red "today" line stays visible; a far-away
  // today (e.g. viewing an old RFQ) would crush the bars, so it is left out.
  const todayIdx = dayIndex(today);
  let d0 = dayIndex(sorted[0].startDate);
  let d1 = Math.max(...sorted.map((p) => dayIndex(p.endDate)));
  if (todayIdx < d0 && d0 - todayIdx <= 62) d0 = todayIdx;
  if (todayIdx > d1 && todayIdx - d1 <= 62) d1 = todayIdx;
  const span = Math.max(d1 - d0 + 1, 1);

  const placed = assignLanes(sorted);
  const laneCount = Math.max(...placed.map((p) => p.lane)) + 1;

  const s = open ? OPEN : REST;
  const restHeight = REST.padTop + laneCount * REST.pitch + REST.padBottom;
  const panelHeight = s.padTop + s.axis + laneCount * s.pitch + s.padBottom;

  const ticks = monthTicks(d0, span);
  // On long domains, label every other gridline to avoid crowding.
  const labelStep = ticks.length > 14 ? 2 : 1;

  const todayPct =
    todayIdx >= d0 && todayIdx <= d1
      ? ((todayIdx - d0 + 0.5) / span) * 100
      : null;

  return (
    // The sticky element keeps the rest height in the page flow; the panel
    // inside expands upward as an overlay, so hovering never reflows the page.
    <div className="sticky bottom-0 z-30" style={{ height: restHeight }}>
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`absolute inset-x-0 bottom-0 border-t border-yellow-500 bg-yellow-400 transition-all duration-200 ease-out motion-reduce:transition-none ${
          open ? "shadow-[0_-8px_24px_rgba(0,0,0,0.2)]" : ""
        }`}
        style={{ height: panelHeight }}
      >
        <div
          className="mx-auto h-full max-w-[1700px] px-6"
          style={{ paddingTop: s.padTop, paddingBottom: s.padBottom }}
        >
          <div className="flex h-full items-stretch gap-5">
            {/* Label gutter — tells first-time users what this strip is */}
            <div className="flex flex-shrink-0 flex-col justify-center">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider leading-none text-gray-900">
                <CalendarRange size={12} />
                Timeline
              </span>
            </div>

            <div className="relative h-full flex-1">
            {/* Month gridlines + labels (labels fade in when open) */}
            {ticks.map((tick, i) => (
              <div key={tick.pct}>
                <div
                  className={`absolute inset-y-0 w-px transition-colors duration-200 ${
                    open ? "bg-yellow-600" : "bg-yellow-500"
                  }`}
                  style={{ left: `${tick.pct}%` }}
                />
                {i % labelStep === 0 && tick.pct < 96 && (
                  <span
                    className={`absolute top-0 pl-1 text-[9px] font-medium leading-none text-yellow-900 whitespace-nowrap transition-opacity duration-200 ${
                      open ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ left: `${tick.pct}%` }}
                  >
                    {tick.label}
                  </span>
                )}
              </div>
            ))}

            {/* Today marker */}
            {todayPct !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-red-600"
                style={{ left: `${todayPct}%` }}
              >
                <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-red-600" />
              </div>
            )}

            {/* Period bars */}
            {placed.map(({ period, lane }) => {
              const status = resolvePeriodStatus(period, today);
              const styles = STATUS_STYLES[status];
              const startIdx = dayIndex(period.startDate);
              const endIdx = dayIndex(period.endDate);
              const leftPct = ((startIdx - d0) / span) * 100;
              const widthPct = ((endIdx - startIdx + 1) / span) * 100;
              const centerPct = leftPct + widthPct / 2;
              // Keep the hover tooltip on-screen for bars near either edge.
              const tooltipPos =
                centerPct < 12
                  ? "left-0"
                  : centerPct > 88
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2";

              return (
                <div
                  key={period.id}
                  className={`group @container absolute z-20 flex cursor-default items-center overflow-visible border transition-all duration-200 ease-out motion-reduce:transition-none hover:z-30 hover:ring-2 hover:ring-white ${styles.bar}`}
                  style={{
                    top: s.axis + lane * s.pitch + (s.pitch - s.bar) / 2,
                    height: s.bar,
                    left: `${leftPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                    minWidth: s.bar,
                  }}
                >
                  {/* Name + owner chip — fade in with the expansion. Hidden
                      outright (container query) when the bar is too narrow to
                      fit them, e.g. a 1-day period: a clipped half-chip looks
                      broken, and the hover tooltip carries the details. */}
                  <div
                    className={`relative hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2 transition-opacity duration-200 @min-[56px]:flex ${
                      open ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <span className="truncate text-[10px] font-semibold leading-none">
                      {period.name}
                    </span>
                    {/* The owner chip needs more room than the name: on a
                        narrow bar the name wins and the chip drops out (the
                        tooltip still shows the owner). */}
                    {period.owner && (
                      <span className="hidden flex-shrink-0 border border-gray-300 bg-white px-1.5 py-px text-[8px] font-bold leading-none text-gray-700 @min-[96px]:inline-block">
                        {OWNER_SHORT[period.owner]}
                      </span>
                    )}
                  </div>

                  {/* Hover tooltip with the full details */}
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-left opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity duration-150 group-hover:opacity-100 ${tooltipPos}`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white">
                        {period.name}
                      </p>
                      <span
                        className={`text-[10px] font-medium ${styles.tooltipStatus}`}
                      >
                        {styles.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                      {formatDate(period.startDate)} –{" "}
                      {formatDate(period.endDate)}
                      {period.owner && (
                        <span className="text-gray-300">
                          {" · "}
                          {periodOwnerLabel(period.owner)}
                        </span>
                      )}
                    </p>
                    {period.description && (
                      <p className="mt-1 text-[11px] leading-snug text-gray-300 whitespace-normal">
                        {period.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
