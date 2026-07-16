// components/forecaster/mediabox-actuals-section.tsx
"use client";

/**
 * Read-only "MediaBox" actuals section, rendered as table rows directly under
 * the MediaOcean (ADMIN_INPUT) section in the forecast grid. It mirrors the
 * actuals layout — label + 12 month cells + total — but is never editable: the
 * numbers are synced from MediaBox.
 *
 * Shows for the Media and Labs axes only. One row per media type (total media
 * spend on the Media axis, the LABS subset on the Labs axis), each expandable
 * to reveal its campaigns underneath. Amounts are converted USD→CAD at read
 * time with the year's rate.
 */

import { Fragment, useEffect, useState } from "react";
import {
  RefreshCw,
  Database,
  Lock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { UseMediaboxTotalsResult } from "../../lib/hooks/use-mediabox-totals";
import { copyCellValue } from "../../lib/format/copy-cell";
import {
  groupByCampaign,
  type MediaboxCadType,
} from "../../lib/services/mediabox-totals-service";

/** Axes that sit under MediaOcean and therefore get a MediaBox section. */
export function axisHasMediabox(axisId: AxisId): boolean {
  return axisId === "media" || axisId === "labs";
}

function formatSyncedAt(iso?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Staged progress label for a running refresh, with an elapsed-seconds ticker.
 * "Requesting" = our trigger call is in flight; once the MediaBox function
 * flips the doc's `refreshing` flag, we show the aggregation stage instead.
 * The elapsed time prefers the server's own `refreshStartedAt` stamp.
 */
function RefreshProgress({
  triggering,
  refreshing,
  startedAt,
}: {
  triggering: boolean;
  refreshing: boolean;
  startedAt?: string | null;
}) {
  // The ticker is mounted only while a refresh is active, so it can capture
  // its local start time once at mount (and the interval dies with it).
  if (!triggering && !refreshing) return null;
  return <RefreshProgressTicker refreshing={refreshing} startedAt={startedAt} />;
}

function RefreshProgressTicker({
  refreshing,
  startedAt,
}: {
  refreshing: boolean;
  startedAt?: string | null;
}) {
  // Local fallback start (the trigger stage has no server stamp yet).
  const [localStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverStart = refreshing && startedAt ? Date.parse(startedAt) : NaN;
  const start = !isNaN(serverStart) ? serverStart : localStart;
  const elapsed = Math.max(0, Math.round((now - start) / 1000));

  return (
    <span
      className="flex items-center gap-1.5 text-[11px] text-blue-600 tabular-nums"
      title="MediaBox scans every campaign of this client — large clients can take a minute or two."
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
      {refreshing ? "Aggregating in MediaBox…" : "Requesting refresh…"} {elapsed}s
    </span>
  );
}

function money(value: number): string {
  return value ? Math.round(value).toLocaleString("en-CA") : "—";
}

/** One label + 12 month cells + total, in the MediaBox styling. */
function MoneyRow({
  label,
  byMonth,
  total,
  showNotes,
  indent = false,
  bold = false,
  expand,
}: {
  label: string;
  byMonth: MonthlyMap;
  total: number;
  showNotes: boolean;
  indent?: boolean;
  bold?: boolean;
  expand?: { expanded: boolean; onToggle: () => void };
}) {
  const labelText = bold ? "font-medium" : "";
  return (
    <tr className="bg-blue-50/40 border-b border-blue-100">
      <td
        className={`sticky left-0 z-10 bg-blue-50/40 py-2 text-xs text-blue-800 ${
          indent ? "pl-10 pr-4" : "px-4"
        } ${labelText}`}
      >
        {expand ? (
          <button
            type="button"
            onClick={expand.onToggle}
            className="flex items-center gap-1 hover:text-blue-950"
          >
            {expand.expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span className="truncate">{label}</span>
          </button>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </td>
      {showNotes && <td className="bg-blue-50/40" />}
      {MONTHS.map((m) => {
        const v = byMonth[m] ?? 0;
        return (
          <td
            key={m}
            onClick={() => v && copyCellValue(v)}
            title={v ? "Click to copy" : undefined}
            className={`px-2.5 py-2 text-right align-middle ${v ? "cursor-copy" : ""}`}
          >
            <p
              className={`text-sm tabular-nums ${
                bold ? "font-medium text-blue-900" : "text-blue-800"
              }`}
            >
              {money(v)}
            </p>
          </td>
        );
      })}
      <td
        onClick={() => total && copyCellValue(total)}
        title={total ? "Click to copy" : undefined}
        className={`px-2.5 py-2 text-right align-middle bg-blue-100/50 ${
          total ? "cursor-copy" : ""
        }`}
      >
        <p
          className={`text-sm tabular-nums ${
            bold ? "font-semibold text-blue-900" : "text-blue-800"
          }`}
        >
          {money(total)}
        </p>
      </td>
    </tr>
  );
}

export default function MediaboxActualsSection({
  axisId,
  year,
  showNotes,
  mediabox,
}: {
  axisId: AxisId;
  year: number | null;
  showNotes: boolean;
  /** Owned by ForecastGrid so the CSV export shares the same data. */
  mediabox: UseMediaboxTotalsResult;
}) {
  const { cad, totals, refreshing, triggering, loading, error, refresh } =
    mediabox;

  // Which media-type rows are expanded to show their campaigns.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Only Media and Labs sit under MediaOcean.
  if (!axisHasMediabox(axisId)) return null;

  const colSpan = showNotes ? 15 : 14;
  // Media axis groups by media type; Labs axis groups by LABS partner.
  const typeRows: MediaboxCadType[] = cad
    ? axisId === "labs"
      ? cad.labsByPartner
      : cad.mediaByType
    : [];
  // Inverted view: campaign at the top, media types / partners nested.
  const campaignGroups = groupByCampaign(typeRows);
  const typeNoun = axisId === "labs" ? "partner" : "media type";

  // Grand total across every type/partner — the section's bottom line.
  const grandByMonth: MonthlyMap = {};
  for (const m of MONTHS)
    grandByMonth[m] = typeRows.reduce((acc, t) => acc + (t.byMonth[m] ?? 0), 0);
  const grandTotal = typeRows.reduce((acc, t) => acc + t.total, 0);

  const busy = loading || refreshing || triggering;

  return (
    <>
      {/* Section header — matches the ADMIN_INPUT header styling. */}
      <tr className="bg-blue-50 border-y border-blue-200">
        <td colSpan={colSpan} className="p-0">
          <div className="sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-2">
            <Database size={11} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              MediaBox
            </span>
            <Lock size={10} className="text-blue-300" />
            <span className="text-[11px] text-blue-400 normal-case">
              actual as of {formatSyncedAt(totals?.syncedAt)}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              title="Refresh from MediaBox"
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
              {refreshing || triggering ? "Refreshing…" : "Refresh"}
            </button>
            <RefreshProgress
              triggering={triggering}
              refreshing={refreshing}
              startedAt={totals?.refreshStartedAt}
            />
            {cad && cad.hasUsd && !cad.usdConverted && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle size={11} />
                USD not converted (no {year} rate)
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Empty / loading state */}
      {campaignGroups.length === 0 ? (
        <tr>
          <td
            colSpan={colSpan}
            className="px-8 py-2.5 text-xs text-blue-400 bg-blue-50/40 border-b border-blue-100"
          >
            {loading || triggering
              ? "Loading MediaBox data…"
              : "No MediaBox spend for this client/year."}
          </td>
        </tr>
      ) : (
        <>
          {/* Inverted hierarchy: campaign at the top, types nested. */}
          {campaignGroups.map((group) => {
            const isOpen = expanded.has(group.name);
            return (
              <Fragment key={group.name}>
                <MoneyRow
                  label={group.name}
                  byMonth={group.byMonth}
                  total={group.total}
                  showNotes={showNotes}
                  bold
                  expand={{
                    expanded: isOpen,
                    onToggle: () => toggle(group.name),
                  }}
                />
                {isOpen &&
                  group.types.map((t) => (
                    <MoneyRow
                      key={`${group.name}::${t.label}`}
                      label={t.label}
                      byMonth={t.byMonth}
                      total={t.total}
                      showNotes={showNotes}
                      indent
                    />
                  ))}
              </Fragment>
            );
          })}

          {/* Summary: total per media type / partner. */}
          <tr className="bg-blue-100/40 border-y border-blue-200">
            <td
              colSpan={colSpan}
              className="sticky left-0 z-10 px-4 py-1.5 text-[11px] font-semibold text-blue-600 uppercase tracking-wider"
            >
              Summary — total per {typeNoun}
            </td>
          </tr>
          {typeRows.map((type) => (
            <MoneyRow
              key={`summary::${type.label}`}
              label={type.label}
              byMonth={type.byMonth}
              total={type.total}
              showNotes={showNotes}
              bold
            />
          ))}

          {/* Grand total — mirrors the dark total rows of the other sections,
              in the MediaBox blue so the source stays recognizable. */}
          <tr className="bg-blue-700 border-t-2 border-blue-800">
            <td className="sticky left-0 z-10 bg-blue-700 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
              MediaBox total
            </td>
            {showNotes && <td className="bg-blue-700" />}
            {MONTHS.map((m) => {
              const v = grandByMonth[m] ?? 0;
              return (
                <td
                  key={m}
                  onClick={() => v && copyCellValue(v)}
                  title={v ? "Click to copy" : undefined}
                  className={`px-2.5 py-2 text-right align-middle ${v ? "cursor-copy" : ""}`}
                >
                  <p className="text-sm font-bold text-white tabular-nums">
                    {money(v)}
                  </p>
                </td>
              );
            })}
            <td
              onClick={() => grandTotal && copyCellValue(grandTotal)}
              title={grandTotal ? "Click to copy" : undefined}
              className={`px-2.5 py-2 text-right align-middle bg-blue-800 ${
                grandTotal ? "cursor-copy" : ""
              }`}
            >
              <p className="text-sm font-bold text-white tabular-nums">
                {money(grandTotal)}
              </p>
            </td>
          </tr>
        </>
      )}

      {error && (
        <tr>
          <td
            colSpan={colSpan}
            className="px-8 py-1.5 text-[11px] text-red-500 bg-blue-50/40 border-b border-blue-100"
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
