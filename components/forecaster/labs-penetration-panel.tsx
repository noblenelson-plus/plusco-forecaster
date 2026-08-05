// components/forecaster/labs-penetration-panel.tsx
"use client";

/**
 * Labs penetration panel — Labs tab only. Shows, per media type, the planned
 * media budget and how much the Labs partners cover of it, with each partner's
 * coverage % editable: setting a desired % rewrites the partner's BL forecast to
 * that share of the planned media, month by month (following the media curve).
 * Only media types with at least one Labs partner configured are listed.
 *
 * A media type is flagged when its partners together exceed 100% of the planned
 * budget. The header shows the global Labs/Media ratio against the 25% goal.
 */

import { useState } from "react";
import { FlaskConical, AlertTriangle, Target, Pencil } from "lucide-react";
import type {
  LabsPenetrationResult,
  MediaTypePenetration,
  PartnerPenetration,
} from "../../lib/format/labs-penetration";
import { MEDIA_TYPE_LABELS } from "../../lib/types/forecaster.types";
import { formatMoney } from "./editable-cell";

/** Per-partner segment colors for the coverage bar (Plus Company palette). */
const SEGMENTS = [
  "#594a99", "#4db04f", "#ffc929", "#f2739e",
  "#66d9e5", "#f54236", "#f7b0c9", "#abebf2",
];

function pctText(coverage: number | null): string {
  if (coverage === null) return "—";
  if (!isFinite(coverage)) return ">100%";
  return `${Math.round(coverage * 100)}%`;
}

interface PanelProps {
  result: LabsPenetrationResult;
  /** Editing requires an unlocked RFQ and at least one project to write into. */
  canEdit: boolean;
  onSetCoverage: (partnerId: string, pct: number) => void;
}

