// components/forecaster/sections/meta-gm-pod-table.tsx
"use client";

/**
 * Meta — Phase 2: the "BY GM POD" table. Groups the (already dashboard-scoped)
 * mo_kpi_by_client rows by GM Pod and shows the full Meta divestment column set,
 * with a weighted grand-total row. Shares, variances and pacing are recomputed
 * from each group's summed dollars (never averaged), so the total row is exact.
 *
 * UI — standardized to the app's table DNA: the columns are shared TableColumn
 * descriptors (one source of truth for header, body and total, plus the raw
 * values the Sheets export needs), the surface is a ChartCard with an "Export"
 * action, and the table uses the semantic-token styling shared with the other
 * Meta tables. Because a group row and the grand total are both a PodTotals, a
 * column's display and total share one expression. Numbers/order are unchanged.
 */

import { useMemo } from "react";
import { Users } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import {
  num,
  money,
  moneySigned,
  pct,
  pctSigned,
  ppt,
  safeDiv,
  shareVar,
} from "./meta-format";

/** One GM-Pod group's summed dollars / counts. The grand total is the same shape. */
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

const COLUMNS: TableColumn<PodTotals, PodTotals>[] = [
  {
    id: "gm_pod",
    label: "GM Pod",
    group: "By GM Pod",
    kind: "text",
    align: "left",
    pinned: true,
    width: 200,
    raw: (t) => t.pod,
    display: (t) => t.pod,
    total: (t) => t.pod,
  },
  {
    id: "meta_2025",
    label: "Meta 2025",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.meta2025,
    display: (t) => money(t.meta2025),
    total: (t) => money(t.meta2025),
    totalRaw: (t) => t.meta2025,
  },
  {
    id: "social_2025",
    label: "Social 2025",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.social2025,
    display: (t) => money(t.social2025),
    total: (t) => money(t.social2025),
    totalRaw: (t) => t.social2025,
  },
  {
    id: "meta_share_2025",
    label: "Meta Share 2025",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2025, t.social2025),
    display: (t) => pct(safeDiv(t.meta2025, t.social2025)),
    total: (t) => pct(safeDiv(t.meta2025, t.social2025)),
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.meta2026,
    display: (t) => money(t.meta2026),
    total: (t) => money(t.meta2026),
    totalRaw: (t) => t.meta2026,
  },
  {
    id: "social_2026",
    label: "Social 2026",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.social2026,
    display: (t) => money(t.social2026),
    total: (t) => money(t.social2026),
    totalRaw: (t) => t.social2026,
  },
  {
    id: "meta_share_2026",
    label: "Meta Share 2026",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2026, t.social2026),
    display: (t) => pct(safeDiv(t.meta2026, t.social2026)),
    total: (t) => pct(safeDiv(t.meta2026, t.social2026)),
  },
  {
    id: "meta_var_yoy_usd",
    label: "Meta Spend Var YoY $",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.meta2026 - t.meta2025,
    display: (t) => moneySigned(t.meta2026 - t.meta2025),
    total: (t) => moneySigned(t.meta2026 - t.meta2025),
    totalRaw: (t) => t.meta2026 - t.meta2025,
  },
  {
    id: "meta_var_yoy_pct",
    label: "Meta Spend Var YoY %",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2026 - t.meta2025, t.meta2025),
    display: (t) => pctSigned(safeDiv(t.meta2026 - t.meta2025, t.meta2025)),
    total: (t) => pctSigned(safeDiv(t.meta2026 - t.meta2025, t.meta2025)),
  },
  {
    id: "social_forecast_rfq",
    label: "Social Forecast (RFQ)",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.socialForecast,
    display: (t) => money(t.socialForecast),
    total: (t) => money(t.socialForecast),
    totalRaw: (t) => t.socialForecast,
  },
  {
    id: "target_meta_spend",
    label: "Target Meta Spend (-30%)",
    group: "By GM Pod",
    kind: "money",
    align: "right",
    raw: (t) => t.targetMeta,
    display: (t) => money(t.targetMeta),
    total: (t) => money(t.targetMeta),
    totalRaw: (t) => t.targetMeta,
  },
  {
    id: "spend_pacing",
    label: "Spend Pacing",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.meta2026, t.targetMeta),
    display: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
    total: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
  },
  {
    id: "meta_share_var_vs_2025",
    label: "Meta Share Var vs 2025",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => shareVar(t.meta2026, t.social2026, t.meta2025, t.social2025),
    display: (t) =>
      ppt(shareVar(t.meta2026, t.social2026, t.meta2025, t.social2025)),
    total: (t) =>
      ppt(shareVar(t.meta2026, t.social2026, t.meta2025, t.social2025)),
  },
  {
    id: "miq_social_forecast",
    label: "MIQ-Social Forecast",
    group: "By GM Pod",
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
    group: "By GM Pod",
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
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.miqMir, t.miqForecast),
    display: (t) => pct(safeDiv(t.miqMir, t.miqForecast)),
    total: (t) => pct(safeDiv(t.miqMir, t.miqForecast)),
  },
  {
    id: "target_meta_share_2026",
    label: "Target Meta Share 2026",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.targetMeta, t.socialForecast),
    display: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
    total: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
  },
  {
    id: "other_platforms_share_2026",
    label: "Other Platforms Share 2026",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.other2026, t.social2026),
    display: (t) => pct(safeDiv(t.other2026, t.social2026)),
    total: (t) => pct(safeDiv(t.other2026, t.social2026)),
  },
  {
    id: "other_share_var_vs_2025",
    label: "Other Platform Share Var vs 2025",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => shareVar(t.other2026, t.social2026, t.other2025, t.social2025),
    display: (t) =>
      ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)),
    total: (t) =>
      ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)),
  },
  {
    id: "pct_clients_divested",
    label: "% Clients Divested",
    group: "By GM Pod",
    kind: "percent",
    align: "right",
    raw: (t) => safeDiv(t.divested, t.withTrend),
    display: (t) => pct(safeDiv(t.divested, t.withTrend)),
    total: (t) => pct(safeDiv(t.divested, t.withTrend)),
  },
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

  return (
    <div data-scroll-section data-scroll-label="Meta by GM Pod">
      <ChartCard
        title="By GM Pod"
        icon={Users}
        action={
          <ExportSheetButton
            columns={COLUMNS}
            rows={pods}
            totals={total}
            title="Meta — By GM Pod"
            sheetTitle="Meta by GM Pod"
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
              {pods.map((t) => (
                <tr
                  key={t.pod}
                  className="border-b border-border/60 transition-colors hover:bg-muted/60"
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
                      {c.display(t)}
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
