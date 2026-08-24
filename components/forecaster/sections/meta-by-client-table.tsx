// components/forecaster/sections/meta-by-client-table.tsx
"use client";

/**
 * Meta — the "BY CLIENT" download table. One row per (dashboard-scoped) client
 * with the full Looker column set: 8 dimensions + 19 metrics, including the three
 * synced BigQuery flags (Flag_Meta_Spend_YOY / _vs_Target / Share_vs_Target).
 * Sorted by client name, with a weighted grand-total row (shares/variances
 * recomputed from summed dollars). Source: meta_social_output (via MetaSection).
 *
 * UI — standardized to the app's table DNA: the columns are the shared
 * TableColumn descriptors (one source of truth for header, body and total,
 * plus the raw values the Sheets export needs), the surface is a ChartCard with
 * an "Export" action in its header, and the table uses the semantic-token
 * styling (bg-muted header/footer, border-border, bg-card sticky column) shared
 * with the Client-detail table. Numbers and column order are unchanged.
 */

import { useMemo } from "react";
import { Building2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";
import {
  num,
  str,
  money,
  moneySigned,
  pct,
  pctSigned,
  ppt,
  safeDiv,
  opt,
  shareVar,
} from "./meta-format";

/** Pre-aggregated grand totals for the footer (weighted, not row-summed). */
interface Totals {
  meta2025: number;
  social2025: number;
  meta2026: number;
  social2026: number;
  socialForecast: number;
  targetMeta: number;
  miqForecast: number;
  other2025: number;
  other2026: number;
}

const COLUMNS: TableColumn<KpiByClientRow, Totals>[] = [
  // ─── Dimensions ───────────────────────────────────────────────────────────
  {
    id: "client",
    label: "Client",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    pinned: true,
    width: 200,
    raw: (r) => str(r.CLIENT_NAME),
    display: (r) => str(r.CLIENT_NAME),
    total: () => "Grand total",
  },
  {
    id: "agency",
    label: "Agency",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => str(r.AGENCY),
    display: (r) => str(r.AGENCY),
  },
  {
    id: "gm_pod",
    label: "GM Pod",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => str(r.GM_POD),
    display: (r) => str(r.GM_POD),
  },
  {
    id: "bu_region",
    label: "BU Region",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => str(r.BU_REGION),
    display: (r) => str(r.BU_REGION),
  },
  {
    id: "business_lead",
    label: "Business Lead",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => str(r.BUSINESS_LEAD),
    display: (r) => str(r.BUSINESS_LEAD),
  },
  {
    id: "client_status",
    label: "Client Status",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "CLIENT_STATUS_IN_2026"),
    display: (r) => opt(r, "CLIENT_STATUS_IN_2026"),
  },
  {
    id: "scenario",
    label: "Scenario",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "scenario_meta_mapping"),
    display: (r) => opt(r, "scenario_meta_mapping"),
  },
  {
    id: "meta_share_trend",
    label: "Meta Share Trend",
    group: "Client dimensions",
    kind: "text",
    align: "left",
    raw: (r) => str(r.meta_share_trend),
    display: (r) => str(r.meta_share_trend),
  },

  // ─── Metrics ──────────────────────────────────────────────────────────────
  {
    id: "meta_2025",
    label: "Meta 2025",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2025),
    display: (r) => money(num(r.meta_spend_2025)),
    total: (t) => money(t.meta2025),
    totalRaw: (t) => t.meta2025,
  },
  {
    id: "social_2025",
    label: "Social 2025",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.social_spend_2025),
    display: (r) => money(num(r.social_spend_2025)),
    total: (t) => money(t.social2025),
    totalRaw: (t) => t.social2025,
  },
  {
    id: "meta_share_2025",
    label: "Meta Share 2025",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025)),
    display: (r) => pct(safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025))),
    total: (t) => pct(safeDiv(t.meta2025, t.social2025)),
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026),
    display: (r) => money(num(r.meta_spend_2026)),
    total: (t) => money(t.meta2026),
    totalRaw: (t) => t.meta2026,
  },
  {
    id: "social_2026",
    label: "Social 2026",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.social_spend_2026),
    display: (r) => money(num(r.social_spend_2026)),
    total: (t) => money(t.social2026),
    totalRaw: (t) => t.social2026,
  },
  {
    id: "meta_share_2026",
    label: "Meta Share 2026",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026)),
    display: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026))),
    total: (t) => pct(safeDiv(t.meta2026, t.social2026)),
  },
  {
    id: "meta_var_yoy_usd",
    label: "Meta Spend Var YoY $",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026) - num(r.meta_spend_2025),
    display: (r) => moneySigned(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
    total: (t) => moneySigned(t.meta2026 - t.meta2025),
    totalRaw: (t) => t.meta2026 - t.meta2025,
  },
  {
    id: "meta_var_yoy_pct",
    label: "Meta Spend Var YoY %",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025)),
    display: (r) => pctSigned(safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025))),
    total: (t) => pctSigned(safeDiv(t.meta2026 - t.meta2025, t.meta2025)),
  },
  {
    id: "social_forecast_rfq",
    label: "Social Forecast (RFQ)",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.social_forecast_rfq1),
    display: (r) => money(num(r.social_forecast_rfq1)),
    total: (t) => money(t.socialForecast),
    totalRaw: (t) => t.socialForecast,
  },
  {
    id: "target_meta_spend",
    label: "Target Meta Spend (-30%)",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.target_meta_spend_2026),
    display: (r) => money(num(r.target_meta_spend_2026)),
    total: (t) => money(t.targetMeta),
    totalRaw: (t) => t.targetMeta,
  },
  {
    id: "spend_pacing",
    label: "Spend Pacing",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026), num(r.target_meta_spend_2026)),
    display: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.target_meta_spend_2026))),
    total: (t) => pct(safeDiv(t.meta2026, t.targetMeta)),
  },
  {
    id: "meta_share_var_vs_2025",
    label: "Meta Share Var vs 2025",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) =>
      shareVar(
        num(r.meta_spend_2026),
        num(r.social_spend_2026),
        num(r.meta_spend_2025),
        num(r.social_spend_2025)
      ),
    display: (r) =>
      ppt(
        shareVar(
          num(r.meta_spend_2026),
          num(r.social_spend_2026),
          num(r.meta_spend_2025),
          num(r.social_spend_2025)
        )
      ),
    total: (t) => ppt(shareVar(t.meta2026, t.social2026, t.meta2025, t.social2025)),
  },
  {
    id: "miq_social_forecast",
    label: "MIQ-Social Forecast",
    group: "Meta metrics",
    kind: "money",
    align: "right",
    raw: (r) => num(r.miq_social_forecast_2026),
    display: (r) => money(num(r.miq_social_forecast_2026)),
    total: (t) => money(t.miqForecast),
    totalRaw: (t) => t.miqForecast,
  },
  {
    id: "target_meta_share_2026",
    label: "Target Meta Share 2026",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1)),
    display: (r) => pct(safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1))),
    total: (t) => pct(safeDiv(t.targetMeta, t.socialForecast)),
  },
  {
    id: "flag_meta_spend_yoy",
    label: "Flag Meta Spend YoY",
    group: "Meta flags",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "Flag_Meta_Spend_YOY"),
    display: (r) => opt(r, "Flag_Meta_Spend_YOY"),
  },
  {
    id: "flag_meta_spend_vs_target",
    label: "Flag Meta Spend vs Target",
    group: "Meta flags",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "Flag_Meta_Spend_vs_Target"),
    display: (r) => opt(r, "Flag_Meta_Spend_vs_Target"),
  },
  {
    id: "flag_meta_share_vs_target",
    label: "Flag Meta Share vs Target",
    group: "Meta flags",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "Flag_Meta_Share_vs_Target"),
    display: (r) => opt(r, "Flag_Meta_Share_vs_Target"),
  },
  {
    id: "other_platforms_share_2026",
    label: "Other Platforms Share 2026",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.other_platforms_spend_2026), num(r.social_spend_2026)),
    display: (r) => pct(safeDiv(num(r.other_platforms_spend_2026), num(r.social_spend_2026))),
    total: (t) => pct(safeDiv(t.other2026, t.social2026)),
  },
  {
    id: "other_share_var_vs_2025",
    label: "Other Platform Share Var vs 2025",
    group: "Meta metrics",
    kind: "percent",
    align: "right",
    raw: (r) =>
      shareVar(
        num(r.other_platforms_spend_2026),
        num(r.social_spend_2026),
        num(r.other_platforms_spend_2025),
        num(r.social_spend_2025)
      ),
    display: (r) =>
      ppt(
        shareVar(
          num(r.other_platforms_spend_2026),
          num(r.social_spend_2026),
          num(r.other_platforms_spend_2025),
          num(r.social_spend_2025)
        )
      ),
    total: (t) =>
      ppt(shareVar(t.other2026, t.social2026, t.other2025, t.social2025)),
  },
];

