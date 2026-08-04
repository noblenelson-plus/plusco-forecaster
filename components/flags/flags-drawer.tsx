// components/flags/flags-drawer.tsx
"use client";

/**
 * Read-only flags panel for the dashboard. Slides in from the right as an
 * in-layout side panel (the dashboard content shrinks to make room — see the
 * margin transition on the page root; there is no dimming scrim). Lists the
 * persisted swing / under-target flags of every client in the current filter
 * scope, for the globally-selected Year + RFQ, narrowed to one axis (Media
 * Spend / Labs / Revenue — matching the active tab), grouped by client.
 *
 * Purely a viewer: no justification editing here (that stays on the Flags
 * page). Data is fetched by the page (`useScopeFlags`) and passed in, so the
 * tab's Flags button can show the same live count. Reuses the Flags page's
 * presentation (axis stripe, yellow "to justify" vs white "justified" surface).
 */

import { useEffect } from "react";
import { X, Flag, AlertTriangle, Check, Loader2 } from "lucide-react";
import { AXIS_STYLE } from "./axis-style";
import { flagName, formatMonths } from "./flag-card";
import type { ScopeFlagsData } from "../../lib/dashboard/data/use-scope-flags";
import { formatMoney, formatSigned } from "../../lib/format/money";
import { flagContextLabel, flagDrift, type StoredFlag } from "../../lib/types/forecast-flags.types";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { RFQType } from "../../lib/types/rfq.types";

export default function FlagsDrawer({
  open,
  onClose,
  axis,
  year,
  rfq,
  clientCount,
  data,
  userNameById,
}: {
  open: boolean;
  onClose: () => void;
  axis: AxisId;
  year: number | null;
  rfq: RFQType | null;
  /** Clients in the current filter scope (for the empty-state copy). */
  clientCount: number;
  data: ScopeFlagsData;
  /** uid → display name, to attribute justifications. */
  userNameById?: Map<string, string>;
}) {
  const { loading, error, byClient, total, unjustified } = data;

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const contextLabel =
    year !== null && rfq !== null ? `${rfq} · ${year}` : "No submission selected";

  return (
    <div
      role="dialog"
      aria-label={`${AXIS_STYLE[axis].label} flags`}
      aria-hidden={!open}
      className={`fixed top-0 right-0 z-40 flex h-full w-full flex-col border-l border-gray-200 bg-white transition-transform duration-200 ease-in-out lg:w-96 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-900 px-6 py-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Flag size={16} className="flex-shrink-0" />
            {AXIS_STYLE[axis].label} flags
          </h2>
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {contextLabel}
            {!loading && total > 0 && (
              <>
                {" · "}
                {total} flag{total === 1 ? "" : "s"}
                {unjustified > 0 ? ` · ${unjustified} to justify` : " · all justified"}
              </>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            {error}
          </div>
        ) : year === null || rfq === null ? (
          <EmptyState message="Select a Year and RFQ to see flags." />
        ) : clientCount === 0 ? (
          <EmptyState message="No clients are in scope for the current filters." />
        ) : byClient.length === 0 ? (
          <EmptyState
            icon="clear"
            message={`No ${AXIS_STYLE[axis].label} flags for the ${clientCount} client${
              clientCount === 1 ? "" : "s"
            } in scope.`}
          />
        ) : (
          <div className="space-y-6">
            {byClient.map((c) => (
              <div key={c.clientId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900" title={c.clientName}>
                    {c.clientName}
                  </h3>
                  <span className="flex-shrink-0 text-[11px] font-medium text-gray-400">
                    {c.flags.length} flag{c.flags.length === 1 ? "" : "s"}
                  </span>
                </div>
                {c.flags.map((flag) => (
                  <FlagItem key={flag.key} flag={flag} userNameById={userNameById} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note — this is a viewer; editing lives on the Flags page. */}
      <div className="border-t border-gray-100 px-6 py-3 text-[11px] text-gray-400">
        Read-only. Justify flags on the Flags page.
      </div>
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: "clear" }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 border border-dashed border-gray-200 px-6 text-center text-sm text-gray-400">
      {icon === "clear" && <Check size={20} className="text-green-500" />}
      {message}
    </div>
  );
}

/** Justification date "Justified on 2026-08-04", tolerant of a bad stamp. */
function justifiedDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA");
}

/** One flag, read-only — the summary half of the Flags page's FlagCard, plus
 *  the full justification for justified flags. */
function FlagItem({
  flag,
  userNameById,
}: {
  flag: StoredFlag;
  userNameById?: Map<string, string>;
}) {
  const drift = flagDrift(flag);
  const byName = flag.justifiedBy ? userNameById?.get(flag.justifiedBy) : undefined;
  const dateLabel = justifiedDate(flag.justifiedAt);
  return (
    <div
      className={`border border-l-4 ${AXIS_STYLE[flag.axis].stripe} ${
        flag.justified ? "border-gray-200 bg-white" : "border-yellow-400 bg-yellow-400"
      }`}
    >
      <div className={`px-4 py-3 ${flag.justified ? "text-gray-800" : "text-gray-900"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            {flag.justified ? (
              <Check size={15} className="flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle size={15} className="flex-shrink-0 text-gray-800" />
            )}
            <span>{flagName(flag)}</span>
          </div>
          <span className="flex-shrink-0 font-bold tabular-nums">{formatSigned(flag.delta)}</span>
        </div>

        <p className="mt-1.5 text-[13px] tabular-nums">
          <span className="font-semibold">{formatMoney(flag.current)}</span>
          {" vs "}
          <span>{formatMoney(flag.reference)}</span>
          <span className={`ml-1 ${flag.justified ? "text-gray-400" : "text-gray-600"}`}>
            {flag.category === "swing" ? "· prev RFQ" : "· forecast"}
          </span>
        </p>

        {flag.category === "under_target" && (
          <p className={`mt-1 text-[11px] ${flag.justified ? "text-gray-400" : "text-gray-700"}`}>
            Months analyzed: {formatMonths(flag.analyzedMonths ?? [])}
          </p>
        )}

        {flag.justified && (
          <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Justification
            </p>
            {flag.context && (
              <p className="mt-0.5 text-[12px] font-semibold text-gray-700">
                {flagContextLabel(flag.context)}
              </p>
            )}
            {flag.note && <p className="mt-0.5 text-[12px] text-gray-600">{flag.note}</p>}
            {(byName || dateLabel) && (
              <p className="mt-1 text-[10px] text-gray-400">
                {byName ? `by ${byName}` : ""}
                {byName && dateLabel ? " · " : ""}
                {dateLabel ?? ""}
              </p>
            )}
          </div>
        )}

        {drift.changed && (
          <p className="mt-1 text-[11px] font-medium text-gray-700">
            Justified when it was {formatSigned(drift.fromDelta)} — now {formatSigned(drift.toDelta)}.
          </p>
        )}
      </div>
    </div>
  );
}
