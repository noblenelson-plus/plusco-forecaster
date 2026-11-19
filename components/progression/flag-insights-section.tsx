// components/progression/flag-insights-section.tsx
"use client";

/**
 * Milestones page — Section 2, "Insights by flag type". One table per flag
 * category (Forecast QA, RFQ Swings, Pacing) with a row per flag type — or per
 * group × flag type when grouped by GM / Agency / Region: clients flagged,
 * flags, $ up / down / net (CAD), justified share and the justification mix
 * ("% of flags due to Budget Cuts"…). Headers carry each type's threshold;
 * footnotes explain what the amounts cover.
 *
 * Built on the flags saved at the checkpoint (flag_history). Presentational —
 * the page loads the flags.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  computeContextSummary,
  computeFlagInsights,
  type ContextSummary,
  FLAG_CATEGORIES,
  FLAG_TYPES,
  GROUP_BY_OPTIONS,
  type ClientFlags,
  type ContextShare,
  type FlagTypeId,
  type FlagTypeStats,
  type GroupBy,
} from "../../lib/format/flag-insights";
import { FLAG_CONTEXTS } from "../../lib/types/forecast-flags.types";
import { formatCompactMoney } from "../dashboard/charts/format";
import { CATEGORICAL_COLORS, NEUTRAL_FILL } from "../dashboard/charts/colors";
import type { ConfirmationStep } from "../../lib/constants/confirmation-steps";
import { ScopeLine } from "./milestone-tracking-summary";
import RfqVarianceBand from "./rfq-variance-band";
import type { AxisVariance, VarianceAxis } from "../../lib/format/rfq-variance";

/** Swing flag type → the axis of its total variance tile. */
const SWING_AXIS: Partial<Record<FlagTypeId, VarianceAxis>> = {
  swing_media: "media",
  swing_revenue: "revenue",
  swing_labs: "labs",
};

export interface RfqVarianceView {
  variance: Record<VarianceAxis, AxisVariance> | null;
  rfqLabel: string;
  previousLabel: string | null;
  loading: boolean;
  error: string | null;
}

const CONTEXT_COLOR: Record<string, string> = Object.fromEntries([
  ...FLAG_CONTEXTS.map((c, i) => [c.value, CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]]),
  ["NOT_JUSTIFIED", NEUTRAL_FILL],
]);

const pctOf = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : "—";