export default function MetaByClientTable({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const total = useMemo<Totals>(() => {
    const t: Totals = {
      meta2025: 0,
      social2025: 0,
      meta2026: 0,
      social2026: 0,
      socialForecast: 0,
      targetMeta: 0,
      miqForecast: 0,
      other2025: 0,
      other2026: 0,
    };
    for (const r of rows) {
      t.meta2025 += num(r.meta_spend_2025);
      t.social2025 += num(r.social_spend_2025);
      t.meta2026 += num(r.meta_spend_2026);
      t.social2026 += num(r.social_spend_2026);
      t.socialForecast += num(r.social_forecast_rfq1);
      t.targetMeta += num(r.target_meta_spend_2026);
      t.miqForecast += num(r.miq_social_forecast_2026);
      t.other2025 += num(r.other_platforms_spend_2025);
      t.other2026 += num(r.other_platforms_spend_2026);
    }
    return t;
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta by client">
      <ChartCard
        title="By Client"
        icon={Building2}
        action={
          <ExportSheetButton
            columns={COLUMNS}
            rows={sorted}
            totals={total}
            title="Meta — By Client"
            sheetTitle="Meta by client"
            includeTotals
          />
        }
      >
        <div className="-mx-2 mt-2 max-h-[560px] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                      c.align === "left" ? "text-left" : "text-right"
                    } ${c.pinned ? "sticky left-0 z-30 bg-muted" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.PLUSCO_CLIENT_ID}
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
                      {c.display(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {COLUMNS.map((c) => (
                  <td
                    key={c.id}
                    className={`whitespace-nowrap px-3 py-2.5 ${
                      c.align === "left" ? "text-left" : "text-right tabular-nums"
                    } ${c.pinned ? "sticky left-0 z-30 bg-muted" : ""}`}
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
