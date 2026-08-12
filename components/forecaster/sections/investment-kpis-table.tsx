// filepath: components/forecaster/sections/investment-kpis-table.tsx
"use client";

/**
 * CLIENT DOWNLOAD TABLE (MediaOcean → Investment KPIs) — presentational.
 * Receives already-filtered rows from the section (single shared filter bar),
 * shows every metric from the Looker CSV (sortable), caps its height with ONE
 * scroll container (sticky header + sticky Client column + a pinned Grand-total
 * row). The total row sums the DOLLAR columns and computes the CORRECT portfolio
 * rate for each percentage column (Σnumerator ÷ Σdenominator) — never an average
 * of per-client percentages — so the footer cross-checks 1:1 with Looker's total
 * and with the scorecards above. "Download CSV" exports every synced column.
 *
 * A plain <table> is used on purpose: the shadcn <Table> wraps itself in an
 * overflow-x container, which nested inside our height-capped box would create
 * two scroll containers and break the sticky header/footer/first-column.
 */

import { useMemo, useState } from "react";
import { Table2, Download, ArrowUp, ArrowDown } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "../../ui/card";
import { Button } from "../../ui/button";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

// ─── Numeric helpers ──────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumField(rows: KpiByClientRow[], key: string): number {
  return rows.reduce((acc, r) => acc + num(r[key]), 0);
}

function safeDivN(a: number, b: number): number | null {
  return b ? a / b : null;
}

/** Portfolio ratio = Σnumerator ÷ Σdenominator (null when the denominator is 0). */
function ratio(rows: KpiByClientRow[], numKey: string, denKey: string): number | null {
  return safeDivN(sumField(rows, numKey), sumField(rows, denKey));
}

/** Portfolio 2026 share minus 2025 share (both computed from summed dollars). */
function shareDelta(
  rows: KpiByClientRow[],
  n26: string,
  d26: string,
  n25: string,
  d25: string
): number | null {
  const s26 = ratio(rows, n26, d26);
  const s25 = ratio(rows, n25, d25);
  return s26 === null || s25 === null ? null : s26 - s25;
}

// Meta spend variance % = (2026 − 2025) / 2025 ; null when 2025 is zero.
function metaSpendVariancePct(r: KpiByClientRow): number | null {
  const m25 = num(r["meta_spend_2025"]);
  const m26 = num(r["meta_spend_2026"]);
  return m25 === 0 ? null : (m26 - m25) / m25;
}

// ─── Column model ─────────────────────────────────────────────────────────────

type CellType = "text" | "money" | "pct" | "delta";

interface Col {
  key: string; // unique key; also the Firestore field unless `field`/`compute` given
  header: string;
  type: CellType;
  field?: string; // Firestore field name (defaults to key)
  compute?: (r: KpiByClientRow) => number | null; // per-row derived value
  footer?: (rows: KpiByClientRow[]) => number | null; // portfolio value for the total row
}

