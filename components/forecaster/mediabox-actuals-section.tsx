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

import { Fragment, useState } from "react";
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
import { useMediaboxTotals } from "../../lib/hooks/use-mediabox-totals";
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
  clientId,
  year,
  showNotes,
}: {
  axisId: AxisId;
  clientId: string | undefined | null;
  year: number | null;
  showNotes: boolean;
}) {
  const { cad, totals, refreshing, triggering, loading, error, refresh } =
    useMediaboxTotals(clientId, year);

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
              ? "Loading MediaBox actuals…"
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
