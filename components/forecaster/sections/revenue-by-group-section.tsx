// components/forecaster/sections/revenue-by-group-section.tsx
"use client";

/**
 * Revenues tab — "Revenue by Agency / Region / GM": the Client Revenue numbers
 * rolled up by group, primary vs comparison submission (Time & Context, e.g.
 * 2027 RFQ1 vs 2026 FINAL), so GMs see where revenue is growing or falling
 * short year over year (hiring decisions). Click a group to see the clients
 * behind its change. Biggest drop first. Same modes / revenue-types filter /
 * scope as the Client Revenue table, so the grand totals match it.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useReadableClients } from "../../../lib/hooks/use-readable-clients";
import { computeClientRevenue } from "./client-revenue-data";
import {
  computeRevenueByGroup,
  REVENUE_GROUP_OPTIONS,
  type RevenueGroupBy,
} from "./revenue-by-group-data";
import type {
  RevenueMode,
  ScopeForecastData,
} from "../../../lib/dashboard/data/use-scope-forecast-data";

const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-CA")}`;
const signedMoney = (v: number) => (v > 0 ? `+${money(v)}` : money(v));
const signedPct = (v: number | null) =>
  v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const changeClass = (v: number) =>
  v < 0 ? "text-red-600" : v > 0 ? "text-green-700" : "text-muted-foreground";

export default function RevenueByGroupSection({
  data,
  comparisonData,
  scopedClientIds,
  primaryMode,
  secondaryMode,
  selectedStreams,
  revenueTypeFiltered,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  scopedClientIds: string[];
  primaryMode: RevenueMode;
  secondaryMode: RevenueMode;
  selectedStreams: ReadonlySet<string>;
  revenueTypeFiltered: boolean;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();
  const usersMap = useUsersMap();
  const { clients } = useReadableClients();
  const [by, setBy] = useState<RevenueGroupBy>("agency");
  const [open, setOpen] = useState<string | null>(null);

  const hasComparison = comparisonData.hasContext;
  // Same rule as the Client Revenue table: a filtered revenue type → BL vs BL.
  const effPrimaryMode: RevenueMode = revenueTypeFiltered ? "blSubmission" : primaryMode;
  const effSecondaryMode: RevenueMode = revenueTypeFiltered ? "blSubmission" : secondaryMode;

  const clientRows = useMemo(
    () =>
      computeClientRevenue(
        data,
        comparisonData,
        clients,
        usersMap,
        selectedYear ?? new Date().getFullYear(),
        scopedClientIds,
        effPrimaryMode,
        effSecondaryMode,
        hasComparison,
        selectedStreams
      ),
    [data, comparisonData, clients, usersMap, selectedYear, scopedClientIds, effPrimaryMode, effSecondaryMode, hasComparison, selectedStreams]
  );
  const groups = useMemo(
    () => computeRevenueByGroup(clientRows.rows, clients, by),
    [clientRows.rows, clients, by]
  );

  const primaryLabel = selectedRFQ ? `${selectedRFQ.type} · ${selectedYear}` : "Primary";
  const secondaryLabel = comparisonRFQ ? `${comparisonRFQ.type} · ${comparisonYear}` : "Comparison";
  const total = clientRows.totalPrimary - clientRows.totalSecondary;
  const groupLabel = REVENUE_GROUP_OPTIONS.find((o) => o.id === by)!.label;

  return (
    <ChartCard
      title={`Revenue by ${groupLabel}`}
      subtitle={
        hasComparison
          ? `${primaryLabel} vs ${secondaryLabel} · biggest drop first · click a row to see its clients`
          : `${primaryLabel} · pick a comparison in Time & Context to see the change`
      }
      icon={Users}
      action={
        <div className="inline-flex border border-border bg-card p-0.5" role="group" aria-label="Group revenue by">
          {REVENUE_GROUP_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={by === o.id}
              onClick={() => {
                setBy(o.id);
                setOpen(null);
              }}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                by === o.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">{groupLabel}</th>
              <th className="px-3 py-2 text-right font-medium">Clients</th>
              <th className="px-3 py-2 text-right font-medium">{primaryLabel}</th>
              {hasComparison && (
                <>
                  <th className="px-3 py-2 text-right font-medium">{secondaryLabel}</th>
                  <th className="px-3 py-2 text-right font-medium">Change $</th>
                  <th className="px-3 py-2 text-right font-medium">Change %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isOpen = open === g.group;
              return (
                <Fragment key={g.group}>
                  <tr
                    className="cursor-pointer border-b border-border/60 hover:bg-muted"
                    onClick={() => setOpen(isOpen ? null : g.group)}
                    aria-expanded={isOpen}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {g.group}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{g.clients}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(g.primary)}</td>
                    {hasComparison && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{money(g.secondary)}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${changeClass(g.change)}`}>
                          {signedMoney(g.change)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${changeClass(g.change)}`}>
                          {signedPct(g.changePct)}
                        </td>
                      </>
                    )}
                  </tr>
                  {isOpen &&
                    g.members.map((m) => {
                      const ch = m.primary - m.secondary;
                      return (
                        <tr key={m.clientId} className="border-b border-border/40 text-xs">
                          <td className="py-1.5 pl-9 pr-3 text-foreground">
                            {m.name}
                            <span className="ml-2 text-muted-foreground">{m.businessLead}</span>
                          </td>
                          <td />
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(m.primary)}</td>
                          {hasComparison && (
                            <>
                              <td className="px-3 py-1.5 text-right tabular-nums">{money(m.secondary)}</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${changeClass(ch)}`}>
                                {signedMoney(ch)}
                              </td>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${changeClass(ch)}`}>
                                {signedPct(m.secondary !== 0 ? (ch / Math.abs(m.secondary)) * 100 : null)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
              <td className="px-3 py-2">Grand total</td>
              <td className="px-3 py-2 text-right tabular-nums">{clientRows.rows.length}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(clientRows.totalPrimary)}</td>
              {hasComparison && (
                <>
                  <td className="px-3 py-2 text-right tabular-nums">{money(clientRows.totalSecondary)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${changeClass(total)}`}>{signedMoney(total)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${changeClass(total)}`}>
                    {signedPct(clientRows.totalSecondary !== 0 ? (total / Math.abs(clientRows.totalSecondary)) * 100 : null)}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartCard>
  );
}