const COLUMNS: Col[] = [
  // Dimensions / status
  { key: "CLIENT_NAME", header: "Client", type: "text" },
  { key: "AGENCY", header: "Agency", type: "text" },
  { key: "BU_REGION", header: "BU Region", type: "text" },
  { key: "BUSINESS_LEAD", header: "Business Lead", type: "text" },
  { key: "GM_POD", header: "GM Pod", type: "text" },
  { key: "scenario_meta_mapping", header: "Scenario", type: "text" },
  { key: "meta_share_trend", header: "Meta Share Trend", type: "text" },
  { key: "eligible_billups_ooh", header: "Elig. Billups OOH", type: "text" },
  { key: "eligible_billups_print", header: "Elig. Billups Print", type: "text" },
  // Meta
  { key: "meta_spend_2025", header: "Meta Spend 2025", type: "money" },
  { key: "social_spend_2025", header: "Social Spend 2025", type: "money" },
  {
    key: "meta_share_of_social_2025",
    header: "Meta Share 2025",
    type: "pct",
    footer: (rs) => ratio(rs, "meta_spend_2025", "social_spend_2025"),
  },
  { key: "meta_spend_2026", header: "Meta Spend 2026", type: "money" },
  { key: "social_spend_2026", header: "Social Spend 2026", type: "money" },
  {
    key: "meta_share_of_social_2026",
    header: "Meta Share 2026",
    type: "pct",
    footer: (rs) => ratio(rs, "meta_spend_2026", "social_spend_2026"),
  },
  {
    key: "meta_spend_variance_dollar",
    header: "Meta Spend Var $",
    type: "money",
    compute: (r) => num(r["meta_spend_2026"]) - num(r["meta_spend_2025"]),
  },
  {
    key: "meta_spend_variance_pct",
    header: "Meta Spend Var %",
    type: "delta",
    compute: metaSpendVariancePct,
    footer: (rs) =>
      safeDivN(
        sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025"),
        sumField(rs, "meta_spend_2025")
      ),
  },
  { key: "social_forecast_rfq1", header: "Social Forecast", type: "money" },
  { key: "target_meta_spend_2026", header: "Target Meta Spend (−30%)", type: "money" },
  {
    key: "spend_pacing",
    header: "% Pacing vs Target",
    type: "pct",
    footer: (rs) => ratio(rs, "meta_spend_2026", "target_meta_spend_2026"),
  },
  {
    key: "meta_share_variance_yoy",
    header: "Meta Share Var YOY",
    type: "delta",
    footer: (rs) =>
      shareDelta(rs, "meta_spend_2026", "social_spend_2026", "meta_spend_2025", "social_spend_2025"),
  },
  { key: "miq_social_forecast_2026", header: "MIQ-Social Forecast", type: "money" },
  { key: "miq_social_spend_2026", header: "MIQ-Social Spend", type: "money" },
  {
    key: "miq_social_pacing",
    header: "MIQ-Social Pacing",
    type: "pct",
    footer: (rs) => ratio(rs, "miq_social_spend_2026", "miq_social_forecast_2026"),
  },
  {
    key: "target_meta_share_2026",
    header: "Target Meta Share",
    type: "pct",
    footer: (rs) => ratio(rs, "target_meta_spend_2026", "social_forecast_rfq1"),
  },
  {
    key: "other_platforms_share_social_2026",
    header: "Other Platforms Share",
    type: "pct",
    footer: (rs) => ratio(rs, "other_platforms_spend_2026", "social_spend_2026"),
  },
  {
    key: "other_platforms_share_variance",
    header: "Other Platforms Var (ppt)",
    type: "delta",
    footer: (rs) =>
      shareDelta(
        rs,
        "other_platforms_spend_2026",
        "social_spend_2026",
        "other_platforms_spend_2025",
        "social_spend_2025"
      ),
  },
  // Digital Direct
  { key: "digital_direct_spend_2026", header: "Digital Direct Spend", type: "money" },
  {
    key: "dd_share_of_digital_2026",
    header: "DD Share of Digital",
    type: "pct",
    footer: (rs) => ratio(rs, "digital_direct_spend_2026", "digital_spend_2026"),
  },
  {
    key: "dd_share_variance_vs_2025_ppt",
    header: "DD Var vs 2025 (ppt)",
    type: "delta",
    footer: (rs) =>
      shareDelta(
        rs,
        "digital_direct_spend_2026",
        "digital_spend_2026",
        "digital_direct_spend_2025",
        "digital_spend_2025"
      ),
  },
  {
    key: "dd_pct_deal_partners",
    header: "DD % Deal",
    type: "pct",
    footer: (rs) => ratio(rs, "dd_deal_spend_2026", "digital_direct_spend_2026"),
  },
  {
    key: "dd_pct_nondeal_partners",
    header: "DD % Non-Deal",
    type: "pct",
    footer: (rs) => ratio(rs, "dd_nondeal_spend_2026", "digital_direct_spend_2026"),
  },
  // Programmatic
  { key: "prog_spend_2026", header: "Prog Spend", type: "money" },
  {
    key: "prog_share_of_digital_2026",
    header: "Prog Share of Digital",
    type: "pct",
    footer: (rs) => ratio(rs, "prog_spend_2026", "digital_spend_2026"),
  },
  {
    key: "prog_share_variance_vs_2025_ppt",
    header: "Prog Var vs 2025 (ppt)",
    type: "delta",
    footer: (rs) =>
      shareDelta(rs, "prog_spend_2026", "digital_spend_2026", "prog_spend_2025", "digital_spend_2025"),
  },
  {
    key: "prog_pct_deal_partners",
    header: "Prog % Deal",
    type: "pct",
    footer: (rs) => ratio(rs, "prog_deal_spend_2026", "prog_spend_2026"),
  },
  {
    key: "prog_pct_nondeal_partners",
    header: "Prog % Non-Deal",
    type: "pct",
    footer: (rs) => ratio(rs, "prog_nondeal_spend_2026", "prog_spend_2026"),
  },
  // Labs
  { key: "labs_spend_2026", header: "Labs Spend", type: "money" },
  {
    key: "labs_share_total_media_2026",
    header: "Labs Share Total Media",
    type: "pct",
    footer: (rs) => ratio(rs, "labs_spend_2026", "total_spend_2026"),
  },
  {
    key: "prog_labs_share_of_prog_2026",
    header: "Prog Labs Share of Prog",
    type: "pct",
    footer: (rs) => ratio(rs, "prog_labs_spend_2026", "prog_spend_2026"),
  },
  {
    key: "billups_ooh_share_of_ooh_2026",
    header: "Billups Share of OOH",
    type: "pct",
    footer: (rs) => ratio(rs, "billups_ooh_spend_2026", "ooh_spend_2026"),
  },
  {
    key: "billups_print_share_of_print_2026",
    header: "Billups Share of Print",
    type: "pct",
    footer: (rs) => ratio(rs, "billups_print_spend_2026", "print_spend_2026"),
  },
];

