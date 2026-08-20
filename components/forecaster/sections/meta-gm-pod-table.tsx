// components/forecaster/sections/meta-gm-pod-table.tsx
"use client";

/**
 * Meta — Phase 2: the "BY GM POD" table. Groups the (already dashboard-scoped)
 * mo_kpi_by_client rows by GM Pod and shows the full Meta divestment column set,
 * with a weighted grand-total row. Shares, variances and pacing are recomputed
 * from each group's summed dollars (never averaged), so the total row is exact.
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
function moneySigned(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function pctSigned(v: number | null, digits = 0): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}
function ppt(v: number | null, digits = 1): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}

interface PodTotals {
  pod: string;
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

/** Derived columns from a group's summed dollars / counts. */
function derive(t: PodTotals) {
  const metaShare2025 = safeDiv(t.meta2025, t.social2025);
  const metaShare2026 = safeDiv(t.meta2026, t.social2026);
  const yoyVarDollar = t.meta2026 - t.meta2025;
  const yoyVarPct = safeDiv(yoyVarDollar, t.meta2025);
  const spendPacing = safeDiv(t.meta2026, t.targetMeta);
  const shareVar =
    metaShare2026 !== null && metaShare2025 !== null
      ? metaShare2026 - metaShare2025
      : null;
  const targetShare = safeDiv(t.targetMeta, t.socialForecast);
  const otherShare2025 = safeDiv(t.other2025, t.social2025);
  const otherShare2026 = safeDiv(t.other2026, t.social2026);
  const otherShareVar =
    otherShare2026 !== null && otherShare2025 !== null
      ? otherShare2026 - otherShare2025
      : null;
  const miqPacing = safeDiv(t.miqMir, t.miqForecast);
  const pctDivested = safeDiv(t.divested, t.withTrend);
  return {
    metaShare2025,
    metaShare2026,
    yoyVarDollar,
    yoyVarPct,
    spendPacing,
    shareVar,
    targetShare,
    otherShare2026,
    otherShareVar,
    miqPacing,
    pctDivested,
  };
}

const HEADERS = [
  "GM Pod",
  "Meta 2025",
  "Social 2025",
  "Meta Share 2025",
  "Meta 2026",
  "Social 2026",
  "Meta Share 2026",
  "Meta Spend Var YoY $",
  "Meta Spend Var YoY %",
  "Social Forecast (RFQ)",
  "Target Meta Spend (-30%)",
  "Spend Pacing",
  "Meta Share Var vs 2025",
  "MIQ-Social Forecast",
  "MIQ-Social MIR",
  "MIQ-Social Pacing",
  "Target Meta Share 2026",
  "Other Platforms Share 2026",
  "Other Platform Share Var vs 2025",
  "% Clients Divested",
];

export default function MetaGmPodTable({ rows }: { rows: KpiByClientRow[] }) {
  const { pods, total } = useMemo(() => {
    const map = new Map<string, PodTotals>();
    const blank = (pod: string): PodTotals => ({
      pod,
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
    });

    for (const r of rows) {
      const pod = (r.GM_POD ?? "").toString().trim() || "—";
      const g = map.get(pod) ?? blank(pod);
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
      map.set(pod, g);
    }

    const pods = Array.from(map.values()).sort((a, b) => b.meta2026 - a.meta2026);

    const total = blank("Grand total");
    for (const g of pods) {
      total.meta2025 += g.meta2025;
      total.social2025 += g.social2025;
      total.meta2026 += g.meta2026;
      total.social2026 += g.social2026;
      total.socialForecast += g.socialForecast;
      total.targetMeta += g.targetMeta;
      total.other2025 += g.other2025;
      total.other2026 += g.other2026;
      total.miqMir += g.miqMir;
      total.miqForecast += g.miqForecast;
      total.divested += g.divested;
      total.withTrend += g.withTrend;
    }

    return { pods, total };
  }, [rows]);

  const cells = (t: PodTotals) => {
    const d = derive(t);
    return [
      money(t.meta2025),
      money(t.social2025),
      pct(d.metaShare2025),
      money(t.meta2026),
      money(t.social2026),
      pct(d.metaShare2026),
      moneySigned(d.yoyVarDollar),
      pctSigned(d.yoyVarPct),
      money(t.socialForecast),
      money(t.targetMeta),
      pct(d.spendPacing),
      ppt(d.shareVar),
      money(t.miqForecast),
      money(t.miqMir),
      pct(d.miqPacing),
      pct(d.targetShare),
      pct(d.otherShare2026),
      ppt(d.otherShareVar),
      pct(d.pctDivested),
    ];
  };

  return (
    <div data-scroll-section data-scroll-label="Meta by GM Pod">
      <ChartCard title="By GM Pod" icon={Users}>
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
                        : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pods.map((t) => (
                <tr key={t.pod} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left font-medium text-gray-900">
                    {t.pod}
                  </td>
                  {cells(t).map((c, i) => (
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