export default function FlagInsightsSection({
  clients,
  activeClientCount,
  types,
  checkpoint,
  year,
  missingUsdRate,
  scopeNote,
  filtered,
  rfqVariance,
}: {
  /** RFQ total variance (above the RFQ Swings table). */
  rfqVariance: RfqVarianceView;
  /** Which clients the page covers (top filters). */
  scopeNote: string;
  /** Top filters active — "Total PlusCo" then reads "Total (filtered)". */
  filtered: boolean;
  /** Facet-filtered clients with their current flags (CAD multiplier set). */
  clients: ClientFlags[];
  /** Clients in scope (for "% of clients flagged"). */
  activeClientCount: number;
  /** Flag types selected in the filter bar (all when none picked). */
  types: FlagTypeId[];
  checkpoint: ConfirmationStep;
  year: number;
  /** USD clients present but no USD→CAD rate for the year (amounts kept in USD). */
  missingUsdRate: boolean;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("total");
  const stats = useMemo(
    () => computeFlagInsights(clients, types, groupBy),
    [clients, types, groupBy]
  );
  const shownCategories = FLAG_CATEGORIES.filter((c) =>
    FLAG_TYPES.some((t) => t.category === c.id && types.includes(t.id))
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Insights by flag type</h2>
          <p className="text-sm text-gray-500">
            Flags at <span className="font-semibold text-gray-900">{checkpoint.label} {year}</span>{" "}
            · amounts in CAD
          </p>
          <ScopeLine note={scopeNote} />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          View
          <div className="flex border border-gray-200" role="group" aria-label="Group flags by">
            {GROUP_BY_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={groupBy === g.id}
                onClick={() => setGroupBy(g.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  groupBy === g.id ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {g.id === "total" && filtered ? "Total (filtered)" : g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shownCategories.length === 0 ? (
        <p className="border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
          No flag type selected.
        </p>
      ) : (
        shownCategories.map((cat) => (
          <CategoryTable
            key={cat.id}
            label={cat.label}
            typeIds={FLAG_TYPES.filter((t) => t.category === cat.id && types.includes(t.id)).map((t) => t.id)}
            stats={stats.filter((s) => s.type.category === cat.id)}
            grouped={groupBy !== "total"}
            groupLabel={GROUP_BY_OPTIONS.find((g) => g.id === groupBy)!.label}
            activeClientCount={activeClientCount}
            header={
              cat.id === "rfq_swings" ? (
                <RfqVarianceBand
                  {...rfqVariance}
                  axes={types.map((t) => SWING_AXIS[t]).filter((a): a is VarianceAxis => !!a)}
                />
              ) : null
            }
            summary={computeContextSummary(
              clients,
              FLAG_TYPES.filter((t) => t.category === cat.id && types.includes(t.id)).map((t) => t.id)
            )}
          />
        ))
      )}

      {/* Footnotes */}
      <div className="space-y-1 text-xs text-gray-500">
        <p className="flex gap-1.5">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold text-gray-700">RFQ swings:</span> the table only counts the
            changes that crossed the threshold (the ones that needed a justification). The total variance
            above shows the whole change and how much of it is justified.
          </span>
        </p>
        <p className="pl-[19px]">
          Flags as saved at each client&apos;s last validation of this milestone, with the justifications
          written since. Clients that haven&apos;t validated it yet have no flags here. Up / Down sum the
          positive and negative gaps.
          {missingUsdRate && " No USD→CAD rate is set for this year — USD clients are added as-is."}
        </p>
      </div>
    </section>
  );
}

function CategoryTable({
  label,
  typeIds,
  stats,
  grouped,
  groupLabel,
  activeClientCount,
  summary,
  header,
}: {
  /** Shown under the title, above the table (RFQ Swings: total variance). */
  header?: ReactNode;
  /** Justification reasons across the category (whole selection, not per group). */
  summary: ContextSummary;
  label: string;
  typeIds: FlagTypeId[];
  stats: FlagTypeStats[];
  grouped: boolean;
  groupLabel: string;
  activeClientCount: number;
}) {
  // Ungrouped: one row per selected type, zero rows included (a type with no
  // flag is a result too). Grouped: only groups that have flags.
  const rows: (FlagTypeStats | { type: (typeof FLAG_TYPES)[number]; empty: true })[] = grouped
    ? stats
    : typeIds.map((id) => stats.find((s) => s.type.id === id) ?? { type: FLAG_TYPES.find((t) => t.id === id)!, empty: true as const });

  return (
    <div className="border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      </div>
      {header}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          {/* Same column widths in every category table, so they line up. The
              justification mix has a fixed, moderate width (room for its
              reasons without dominating the row); the flag name takes the rest. */}
          <colgroup>
            {grouped && <col className="w-44" />}
            <col />
            <col className="w-20" />
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-[26rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase tracking-wide text-gray-500">
            <tr className="border-b border-gray-100">
              {grouped && <th className="px-4 py-2 text-left font-semibold">{groupLabel}</th>}
              <th className="px-4 py-2 text-left font-semibold">Flag</th>
              <th className="px-2 py-2 text-right font-semibold">Clients</th>
              <th className="px-2 py-2 text-right font-semibold">Flags</th>
              <th className="px-2 py-2 text-right font-semibold">Up</th>
              <th className="px-2 py-2 text-right font-semibold">Down</th>
              <th className="px-2 py-2 text-right font-semibold">Net</th>
              <th className="px-2 py-2 text-right font-semibold">Justified</th>
              <th className="px-4 py-2 text-left font-semibold">Justification mix</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={grouped ? 9 : 8} className="px-4 py-6 text-center text-sm text-gray-400">
                  No flags.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const empty = "empty" in r;
                const s = empty ? null : (r as FlagTypeStats);
                return (
                  <tr key={`${s?.group ?? ""}-${r.type.id}`} className="border-b border-gray-100 align-top">
                    {grouped && (
                      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{s?.group}</td>
                    )}
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{r.type.label}</div>
                      {!grouped && (
                        <div className="mt-0.5 max-w-md text-[11px] text-gray-500">{r.type.threshold}</div>
                      )}
                    </td>
                    {s ? (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                          {s.clients}
                          <div className="text-[11px] text-gray-400">{pctOf(s.clients, s.groupClients || activeClientCount)}</div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">{s.flags}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                          {s.up ? `+${formatCompactMoney(s.up)}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                          {s.down ? formatCompactMoney(s.down) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {s.net > 0 ? "+" : ""}
                          {formatCompactMoney(s.net)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                          {r.type.id === "labs_error" ? "n/a" : pctOf(s.justified, s.flags)}
                        </td>
                        <td className="px-4 py-2">
                          <ContextMix contexts={s.contexts} total={s.flags} />
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="px-2 py-2 text-left text-sm text-gray-400">
                        No flags.
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {/* Justification reasons across the whole category: % of flags and % of
          the category's flagged clients per reason. */}
      {summary.totalFlags > 0 && (
        <div className="border-t border-gray-200 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Justification reasons · {summary.totalFlags} flag{summary.totalFlags !== 1 ? "s" : ""} ·{" "}
            {summary.totalClients} client{summary.totalClients !== 1 ? "s" : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700">
            {summary.rows.map((r) => (
              <span key={r.context} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5" style={{ background: CONTEXT_COLOR[r.context] }} aria-hidden="true" />
                <span className="font-medium text-gray-900">{r.label}</span>
                {pctOf(r.flags, summary.totalFlags)} of flags · {r.clients} client{r.clients !== 1 ? "s" : ""} (
                {pctOf(r.clients, summary.totalClients)})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMix({ contexts, total }: { contexts: ContextShare[]; total: number }) {
  if (total === 0) return null;
  return (
    <div>
      <div
        className="flex h-2.5 w-full bg-gray-100"
        title={contexts.map((c) => `${c.label}: ${c.flags} (${pctOf(c.flags, total)})`).join(" · ")}
      >
        {contexts.map((c) => (
          <div
            key={c.context}
            style={{ width: `${(c.flags / total) * 100}%`, background: CONTEXT_COLOR[c.context] }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-gray-600">
        {contexts.slice(0, 3).map((c) => (
          <span key={c.context} className="flex items-center gap-1">
            <span className="h-2 w-2" style={{ background: CONTEXT_COLOR[c.context] }} aria-hidden="true" />
            {c.label} {pctOf(c.flags, total)}
          </span>
        ))}
        {contexts.length > 3 && <span className="text-gray-400">+{contexts.length - 3} more</span>}
      </div>
    </div>
  );
}
