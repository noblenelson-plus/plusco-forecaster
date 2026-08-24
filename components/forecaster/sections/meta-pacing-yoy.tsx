// components/forecaster/sections/meta-pacing-yoy.tsx
"use client";

/**
 * Meta — "META PACING YOY": two rows, each pairing a per-client TABLE card with a
 * separate PIE card (keyed off the authoritative synced BigQuery flags):
 *   • Meta Share of Social — table + pie over meta_share_trend
 *     (Divested / Flat / Increasing).
 *   • Meta Spend — table + pie over Flag_Meta_Spend_YOY
 *     (YOY Divestment of min. 30% / Divestment Shortfall; "No Data" excluded).
 * Source: meta_social_output (via MetaSection), already dashboard-scoped.
 *
 * UI — standardized to the app's table DNA: shared TableColumn descriptors,
 * a ChartCard with an "Export" action (these are per-client detail tables with
 * no totals row, so export runs with includeTotals=false), and the semantic-
 * token styling shared with the other Meta tables. Numbers/order are unchanged.
 */

import { useMemo } from "react";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import { Percent, DollarSign, PieChart } from "lucide-react";
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

/** These tables have no footer, so the export carries an empty totals object. */
type NoTotals = Record<string, never>;
const NO_TOTALS: NoTotals = {};

type MetaColumn = TableColumn<KpiByClientRow, NoTotals>;

/** A per-client table card next to a separate "% of Clients" pie card. */
function TableWithPie({
  title,
  icon,
  columns,
  rows,
  segments,
  exportTitle,
  sheetTitle,
}: {
  title: string;
  icon: typeof Percent;
  columns: MetaColumn[];
  rows: KpiByClientRow[];
  segments: PieSegment[];
  exportTitle: string;
  sheetTitle: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Table card */}
      <ChartCard
        title={title}
        icon={icon}
        className="lg:col-span-3"
        action={
          <ExportSheetButton
            columns={columns}
            rows={rows}
            totals={NO_TOTALS}
            title={exportTitle}
            sheetTitle={sheetTitle}
            includeTotals={false}
          />
        }
      >
        <div className="-mx-2 mt-2 max-h-[420px] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {columns.map((c) => (
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
              {rows.map((r) => (
                <tr
                  key={r.PLUSCO_CLIENT_ID}
                  className="border-b border-border/60 transition-colors hover:bg-muted/60"
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      title={c.pinned ? c.display(r) : undefined}
                      className={`px-3 py-2 ${
                        c.align === "left"
                          ? "text-left text-foreground"
                          : "text-right tabular-nums text-foreground"
                      } ${
                        c.pinned
                          ? "sticky left-0 z-10 max-w-[150px] truncate bg-card font-medium text-foreground"
                          : "whitespace-nowrap"
                      }`}
                    >
                      {c.display(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Pie card */}
      <ChartCard title="% of Clients" icon={PieChart} className="lg:col-span-2">
        <div className="mt-2">
          {total > 0 ? (
            <ForecasterPieChart
              segments={segments}
              valueFormat={(v) => `${v} clients`}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
              No clients in scope
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

const SHARE_COLUMNS: MetaColumn[] = [
  {
    id: "client",
    label: "Client",
    group: "Meta share of social",
    kind: "text",
    align: "left",
    pinned: true,
    width: 150,
    raw: (r) => str(r.CLIENT_NAME),
    display: (r) => str(r.CLIENT_NAME),
  },
  {
    id: "scenario",
    label: "Scenario",
    group: "Meta share of social",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "scenario_meta_mapping"),
    display: (r) => opt(r, "scenario_meta_mapping"),
  },
  {
    id: "meta_share_trend",
    label: "Meta Share Trend",
    group: "Meta share of social",
    kind: "text",
    align: "left",
    raw: (r) => str(r.meta_share_trend),
    display: (r) => str(r.meta_share_trend),
  },
  {
    id: "meta_share_2026",
    label: "Meta Share 2026",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026)),
    display: (r) => pct(safeDiv(num(r.meta_spend_2026), num(r.social_spend_2026))),
  },
  {
    id: "meta_share_2025",
    label: "Meta Share 2025",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025)),
    display: (r) => pct(safeDiv(num(r.meta_spend_2025), num(r.social_spend_2025))),
  },
  {
    id: "meta_share_variance",
    label: "Meta Share Variance",
    group: "Meta share of social",
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
  },
  {
    id: "target_meta_share",
    label: "Target Meta Share",
    group: "Meta share of social",
    kind: "percent",
    align: "right",
    raw: (r) => safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1)),
    display: (r) =>
      pct(safeDiv(num(r.target_meta_spend_2026), num(r.social_forecast_rfq1))),
  },
];

