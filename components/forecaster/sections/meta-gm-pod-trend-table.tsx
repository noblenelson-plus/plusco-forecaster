// components/forecaster/sections/meta-gm-pod-trend-table.tsx
"use client";

/**
 * Meta — the second "BY GM POD" table: broken down by GM Pod AND Meta Share
 * Trend (Flat / Increasing / Divested). Each pod shows one sub-row per trend
 * bucket, with a weighted grand-total row. Same synced source as the other Meta
 * tables (mo_kpi_by_client), already dashboard-scoped by MetaSection.
 *
 * UI — standardized to the app's table DNA: shared TableColumn descriptors,
 * a ChartCard with an "Export" action, and the semantic-token styling shared
 * with the other Meta tables. The pod label still shows only on the first
 * sub-row on screen (via each row's firstOfPod flag), but the export fills the
 * pod on every row so the Sheet is self-contained. Numbers/order are unchanged.
 */

import { useMemo } from "react";
import { Users } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import { num, money, pct, ppt, safeDiv, shareVar } from "./meta-format";

function trendRank(t: string): number {
  const s = t.toLowerCase();
  if (s.includes("flat")) return 0;
  if (s.includes("increas")) return 1;
  if (s.includes("divest")) return 2;
  return 3;
}

/** One (pod × trend) group's summed dollars / counts. */
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

/** A rendered/exported row: a group total plus the "show the pod label?" flag. */
type TrendRow = Totals & { firstOfPod: boolean };

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

const COLUMNS: TableColumn<TrendRow, TrendRow>[] = [
  {
    id: "gm_pod",
    label: "GM Pod",
    group: "By GM Pod x Trend",
    kind: "text",
    align: "left",
    pinned: true,
    width: 200,
    raw: (t) => t.pod,
    display: (t) => (t.firstOfPod ? t.pod : ""),
    total: (t) => t.pod,
  },
  {
    id: "meta_share_trend",
    label: "Meta Share Trend",
    group: "By GM Pod x Trend",
    kind: "text",
    align: "left",
    raw: (t) => t.trend,
    display: (t) => t.trend,
  },
  {
    id: "meta_share_2025",
    label: "Meta Share 2025",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2025, t.social2025),
    display: (t) => pct(safeDiv(t.meta2025, t.social2025)),
    total: (t) => pct(safeDiv(t.meta2025, t.social2025)),
  },
  {
    id: "meta_share_2026",
    label: "Meta Share 2026",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2026, t.social2026),
    display: (t) => pct(safeDiv(t.meta2026, t.social2026)),
    total: (t) => pct(safeDiv(t.meta2026, t.social2026)),
  },
  {
    id: "pct_clients_divested",
    label: "% Clients Divested",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.divested, t.withTrend),
    display: (t) => pct(safeDiv(t.divested, t.withTrend)),
    total: (t) => pct(safeDiv(t.divested, t.withTrend)),
  },
  {
    id: "target_meta_share_2026",
    label: "Target Meta Share 2026",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.targetMeta, t.socialForecast),
    display: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
    total: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
  },
  {
    id: "target_meta_spend",
    label: "Target Meta Spend (-30%)",
    group: "By GM Pod x Trend",
    kind: "money",
    align: "right",
    raw: (t) => t.targetMeta,
    display: (t) => money(t.targetMeta),
    total: (t) => money(t.targetMeta),
    totalRaw: (t) => t.targetMeta,
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "By GM Pod x Trend",
    kind: "money",
    align: "right",
    raw: (t) => t.meta2026,
    display: (t) => money(t.meta2026),
    total: (t) => money(t.meta2026),
    totalRaw: (t) => t.meta2026,
  },
  {
    id: "spend_pacing",
    label: "Spend Pacing",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2026, t.targetMeta),
    display: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
    total: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
  },
  {
    id: "miq_social_forecast",
    label: "MIQ-Social Forecast",
    group: "By GM Pod x Trend",
    kind: "money",
    align: "right",
    raw: (t) => t.miqForecast,
    display: (t) => money(t.miqForecast),
    total: (t) => money(t.miqForecast),
    totalRaw: (t) => t.miqForecast,
  },
  {
    id: "miq_social_mir",
    label: "MIQ-Social MIR",
    group: "By GM Pod x Trend",
    kind: "money",
    align: "right",
    raw: (t) => t.miqMir,
    display: (t) => money(t.miqMir),
    total: (t) => money(t.miqMir),
    totalRaw: (t) => t.miqMir,
  },
  {
    id: "miq_social_pacing",
    label: "MIQ-Social Pacing",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.miqMir, t.miqForecast),
    display: (t) => pct(safeDiv(t.miqMir, t.miqForecast)),
    total: (t) => pct(safeDiv(t.miqMir, t.miqForecast)),
  },
  {
    id: "other_platforms_share_2026",
    label: "Other Platforms Share 2026",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.other2026, t.social2026),
    display: (t) => pct(safeDiv(t.other2026, t.social2026)),
    total: (t) => pct(safeDiv(t.other2026, t.social2026)),
  },
  {
    id: "other_share_var_vs_2025",
    label: "Other Platform Share Var vs 2025",
    group: "By GM Pod x Trend",
    kind: "percent",
    align: "right",
    raw: (t) => shareVar(t.other2026, t.social2026, t.other2025, t.social2025),
    display: (t) =>
      ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)),
    total: (t) =>
      ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)),
  },
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
    const display: TrendRow[] = [];
    for (const { trends } of podEntries) {
      trends.forEach((row, i) =>
        display.push({ ...row, firstOfPod: i === 0 })
      );
    }

    const totalBase = blank("Grand total", "");
    for (const r of rows) accumulate(totalBase, r);
    const total: TrendRow = { ...totalBase, firstOfPod: true };

    return { display, total };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta by GM Pod and trend">
      <ChartCard
        title="By GM Pod × Meta Share Trend"
        icon={Users}
        action={
          <ExportSheetButton
            columns={COLUMNS}
            rows={display}
            totals={total}
            title="Meta — By GM Pod x Meta Share Trend"
            sheetTitle="Meta by GM Pod x Trend"
            includeTotals
          />
        }
      >
        <div className="-mx-2 mt-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                      c.align === "left" ? "text-left" : "text-right"
                    } ${c.pinned ? "sticky left-0 z-10 bg-muted" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.map((row, idx) => (
                <tr
                  key={`${row.pod}::${row.trend}::${idx}`}
                  className={`border-b border-border/60 transition-colors hover:bg-muted/60 ${
                    row.firstOfPod ? "border-t border-border" : ""
                  }`}
                >
                  {COLUMNS.map((c) => (
                    <td
                      key={c.id}
                      className={`whitespace-nowrap px-3 py-2 ${
                        c.align === "left"
                          ? "text-left text-foreground"
                          : "text-right tabular-nums text-foreground"
                      } ${
                        c.pinned
                          ? "sticky left-0 z-10 bg-card font-medium text-foreground"
                          : ""
                      }`}
                    >
                      {c.display(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {COLUMNS.map((c) => (
                  <td
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 ${
                      c.align === "left" ? "text-left" : "text-right tabular-nums"
                    } ${c.pinned ? "sticky left-0 z-10 bg-muted" : ""}`}
                  >
                    {c.total ? c.total(total) : ""}
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
