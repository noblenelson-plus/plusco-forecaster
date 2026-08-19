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
import {
  TargetProjectSelect,
  MonthPasteButton,
  type BlPasteApi,
} from "./bl-paste-target";

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
      className="flex items-center gap-1.5 text-[11px] text-gray-800 tabular-nums"
      title="MediaBox scans every campaign of this client — large clients can take a minute or two."
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping bg-blue-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 bg-blue-500" />
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
    // Same system as the MediaOcean rows: neutral surface, source-colored label.
    <tr className="group bg-gray-50 hover:bg-gray-100 border-b border-gray-100">
      <td
        className={`sticky left-0 z-10 bg-gray-50 group-hover:bg-gray-100 py-2 text-xs text-blue-700 max-w-[260px] ${
          indent ? "pl-10 pr-4" : "px-4"
        } ${labelText}`}
      >
        {expand ? (
          <button
            type="button"
            onClick={expand.onToggle}
            title={label}
            className="flex items-center gap-1 hover:text-black min-w-0 max-w-full"
          >
            {expand.expanded ? (
              <ChevronDown size={12} className="shrink-0" />
            ) : (
              <ChevronRight size={12} className="shrink-0" />
            )}
            <span className="truncate min-w-0">{label}</span>
          </button>
        ) : (
          <span className="block truncate" title={label}>
            {label}
          </span>
        )}
      </td>
      {showNotes && <td className="bg-gray-50 group-hover:bg-gray-100" />}
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
                bold ? "font-medium text-gray-900" : "text-gray-700"
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
        className={`px-2.5 py-2 text-right align-middle bg-gray-100 group-hover:bg-gray-200 ${
          total ? "cursor-copy" : ""
        }`}
      >
        <p
          className={`text-sm tabular-nums ${
            bold ? "font-semibold text-gray-900" : "text-gray-900"
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
  blPaste,
}: {
  axisId: AxisId;
  year: number | null;
  showNotes: boolean;
  /** Owned by ForecastGrid so the CSV export shares the same data. */
  mediabox: UseMediaboxTotalsResult;
  /**
   * "Paste this month into the BL" plumbing (shared with the MediaOcean
   * section). Undefined disables pasting — e.g. while peeking at another year.
   */
  blPaste?: BlPasteApi;
}) {
  const { cad, totals, refreshing, triggering, loading, error, refresh } =
    mediabox;

  // Which media-type rows are expanded to show their campaigns.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Whole-section collapse: the header stays, the body is hidden.
  const [collapsed, setCollapsed] = useState(false);
  // Reference-data hierarchy: campaign-first (default) or type/partner-first.
  const [hierarchy, setHierarchy] = useState<"campaign" | "type">("campaign");
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

  // Short label for the toggle: media -> "Channel", labs -> "Partner".
  const typeLabelShort = axisId === "labs" ? "Partner" : "Channel";

  // Normalized rows for whichever hierarchy is active: a primary row that
  // expands to its nested children, plus a flat summary of the OTHER dimension.
  const primaryRows =
    hierarchy === "campaign"
      ? campaignGroups.map((g) => ({
          key: g.name,
          label: g.name,
          byMonth: g.byMonth,
          total: g.total,
          children: g.types.map((t) => ({
            label: t.label,
            byMonth: t.byMonth,
            total: t.total,
          })),
        }))
      : typeRows.map((t) => ({
          key: t.label,
          label: t.label,
          byMonth: t.byMonth,
          total: t.total,
          children: t.campaigns.map((c) => ({
            label: c.name,
            byMonth: c.byMonth,
            total: c.total,
          })),
        }));

  const summaryRows =
    hierarchy === "campaign"
      ? typeRows.map((t) => ({
          key: `summary::${t.label}`,
          label: t.label,
          byMonth: t.byMonth,
          total: t.total,
        }))
      : campaignGroups.map((g) => ({
          key: `summary::${g.name}`,
          label: g.name,
          byMonth: g.byMonth,
          total: g.total,
        }));
  const summaryNoun = hierarchy === "campaign" ? typeNoun : "campaign";

  // Grand total across every type/partner — the section's bottom line.
  const grandByMonth: MonthlyMap = {};
  for (const m of MONTHS)
    grandByMonth[m] = typeRows.reduce((acc, t) => acc + (t.byMonth[m] ?? 0), 0);
  const grandTotal = typeRows.reduce((acc, t) => acc + t.total, 0);

  const busy = loading || refreshing || triggering;

  return (
    <>
      {/* Section header — same system as the MediaOcean band: flat source
          color (Plus Blue) with black type. */}
      <tr className="bg-blue-400 border-y border-blue-400">
        <td colSpan={colSpan} className="p-0">
          <div className="sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-2">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand section" : "Collapse section"}
              className="flex items-center gap-1.5 text-gray-900 hover:opacity-70 transition-opacity"
            >
              {collapsed ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronDown size={13} />
              )}
              <Database size={11} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                MediaBox
              </span>
            </button>
            <Lock size={10} className="text-blue-800" />
            <span className="text-[11px] text-gray-800 normal-case">
              actual as of {formatSyncedAt(totals?.syncedAt)}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              title="Refresh from MediaBox"
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-900 hover:bg-blue-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
              {refreshing || triggering ? "Refreshing…" : "Refresh"}
            </button>
            <RefreshProgress
              triggering={triggering}
              refreshing={refreshing}
              startedAt={totals?.refreshStartedAt}
            />
            <div className="inline-flex overflow-hidden rounded-md border border-blue-600/40 text-[11px]">
              <button
                type="button"
                onClick={() => setHierarchy("campaign")}
                className={`px-2 py-0.5 font-medium transition-colors ${
                  hierarchy === "campaign"
                    ? "bg-gray-900 text-white"
                    : "text-gray-900 hover:bg-blue-300"
                }`}
              >
                Campaign › {typeLabelShort}
              </button>
              <button
                type="button"
                onClick={() => setHierarchy("type")}
                className={`px-2 py-0.5 font-medium transition-colors ${
                  hierarchy === "type"
                    ? "bg-gray-900 text-white"
                    : "text-gray-900 hover:bg-blue-300"
                }`}
              >
                {typeLabelShort} › Campaign
              </button>
            </div>
            {cad && cad.hasUsd && !cad.usdConverted && (
              <span className="flex items-center gap-1 text-[11px] text-gray-900">
                <AlertTriangle size={11} />
                USD not converted (no {year} rate)
              </span>
            )}
            {blPaste && typeRows.length > 0 && (
              <TargetProjectSelect api={blPaste} />
            )}
          </div>
        </td>
      </tr>

      {!collapsed && (
        <>
      {/* Empty / loading state */}
      {primaryRows.length === 0 ? (
        <tr>
          <td
            colSpan={colSpan}
            className="px-8 py-2.5 text-xs text-blue-700 bg-gray-50 border-b border-gray-100"
          >
            {loading || triggering
              ? "Loading MediaBox data…"
              : "No MediaBox spend for this client/year."}
          </td>
        </tr>
      ) : (
        <>
          {/* Active hierarchy: primary rows, each expandable to its children. */}
          {primaryRows.map((group) => {
            const isOpen = expanded.has(group.key);
            return (
              <Fragment key={group.key}>
                <MoneyRow
                  label={group.label}
                  byMonth={group.byMonth}
                  total={group.total}
                  showNotes={showNotes}
                  bold
                  expand={{
                    expanded: isOpen,
                    onToggle: () => toggle(group.key),
                  }}
                />
                {isOpen &&
                  group.children.map((c) => (
                    <MoneyRow
                      key={`${group.key}::${c.label}`}
                      label={c.label}
                      byMonth={c.byMonth}
                      total={c.total}
                      showNotes={showNotes}
                      indent
                    />
                  ))}
              </Fragment>
            );
          })}

          {/* Summary: total per the OTHER dimension. */}
          <tr className="bg-gray-100 border-y border-gray-200">
            <td
              colSpan={colSpan}
              className="sticky left-0 z-10 px-4 py-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider"
            >
              Summary — total per {summaryNoun}
            </td>
          </tr>
          {summaryRows.map((sRow) => (
            <MoneyRow
              key={sRow.key}
              label={sRow.label}
              byMonth={sRow.byMonth}
              total={sRow.total}
              showNotes={showNotes}
              bold
            />
          ))}

          {/* Grand total — same light-gray convention as the other sections'
              total rows. */}
          <tr className="group bg-gray-200 border-y border-gray-300">
            <td className="sticky left-0 z-10 bg-gray-200 px-4 py-2 text-xs font-bold text-gray-900 uppercase tracking-wider">
              MediaBox total
            </td>
            {showNotes && <td className="bg-gray-200" />}
            {MONTHS.map((m) => {
              const v = grandByMonth[m] ?? 0;
              return (
                <td
                  key={m}
                  className="px-2.5 py-2 text-right align-middle"
                >
                  <span className="inline-flex w-full items-center justify-end gap-1">
                    {blPaste && (
                      <MonthPasteButton
                        api={blPaste}
                        rows={typeRows}
                        month={m}
                        sourceLabel="MediaBox"
                        typeNoun={typeNoun}
                      />
                    )}
                    <span
                      onClick={() => v && copyCellValue(v)}
                      title={v ? "Click to copy" : undefined}
                      className={v ? "cursor-copy" : ""}
                    >
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        {money(v)}
                      </span>
                    </span>
                  </span>
                </td>
              );
            })}
            <td
              onClick={() => grandTotal && copyCellValue(grandTotal)}
              title={grandTotal ? "Click to copy" : undefined}
              className={`px-2.5 py-2 text-right align-middle bg-gray-300 ${
                grandTotal ? "cursor-copy" : ""
              }`}
            >
              <p className="text-sm font-bold text-gray-900 tabular-nums">
                {money(grandTotal)}
              </p>
            </td>
          </tr>
        </>
      )}
        </>
      )}

      {error && (
        <tr>
          <td
            colSpan={colSpan}
            className="px-8 py-1.5 text-[11px] text-red-700 bg-gray-50 border-b border-gray-100"
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
