// components/forecaster/sections/meta-gm-pod-trend-table.tsx
"use client";

/**
 * Meta — the second "BY GM POD" table: broken down by GM Pod AND Meta Share
 * Trend (Flat / Increasing / Divested). Each pod shows one sub-row per trend
 * bucket, with a weighted grand-total row. Same synced source as the other Meta
 * tables (mo_kpi_by_client), already dashboard-scoped by MetaSection.
 */

import { useMemo } from "react";
import { Users } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

// ─── Formatting ────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function ppt(v: number | null, digits = 1): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}
function trendRank(t: string): number {
  const s = t.toLowerCase();
  if (s.includes("flat")) return 0;
  if (s.includes("increas")) return 1;
  if (s.includes("divest")) return 2;
  return 3;
}

interface Totals {
  pod: string;
  trend: string;
  meta2025: number;
  social2025: number;
  meta2026: number;
  social2026: number;
  socialForecast: number;
  targetMeta: number;
  other2025: number;
  other2026: number;
  miqMir: number;
  miqForecast: number;
  divested: number;
  withTrend: number;
}

function blank(pod: string, trend: string): Totals {
  return {
    pod,
    trend,
    meta2025: 0,
    social2025: 0,
    meta2026: 0,
    social2026: 0,
    socialForecast: 0,
    targetMeta: 0,
    other2025: 0,
    other2026: 0,
    miqMir: 0,
    miqForecast: 0,
    divested: 0,
    withTrend: 0,
  };
}

function accumulate(g: Totals, r: KpiByClientRow) {
  g.meta2025 += num(r.meta_spend_2025);
  g.social2025 += num(r.social_spend_2025);
  g.meta2026 += num(r.meta_spend_2026);
  g.social2026 += num(r.social_spend_2026);
  g.socialForecast += num(r.social_forecast_rfq1);
  g.targetMeta += num(r.target_meta_spend_2026);
  g.other2025 += num(r.other_platforms_spend_2025);
  g.other2026 += num(r.other_platforms_spend_2026);
  g.miqMir += num(r.miq_social_spend_2026);
  g.miqForecast += num(r.miq_social_forecast_2026);
  const trend = (r.meta_share_trend ?? "").toString().trim();
  if (trend) {
    g.withTrend += 1;
    if (trend.toLowerCase().includes("divest")) g.divested += 1;
  }
}

/** The 12 metric cells for a group, in Looker's order. */
function cells(t: Totals): string[] {
  const metaShare2025 = safeDiv(t.meta2025, t.social2025);
  const metaShare2026 = safeDiv(t.meta2026, t.social2026);
  const pctDivested = safeDiv(t.divested, t.withTrend);
  const targetShare = safeDiv(t.targetMeta, t.socialForecast);
  const spendPacing = safeDiv(t.meta2026, t.targetMeta);
  const miqPacing = safeDiv(t.miqMir, t.miqForecast);
  const otherShare2025 = safeDiv(t.other2025, t.social2025);
  const otherShare2026 = safeDiv(t.other2026, t.social2026);
  const otherShareVar =
    otherShare2026 !== null && otherShare2025 !== null
      ? otherShare2026 - otherShare2025
      : null;
  return [
    pct(metaShare2025),
    pct(metaShare2026),
    pct(pctDivested),
    pct(targetShare),
    money(t.targetMeta),
    money(t.meta2026),
    pct(spendPacing),
    money(t.miqForecast),
    money(t.miqMir),
    pct(miqPacing),
    pct(otherShare2026),
    ppt(otherShareVar),
  ];
}

const HEADERS = [
  "GM Pod",
  "Meta Share Trend",
  "Meta Share 2025",
  "Meta Share 2026",
  "% Clients Divested",
  "Target Meta Share 2026",
  "Target Meta Spend (-30%)",
  "Meta 2026",
  "Spend Pacing",
  "MIQ-Social Forecast",
  "MIQ-Social MIR",
  "MIQ-Social Pacing",
  "Other Platforms Share 2026",
  "Other Platform Share Var vs 2025",
];

export default function MetaGmPodTrendTable({ rows }: { rows: KpiByClientRow[] }) {
  const { display, total } = useMemo(() => {
    // pod -> trend -> totals
    const podMap = new Map<string, Map<string, Totals>>();
    for (const r of rows) {
      const pod = (r.GM_POD ?? "").toString().trim() || "—";
      const trend = (r.meta_share_trend ?? "").toString().trim() || "—";
      if (!podMap.has(pod)) podMap.set(pod, new Map());
      const tm = podMap.get(pod)!;
      const g = tm.get(trend) ?? blank(pod, trend);
      accumulate(g, r);
      tm.set(trend, g);
    }

    // Sort pods by their total 2026 meta spend, then flatten to trend sub-rows.
    const podEntries = Array.from(podMap.entries()).map(([pod, tm]) => {
      const trends = Array.from(tm.values()).sort(
        (a, b) => trendRank(a.trend) - trendRank(b.trend)
      );
      const podMeta2026 = trends.reduce((acc, t) => acc + t.meta2026, 0);
      return { pod, trends, podMeta2026 };
    });
    podEntries.sort((a, b) => b.podMeta2026 - a.podMeta2026);

    // display rows carry a "firstOfPod" flag so the pod label shows only once.
    const display: { row: Totals; firstOfPod: boolean }[] = [];
    for (const { trends } of podEntries) {
      trends.forEach((row, i) => display.push({ row, firstOfPod: i === 0 }));
    }

    const total = blank("Grand total", "");
    for (const r of rows) accumulate(total, r);

    return { display, total };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta by GM Pod and trend">
      <ChartCard title="By GM Pod × Meta Share Trend" icon={Users}>
        <div className="-mx-2 mt-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                {HEADERS.map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                      i === 0
                        ? "sticky left-0 z-10 bg-gray-50 text-left"
                        : i === 1
                        ? "text-left"
                        : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.map(({ row, firstOfPod }, idx) => (
                <tr
                  key={`${row.pod}::${row.trend}::${idx}`}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    firstOfPod ? "border-t border-gray-200" : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left font-medium text-gray-900">
                    {firstOfPod ? row.pod : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-gray-700">
                    {row.trend}
                  </td>
                  {cells(row).map((c, i) => (
                    <td
                      key={i}
                      className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700"
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 bg-gray-100 font-semibold text-gray-900">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-gray-100 px-3 py-2.5 text-left">
                  {total.pod}
                </td>
                <td className="bg-gray-100 px-3 py-2.5" />
                {cells(total).map((c, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                  >
                    {c}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
