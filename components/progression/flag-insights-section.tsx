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
 * Built on the CURRENT stored flags of the checkpoint's RFQ (no per-milestone
 * history yet). Presentational — the page loads the flags.
 */

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  computeFlagInsights,
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
}: {
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
            Current flags on <span className="font-semibold text-gray-900">{checkpoint.targetRfq} {year}</span>{" "}
            (the round {checkpoint.label} validates) · amounts in CAD
          </p>
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
                {g.label}
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
          />
        ))
      )}

      {/* Footnotes */}
      <div className="space-y-1 text-xs text-gray-500">
        <p className="flex gap-1.5">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold text-gray-700">RFQ swings:</span> the amounts only cover the
            clients whose swing crossed the threshold (the ones that needed a justification). The total
            change between the two RFQs can be larger — e.g. a $1M revenue change of which only $500K
            sits in clients that moved by ±$50K or more.
          </span>
        </p>
        <p className="pl-[19px]">
          Flags are the current ones of each submission: a flag fixed or no longer triggered at the last
          validation is not counted (no history per milestone yet). Prelim and RFQ checkpoints of the
          same round share the same flags. Up / Down sum the positive and negative gaps.
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
}: {
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
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          {/* Same column widths in every category table, so they line up. */}
          <colgroup>
            {grouped && <col className="w-44" />}
            <col />
            <col className="w-20" />
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-72" />
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