export default function LabsPenetrationPanel({
  result,
  canEdit,
  onSetCoverage,
}: PanelProps) {
  // Only media types with at least one Labs partner available — types that
  // carry planned media but no partner have nothing to cover and are hidden
  // here (the dashboard recap still surfaces them as coverage gaps).
  const types = result.byType.filter((t) => t.partners.length > 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <RatioHeader result={result} />

      <div className="max-h-[calc(62vh/var(--app-zoom,1))] overflow-y-auto divide-y-8 divide-gray-100">
        {types.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">
            No Labs partner configured for this year.
          </p>
        ) : (
          types.map((type) => (
            <TypeSection
              key={type.mediaType}
              type={type}
              canEdit={canEdit}
              onSetCoverage={onSetCoverage}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Header — global Labs/Media ratio vs target ──────────────────────────────

function RatioHeader({ result }: { result: LabsPenetrationResult }) {
  const { ratio, targetRatio, totalLabs, totalPlanned } = result;
  const reached = ratio !== null && ratio >= targetRatio;
  const fill = ratio === null ? 0 : Math.min(100, (ratio / targetRatio) * 100);

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-900 text-white">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        <FlaskConical size={13} />
        Labs share
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">
            {ratio === null ? "—" : `${Math.round(ratio * 100)}%`}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Labs / Media spend</p>
        </div>
        <span
          className={`flex items-center gap-1 text-[11px] font-medium ${
            reached ? "text-emerald-400" : "text-gray-400"
          }`}
        >
          <Target size={12} />
          Target {Math.round(targetRatio * 100)}%
        </span>
      </div>

      <div className="mt-2 h-1.5 bg-gray-700 overflow-hidden">
        <div
          className={`h-full ${reached ? "bg-emerald-400" : "bg-yellow-400"}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-400 tabular-nums">
        {formatMoney(totalLabs)} of {formatMoney(totalPlanned)} planned
      </p>
    </div>
  );
}

// ─── One media-type section ──────────────────────────────────────────────────

function TypeSection({
  type,
  canEdit,
  onSetCoverage,
}: {
  type: MediaTypePenetration;
  canEdit: boolean;
  onSetCoverage: (partnerId: string, pct: number) => void;
}) {
  // A % can only resolve to dollars when there is a planned budget to apply it to.
  const editable = canEdit && type.plannedAnnual > 0;

  return (
    <section className="pb-1">
      {/* Type header band — name + coverage, clearly separating sections */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-900">
            {MEDIA_TYPE_LABELS[type.mediaType]}
          </span>
          {type.over && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-500 text-white">
              <AlertTriangle size={10} />
              Over 100%
            </span>
          )}
        </div>
        <span
          className={`text-sm font-bold tabular-nums ${
            type.over ? "text-red-600" : "text-gray-900"
          }`}
        >
          {pctText(type.coverage)}
        </span>
      </div>

      {/* Coverage bar — one segment per partner */}
      {type.plannedAnnual > 0 && (
        <div className="px-4 pt-2.5">
          <div
            className={`flex h-1.5 overflow-hidden bg-gray-100 ${
              type.over ? "ring-1 ring-red-300" : ""
            }`}
          >
            {type.partners.map((p, i) => {
              const w =
                p.coverage && isFinite(p.coverage)
                  ? Math.max(0, Math.min(100, p.coverage * 100))
                  : 0;
              if (w <= 0) return null;
              return (
                <div
                  key={p.partnerId}
                  title={`${p.name}: ${pctText(p.coverage)}`}
                  style={{ width: `${w}%`, backgroundColor: SEGMENTS[i % SEGMENTS.length] }}
                />
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-gray-400 tabular-nums">
            {formatMoney(type.labsAnnual)} Labs / {formatMoney(type.plannedAnnual)} planned
          </p>
        </div>
      )}

      {/* Partners — every listed type has at least one (types without Labs
          partners are filtered out above). */}
      <div className="px-4 pt-2 pb-3.5">
        {type.partners.map((p, i) => (
          <PartnerRow
            key={p.partnerId}
            partner={p}
            color={SEGMENTS[i % SEGMENTS.length]}
            editable={editable}
            onSetCoverage={onSetCoverage}
          />
        ))}
      </div>
    </section>
  );
}

// ─── One partner — name + spend + editable coverage % ────────────────────────

function PartnerRow({
  partner,
  color,
  editable,
  onSetCoverage,
}: {
  partner: PartnerPenetration;
  color: string;
  editable: boolean;
  onSetCoverage: (partnerId: string, pct: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function start() {
    if (!editable) return;
    const current =
      partner.coverage !== null && isFinite(partner.coverage)
        ? Math.round(partner.coverage * 100)
        : 0;
    setDraft(String(current));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const value = parseFloat(draft);
    if (!isNaN(value) && value >= 0) onSetCoverage(partner.partnerId, value);
  }

  return (
    <div className="group flex items-center gap-2 py-1.5">
      {/* Name (+ description) — takes the slack, truncates */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="truncate text-sm text-gray-700">{partner.name}</span>
        </span>
        {/* Disambiguates two partners sharing a name and media type. */}
        {partner.description && (
          <span
            title={partner.description}
            className="truncate pl-[18px] text-[11px] italic text-gray-400"
          >
            {partner.description}
          </span>
        )}
      </span>

      {/* Amount — fixed width, right-aligned */}
      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
        {formatMoney(partner.annual)}
      </span>

      {/* Coverage % — fixed width; the pencil keeps its box even when hidden, so
          the number's right edge never shifts between rows. */}
      {editing ? (
        <span className="flex w-16 shrink-0 items-center justify-end">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-11 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <span className="ml-0.5 text-xs text-gray-400">%</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!editable}
          title={
            editable
              ? "Set desired coverage %"
              : "Plan media for this type (and add a project) to edit"
          }
          className={`flex w-16 shrink-0 items-center justify-end gap-1 rounded px-1 py-0.5 ${
            editable
              ? "cursor-pointer text-gray-900 hover:bg-gray-100"
              : "cursor-default text-gray-400"
          }`}
        >
          {editable && (
            <Pencil
              size={11}
              className="shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
          <span className="text-sm font-semibold tabular-nums">
            {pctText(partner.coverage)}
          </span>
        </button>
      )}
    </div>
  );
}