// ─── Value + format helpers ────────────────────────────────────────────────────

function rawValue(r: KpiByClientRow, col: Col): unknown {
  return col.compute ? col.compute(r) : r[col.field ?? col.key];
}

function textOf(v: unknown): string {
  const s = (v ?? "").toString().trim();
  return s === "" ? "—" : s;
}

function moneyOf(v: unknown): string {
  return `$${Math.round(num(v)).toLocaleString("en-CA")}`;
}

function pctOf(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : "—";
}

function deltaOf(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const p = n * 100;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
}

function display(r: KpiByClientRow, col: Col): string {
  const raw = rawValue(r, col);
  if (col.type === "money") return moneyOf(raw);
  if (col.type === "pct") return pctOf(raw);
  if (col.type === "delta") return deltaOf(raw);
  return textOf(raw);
}

function footerText(col: Col, rows: KpiByClientRow[], moneyTotal: number): string {
  if (col.type === "money") return moneyOf(moneyTotal);
  if (col.type === "pct") return col.footer ? pctOf(col.footer(rows)) : "—";
  if (col.type === "delta") return col.footer ? deltaOf(col.footer(rows)) : "—";
  return "";
}

function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvestmentKpisTable({ rows }: { rows: KpiByClientRow[] }) {
  const [sortKey, setSortKey] = useState<string>("total_spend_2026");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (col && col.type === "text") {
        return dir * textOf(rawValue(a, col)).localeCompare(textOf(rawValue(b, col)));
      }
      const av = col ? num(rawValue(a, col)) : num(a[sortKey]);
      const bv = col ? num(rawValue(b, col)) : num(b[sortKey]);
      return dir * (av - bv);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const moneyTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of COLUMNS) {
      if (col.type !== "money") continue;
      map[col.key] = rows.reduce((acc, r) => acc + num(rawValue(r, col)), 0);
    }
    return map;
  }, [rows]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  function downloadCsv() {
    const keySet = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
    const keys = [...keySet];
    const header = keys.join(",");
    const body = rows.map((r) => keys.map((k) => csvField(r[k])).join(","));
    const csv = [header, ...body].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "investment-kpis-by-client.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const cellPad = "px-3 py-2 whitespace-nowrap border-b border-border";
  const headBase =
    "px-3 py-2 whitespace-nowrap border-b border-border bg-muted text-xs font-medium text-muted-foreground";
  const footBase =
    "px-3 py-2 whitespace-nowrap border-t border-border bg-muted font-semibold";

  return (
    <div data-scroll-section data-scroll-label="Client table">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Table2 size={16} className="flex-shrink-0 text-primary" />
            <div>
              <CardTitle>Client Download Table</CardTitle>
              <CardDescription className="mt-0.5">
                Per-client KPIs · {rows.length} client{rows.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
          </div>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              disabled={rows.length === 0}
            >
              <Download />
              Download CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">
              No clients match the current filters.
            </p>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full caption-bottom border-collapse text-sm">
                <thead>
                  <tr>
                    {COLUMNS.map((col, idx) => {
                      const numeric = col.type !== "text";
                      const active = sortKey === col.key;
                      const sticky =
                        idx === 0
                          ? "sticky left-0 top-0 z-30 min-w-[180px]"
                          : "sticky top-0 z-20";
                      return (
                        <th
                          key={col.key}
                          className={`${headBase} ${sticky} ${
                            numeric ? "text-right" : "text-left"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={`inline-flex items-center gap-1 hover:text-foreground ${
                              numeric ? "flex-row-reverse" : ""
                            } ${active ? "text-foreground" : ""}`}
                          >
                            {col.header}
                            {active &&
                              (sortDir === "asc" ? (
                                <ArrowUp size={12} />
                              ) : (
                                <ArrowDown size={12} />
                              ))}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={(row.PLUSCO_CLIENT_ID ?? i).toString()}>
                      {COLUMNS.map((col, idx) => {
                        const numeric = col.type !== "text";
                        const sticky =
                          idx === 0
                            ? "sticky left-0 z-10 bg-card min-w-[180px]"
                            : "";
                        return (
                          <td
                            key={col.key}
                            className={`${cellPad} ${sticky} ${
                              numeric ? "text-right tabular-nums" : "text-left"
                            }`}
                          >
                            {display(row, col)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {COLUMNS.map((col, idx) => {
                      if (idx === 0) {
                        return (
                          <td
                            key={col.key}
                            className={`${footBase} sticky left-0 bottom-0 z-30 min-w-[180px] text-left`}
                          >
                            Grand total
                          </td>
                        );
                      }
                      const numeric = col.type !== "text";
                      return (
                        <td
                          key={col.key}
                          className={`${footBase} sticky bottom-0 z-20 ${
                            numeric ? "text-right tabular-nums" : "text-left"
                          }`}
                        >
                          {footerText(col, rows, moneyTotals[col.key] ?? 0)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
