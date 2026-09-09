// components/forecaster/sections/labs-pod-matrix.tsx
"use client";

/**
 * "By GM Pod" view for the exec-KPI Labs Pacing sub-tab — TWO separate cards,
 * side by side, matching the other side-by-side chart pairs on the dashboard:
 *   - left (wider):  RAG heatmap, partner × GM pod, % of target booked
 *   - right (narrower): per-pod dollar summary (Target · Booked · Variance · %)
 * Both come from the same GmPodMatrix, so they tie out.
 *
 * The heatmap card has a % / $ toggle in its header: "%" = % of target booked;
 * "$" = the numerator, $ Booked, per cell. RAG colour is ALWAYS driven by %
 * booked, so the "who's behind" story reads the same in either mode.
 */

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import { pacingHeat, type GmPodMatrix } from "./labs-pacing-data";
import { formatMoney } from "../../../lib/format/money";

type CellMode = "pct" | "booked";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

/** Full dollars for the summary table; "—" for 0. */
const money = (v: number) => {
  const s = formatMoney(Math.abs(v));
  if (s === "—") return "—";
  return v < 0 ? `-$${s}` : `$${s}`;
};

/** Compact dollars for the dense heatmap cells ($1.2M / $430K / $0). */
const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
};

export default function LabsPodMatrix({ matrix }: { matrix: GmPodMatrix }) {
  const { pods, rows, colTotals, grandTotal, podTotals, grand } = matrix;
  const [mode, setMode] = useState<CellMode>("pct");

  const summary = pods
    .map((pod) => ({
      pod,
      target: podTotals[pod]?.target ?? 0,
      booked: podTotals[pod]?.booked ?? 0,
      pctBooked: colTotals[pod] ?? null,
    }))
    .sort((a, b) => b.target - a.target);

  const cellText = (v: number | null, booked: number) =>
    v === null ? "—" : mode === "pct" ? pct(v) : compact(booked);

  const toggle = (
    <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-medium">
      <button
        type="button"
        onClick={() => setMode("pct")}
        className={`px-2.5 py-1 ${mode === "pct" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
      >
        %
      </button>
      <button
        type="button"
        onClick={() => setMode("booked")}
        className={`px-2.5 py-1 ${mode === "booked" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
      >
        $
      </button>
    </div>
  );

  return (
    // Left card wider than the right (heatmap needs the room).
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ── Heatmap card ───────────────────────────────────────────────────── */}
      <ChartCard title="By GM Pod — % of Target Booked" icon={BarChart3} action={toggle}>
        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No Labs pacing data for this scope.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Partner</th>
                  {pods.map((pod) => (
                    <th key={pod} className="px-3 py-2 text-right font-medium whitespace-nowrap">{pod}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Grand total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.partnerId} className="border-b border-border/60">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">
                      {row.partnerName}
                    </td>
                    {pods.map((pod) => (
                      <td key={pod} className="px-3 py-2 text-right tabular-nums" style={pacingHeat(row.byPod[pod])}>
                        {cellText(row.byPod[pod], row.byPodDollars[pod]?.booked ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums" style={pacingHeat(row.total)}>
                      {row.total === null ? "—" : mode === "pct" ? pct(row.total) : compact(row.bookedTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                  <td className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">Grand total</td>
                  {pods.map((pod) => (
                    <td key={pod} className="px-3 py-2 text-right tabular-nums" style={pacingHeat(colTotals[pod] ?? null)}>
                      {mode === "pct" ? pct(colTotals[pod] ?? null) : compact(podTotals[pod]?.booked ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums" style={pacingHeat(grandTotal)}>
                    {mode === "pct" ? pct(grandTotal) : compact(grand.booked)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ChartCard>

      {/* ── Summary card ───────────────────────────────────────────────────── */}
      <ChartCard title="By GM Pod — Summary" icon={Table2}>
        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No Labs pacing data for this scope.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">GM Pod</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Target (RFQ2)</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Booked (MIR)</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">$ Variance</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">% Booked</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.pod} className="border-b border-border/60">
                    <td className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">{r.pod}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(r.target)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(r.booked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(r.booked - r.target)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={pacingHeat(r.pctBooked)}>{pct(r.pctBooked)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                  <td className="px-3 py-2 text-left">Grand total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(grand.target)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(grand.booked)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(grand.booked - grand.target)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={pacingHeat(grandTotal)}>{pct(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}