const SPEND_COLUMNS: MetaColumn[] = [
  {
    id: "client",
    label: "Client",
    group: "Meta spend",
    kind: "text",
    align: "left",
    pinned: true,
    width: 150,
    raw: (r) => str(r.CLIENT_NAME),
    display: (r) => str(r.CLIENT_NAME),
  },
  {
    id: "flag_meta_spend_yoy",
    label: "Flag Meta Spend YoY",
    group: "Meta spend",
    kind: "text",
    align: "left",
    raw: (r) => opt(r, "Flag_Meta_Spend_YOY"),
    display: (r) => opt(r, "Flag_Meta_Spend_YOY"),
  },
  {
    id: "meta_2026",
    label: "Meta 2026",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026),
    display: (r) => money(num(r.meta_spend_2026)),
  },
  {
    id: "meta_2025",
    label: "Meta 2025",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2025),
    display: (r) => money(num(r.meta_spend_2025)),
  },
  {
    id: "meta_var_yoy_usd",
    label: "Meta Spend Var YoY $",
    group: "Meta spend",
    kind: "money",
    align: "right",
    raw: (r) => num(r.meta_spend_2026) - num(r.meta_spend_2025),
    display: (r) => moneySigned(num(r.meta_spend_2026) - num(r.meta_spend_2025)),
  },
  {
    id: "meta_var_yoy_pct",
    label: "Meta Spend Var YoY %",
    group: "Meta spend",
    kind: "percent",
    align: "right",
    raw: (r) =>
      safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025)),
    display: (r) =>
      pctSigned(
        safeDiv(num(r.meta_spend_2026) - num(r.meta_spend_2025), num(r.meta_spend_2025))
      ),
  },
];

export default function MetaPacingYoy({ rows }: { rows: KpiByClientRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.CLIENT_NAME ?? "").localeCompare(b.CLIENT_NAME ?? "")
      ),
    [rows]
  );

  const { shareSegments, spendSegments } = useMemo(() => {
    let divested = 0,
      flat = 0,
      increasing = 0,
      yoyDivest = 0,
      shortfall = 0;

    for (const r of rows) {
      const trend = String(r.meta_share_trend ?? "").toLowerCase();
      if (trend.includes("divest")) divested += 1;
      else if (trend.includes("flat")) flat += 1;
      else if (trend.includes("increas")) increasing += 1;

      const flag = String(
        (r as Record<string, unknown>).Flag_Meta_Spend_YOY ?? ""
      ).toLowerCase();
      if (flag.includes("yoy divestment")) yoyDivest += 1;
      else if (flag.includes("shortfall")) shortfall += 1;
      // "No Data" is intentionally excluded from the pie.
    }

    const shareSegments: PieSegment[] = [
      { label: "Divested", value: divested, color: "#6366f1" },
      { label: "Flat", value: flat, color: "#f59e0b" },
      { label: "Increasing", value: increasing, color: "#a855f7" },
    ];
    const spendSegments: PieSegment[] = [
      { label: "YOY Divestment", value: yoyDivest, color: "#14b8a6" },
      { label: "Shortfall", value: shortfall, color: "#f59e0b" },
    ];
    return { shareSegments, spendSegments };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta pacing YoY" className="space-y-6">
      <TableWithPie
        title="Meta Share of Social"
        icon={Percent}
        columns={SHARE_COLUMNS}
        rows={sorted}
        segments={shareSegments}
        exportTitle="Meta — Meta Share of Social"
        sheetTitle="Meta share of social"
      />
      <TableWithPie
        title="Meta Spend"
        icon={DollarSign}
        columns={SPEND_COLUMNS}
        rows={sorted}
        segments={spendSegments}
        exportTitle="Meta — Meta Spend"
        sheetTitle="Meta spend"
      />
    </div>
  );
}
