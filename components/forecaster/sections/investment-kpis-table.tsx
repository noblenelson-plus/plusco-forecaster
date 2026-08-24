// filepath: components/forecaster/sections/investment-kpis-table.tsx
"use client";

/**
 * CLIENT DOWNLOAD TABLE (MediaOcean -> Investment KPIs) — presentational.
 * Receives already-filtered rows from the section (single shared filter bar),
 * shows every metric from the Looker CSV (sortable), caps its height with ONE
 * scroll container (sticky header + sticky Client column + a pinned Grand-total
 * row). The total row sums the DOLLAR columns and computes the CORRECT portfolio
 * rate for each percentage column (sum numerator / sum denominator) — never an
 * average of per-client percentages — so the footer cross-checks 1:1 with
 * Looker's total and with the scorecards above. Exports every synced column.
 *
 * Columns are organized into groups (Meta / Digital Direct / Programmatic /
 * Labs / Billups); a chip row lets the user show or hide each group so a wide
 * table can be focused on one area at a time. The dimension columns (Client,
 * Agency, BU Region, Business Lead, GM Pod) are always shown. Target metrics
 * are RAG-colored (red/amber/green) against their goals, matching the
 * Executive Summary. Exports always include every column, regardless of view.
 *
 * Rows are clickable when `onRowClick` is supplied: clicking toggles the page's
 * focused client (highlighted here via `focusedId`); the table itself always
 * shows the full filtered list.
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
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import { ragStatus, ragCell, type RagStatus, type RagBands } from "./exec-rag";

// --- Numeric helpers ----------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Row value as a number, or null when blank / non-numeric. */
function fieldN(r: KpiByClientRow, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Shared Billups eligibility rule: eligible unless explicitly not. */
function parseEligible(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "n/a" || s === "no" || s === "not eligible");
}

function sumField(rows: KpiByClientRow[], key: string): number {
  return rows.reduce((acc, r) => acc + num(r[key]), 0);
}

function safeDivN(a: number, b: number): number | null {
  return b ? a / b : null;
}

/** Portfolio ratio = sum(numerator) / sum(denominator) (null when denom is 0). */
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

// Meta spend variance % = (2026 - 2025) / 2025 ; null when 2025 is zero.
function metaSpendVariancePct(r: KpiByClientRow): number | null {
  const m25 = num(r["meta_spend_2025"]);
  const m26 = num(r["meta_spend_2026"]);
  return m25 === 0 ? null : (m26 - m25) / m25;
}

// --- Column model -------------------------------------------------------------

type CellType = "text" | "money" | "pct" | "delta";
type Group = "dim" | "meta" | "dd" | "prog" | "labs" | "billups";

interface Goals {
  labsShareGoal: number | null;
  billupsShareGoal: number | null;
  bands?: RagBands;
}

interface Col {
  key: string; // unique key; also the Firestore field unless `field`/`compute` given
  header: string;
  type: CellType;
  group: Group;
  field?: string; // Firestore field name (defaults to key)
  compute?: (r: KpiByClientRow) => number | null; // per-row derived value
  footer?: (rows: KpiByClientRow[]) => number | null; // portfolio value for the total row
  width?: string; // tailwind max-width class for a narrowed text column
  truncate?: boolean; // wrap value in a truncating div + full value on hover
  rag?: (r: KpiByClientRow, goals: Goals) => RagStatus; // per-row cell status
}

// Per-row targets for the RAG-colored cells.
const metaShareTargetOf = (r: KpiByClientRow): number | null =>
  safeDivN(num(r["target_meta_spend_2026"]), num(r["social_forecast_rfq1"]));

const COLUMNS: Col[] = [
  // --- Dimensions (always shown) ---
  {
    key: "CLIENT_NAME",
    header: "Client",
    type: "text",
    group: "dim",
    width: "max-w-[160px]",
    truncate: true,
  },
  { key: "AGENCY", header: "Agency", type: "text", group: "dim" },
  { key: "BU_REGION", header: "BU Region", type: "text", group: "dim" },
  {
    key: "BUSINESS_LEAD",
    header: "Business Lead",
    type: "text",
    group: "dim",
    width: "max-w-[150px]",
    truncate: true,
  },
  { key: "GM_POD", header: "GM Pod", type: "text", group: "dim" },

  // --- Meta ---
  {
    key: "scenario_meta_mapping",
    header: "Scenario",
    type: "text",
    group: "meta",
    width: "max-w-[140px]",
    truncate: true,
  },
  { key: "meta_share_trend", header: "Meta Share Trend", type: "text", group: "meta" },
  { key: "meta_spend_2025", header: "Meta Spend 2025", type: "money", group: "meta" },
  { key: "social_spend_2025", header: "Social Spend 2025", type: "money", group: "meta" },
  {
    key: "meta_share_of_social_2025",
    header: "Meta Share 2025",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "meta_spend_2025", "social_spend_2025"),
  },
  { key: "meta_spend_2026", header: "Meta Spend 2026", type: "money", group: "meta" },
  { key: "social_spend_2026", header: "Social Spend 2026", type: "money", group: "meta" },
  {
    key: "meta_share_of_social_2026",
    header: "Meta Share 2026",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "meta_spend_2026", "social_spend_2026"),
    rag: (r, g) =>
      ragStatus(fieldN(r, "meta_share_of_social_2026"), metaShareTargetOf(r), {
        lowerIsBetter: true,
        bands: g.bands,
      }),
  },
  {
    key: "meta_spend_variance_dollar",
    header: "Meta Spend Var $",
    type: "money",
    group: "meta",
    compute: (r) => num(r["meta_spend_2026"]) - num(r["meta_spend_2025"]),
  },
  {
    key: "meta_spend_variance_pct",
    header: "Meta Spend Var %",
    type: "delta",
    group: "meta",
    compute: metaSpendVariancePct,
    footer: (rs) =>
      safeDivN(
        sumField(rs, "meta_spend_2026") - sumField(rs, "meta_spend_2025"),
        sumField(rs, "meta_spend_2025")
      ),
  },
  { key: "social_forecast_rfq1", header: "Social Forecast", type: "money", group: "meta" },
  {
    key: "target_meta_spend_2026",
    header: "Target Meta Spend (−30%)",
    type: "money",
    group: "meta",
  },
  {
    key: "spend_pacing",
    header: "% Pacing vs Target",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "meta_spend_2026", "target_meta_spend_2026"),
    rag: (r, g) =>
      ragStatus(fieldN(r, "spend_pacing"), 1, { lowerIsBetter: true, bands: g.bands }),
  },
  {
    key: "meta_share_variance_yoy",
    header: "Meta Share Var YOY",
    type: "delta",
    group: "meta",
    footer: (rs) =>
      shareDelta(rs, "meta_spend_2026", "social_spend_2026", "meta_spend_2025", "social_spend_2025"),
  },
  { key: "miq_social_forecast_2026", header: "MIQ-Social Forecast", type: "money", group: "meta" },
  { key: "miq_social_spend_2026", header: "MIQ-Social Spend", type: "money", group: "meta" },
  {
    key: "miq_social_pacing",
    header: "MIQ-Social Pacing",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "miq_social_spend_2026", "miq_social_forecast_2026"),
  },
  {
    key: "target_meta_share_2026",
    header: "Target Meta Share",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "target_meta_spend_2026", "social_forecast_rfq1"),
  },
  {
    key: "other_platforms_share_social_2026",
    header: "Other Platforms Share",
    type: "pct",
    group: "meta",
    footer: (rs) => ratio(rs, "other_platforms_spend_2026", "social_spend_2026"),
  },
  {
    key: "other_platforms_share_variance",
    header: "Other Platforms Var (ppt)",
    type: "delta",
    group: "meta",
    footer: (rs) =>
      shareDelta(
        rs,
        "other_platforms_spend_2026",
        "social_spend_2026",
        "other_platforms_spend_2025",
        "social_spend_2025"
      ),
  },

  // --- Digital Direct ---
  { key: "digital_direct_spend_2026", header: "Digital Direct Spend", type: "money", group: "dd" },
  {
    key: "dd_share_of_digital_2026",
    header: "DD Share of Digital",
    type: "pct",
    group: "dd",
    footer: (rs) => ratio(rs, "digital_direct_spend_2026", "digital_spend_2026"),
  },
  {
    key: "dd_share_variance_vs_2025_ppt",
    header: "DD Var vs 2025 (ppt)",
    type: "delta",
    group: "dd",
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
    group: "dd",
    footer: (rs) => ratio(rs, "dd_deal_spend_2026", "digital_direct_spend_2026"),
  },
  {
    key: "dd_pct_nondeal_partners",
    header: "DD % Non-Deal",
    type: "pct",
    group: "dd",
    footer: (rs) => ratio(rs, "dd_nondeal_spend_2026", "digital_direct_spend_2026"),
  },

  // --- Programmatic ---
  { key: "prog_spend_2026", header: "Prog Spend", type: "money", group: "prog" },
  {
    key: "prog_share_of_digital_2026",
    header: "Prog Share of Digital",
    type: "pct",
    group: "prog",
    footer: (rs) => ratio(rs, "prog_spend_2026", "digital_spend_2026"),
  },
  {
    key: "prog_share_variance_vs_2025_ppt",
    header: "Prog Var vs 2025 (ppt)",
    type: "delta",
    group: "prog",
    footer: (rs) =>
      shareDelta(rs, "prog_spend_2026", "digital_spend_2026", "prog_spend_2025", "digital_spend_2025"),
  },
  {
    key: "prog_pct_deal_partners",
    header: "Prog % Deal",
    type: "pct",
    group: "prog",
    footer: (rs) => ratio(rs, "prog_deal_spend_2026", "prog_spend_2026"),
  },
  {
    key: "prog_pct_nondeal_partners",
    header: "Prog % Non-Deal",
    type: "pct",
    group: "prog",
    footer: (rs) => ratio(rs, "prog_nondeal_spend_2026", "prog_spend_2026"),
  },

  // --- Labs ---
  { key: "labs_spend_2026", header: "Labs Spend", type: "money", group: "labs" },
  {
    key: "labs_share_total_media_2026",
    header: "Labs Share Total Media",
    type: "pct",
    group: "labs",
    footer: (rs) => ratio(rs, "labs_spend_2026", "total_spend_2026"),
    rag: (r, g) =>
      ragStatus(fieldN(r, "labs_share_total_media_2026"), g.labsShareGoal, { bands: g.bands }),
  },
  {
    key: "prog_labs_share_of_prog_2026",
    header: "Prog Labs Share of Prog",
    type: "pct",
    group: "labs",
    footer: (rs) => ratio(rs, "prog_labs_spend_2026", "prog_spend_2026"),
  },

  // --- Billups ---
  { key: "eligible_billups_ooh", header: "Elig. Billups OOH", type: "text", group: "billups" },
  { key: "eligible_billups_print", header: "Elig. Billups Print", type: "text", group: "billups" },
  {
    key: "billups_ooh_share_of_ooh_2026",
    header: "Billups Share of OOH",
    type: "pct",
    group: "billups",
    footer: (rs) => ratio(rs, "billups_ooh_spend_2026", "ooh_spend_2026"),
    rag: (r, g) =>
      parseEligible(r["eligible_billups_ooh"])
        ? ragStatus(fieldN(r, "billups_ooh_share_of_ooh_2026"), g.billupsShareGoal, {
            bands: g.bands,
          })
        : "neutral",
  },
  {
    key: "billups_print_share_of_print_2026",
    header: "Billups Share of Print",
    type: "pct",
    group: "billups",
    footer: (rs) => ratio(rs, "billups_print_spend_2026", "print_spend_2026"),
    rag: (r, g) =>
      parseEligible(r["eligible_billups_print"])
        ? ragStatus(fieldN(r, "billups_print_share_of_print_2026"), g.billupsShareGoal, {
            bands: g.bands,
          })
        : "neutral",
  },
];

// Group chips (dimension columns are always visible, so not listed here).
const GROUP_CHIPS: { id: Exclude<Group, "dim">; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "dd", label: "Digital Direct" },
  { id: "prog", label: "Programmatic" },
  { id: "labs", label: "Labs" },
  { id: "billups", label: "Billups" },
];

// --- Value + format helpers ---------------------------------------------------

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

// Export always covers every column (independent of which groups are shown).
const EXPORT_COLUMNS: TableColumn<KpiByClientRow, KpiByClientRow[]>[] = COLUMNS.map(
  (col) => ({
    id: col.key,
    label: col.header,
    group: "Investment KPIs",
    kind:
      col.type === "money" ? "money" : col.type === "text" ? "text" : "percent",
    align: col.type === "text" ? "left" : "right",
    raw: (r) => {
      const v = rawValue(r, col);
      if (col.type === "text") return textOf(v);
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    display: (r) => display(r, col),
    total:
      col.type === "text"
        ? undefined
        : (rows: KpiByClientRow[]) =>
            footerText(
              col,
              rows,
              rows.reduce((acc, r) => acc + num(rawValue(r, col)), 0)
            ),
    totalRaw:
      col.type === "money"
        ? (rows: KpiByClientRow[]) =>
            rows.reduce((acc, r) => acc + num(rawValue(r, col)), 0)
        : undefined,
  })
);

function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// --- Component ----------------------------------------------------------------

export default function InvestmentKpisTable({
  rows,
  focusedId = null,
  onRowClick,
  labsShareGoal = null,
  billupsShareGoal = null,
  bands,
}: {
  rows: KpiByClientRow[];
  focusedId?: string | null;
  onRowClick?: (id: string) => void;
  labsShareGoal?: number | null;
  billupsShareGoal?: number | null;
  bands?: RagBands;
}) {
  const [sortKey, setSortKey] = useState<string>("total_spend_2026");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleGroups, setVisibleGroups] = useState<Set<Group>>(
    () => new Set<Group>(["meta", "dd", "prog", "labs", "billups"])
  );

  const goals: Goals = useMemo(
    () => ({ labsShareGoal, billupsShareGoal, bands }),
    [labsShareGoal, billupsShareGoal, bands]
  );

  const columns = useMemo(
    () => COLUMNS.filter((c) => c.group === "dim" || visibleGroups.has(c.group)),
    [visibleGroups]
  );

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

  const toggleGroup = (id: Group) => {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          <CardAction className="flex items-center gap-2">
            {rows.length > 0 && (
              <ExportSheetButton
                columns={EXPORT_COLUMNS}
                rows={sorted}
                totals={sorted}
                title="Investment KPIs — By Client"
                sheetTitle="Investment KPIs"
                includeTotals
              />
            )}
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

        {/* Column-group toggles: focus the table on one area at a time. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-xs font-medium text-muted-foreground">Columns</span>
          {GROUP_CHIPS.map(({ id, label }) => {
            const on = visibleGroups.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleGroup(id)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-transparent bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

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
                    {columns.map((col, idx) => {
                      const numeric = col.type !== "text";
                      const active = sortKey === col.key;
                      const sticky =
                        idx === 0
                          ? "sticky left-0 top-0 z-30 min-w-[160px]"
                          : "sticky top-0 z-20";
                      const groupStart =
                        idx > 0 && columns[idx - 1].group !== col.group
                          ? "border-l border-border"
                          : "";
                      return (
                        <th
                          key={col.key}
                          className={`${headBase} ${sticky} ${groupStart} ${col.width ?? ""} ${
                            numeric ? "text-right" : "text-left"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={`inline-flex max-w-full items-center gap-1 hover:text-foreground ${
                              numeric ? "flex-row-reverse" : ""
                            } ${active ? "text-foreground" : ""}`}
                          >
                            <span className={col.truncate ? "truncate" : ""}>{col.header}</span>
                            {active &&
                              (sortDir === "asc" ? (
                                <ArrowUp size={12} className="flex-shrink-0" />
                              ) : (
                                <ArrowDown size={12} className="flex-shrink-0" />
                              ))}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => {
                    const rowId = (row.PLUSCO_CLIENT_ID ?? i).toString();
                    const focused = focusedId != null && focusedId === rowId;
                    const zebra = !focused && i % 2 === 1 ? "bg-muted/20" : "";
                    const rowCls = focused
                      ? "bg-muted"
                      : `${zebra} ${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}`.trim();
                    return (
                      <tr
                        key={rowId}
                        className={rowCls}
                        onClick={onRowClick ? () => onRowClick(rowId) : undefined}
                      >
                        {columns.map((col, idx) => {
                          const numeric = col.type !== "text";
                          const sticky =
                            idx === 0
                              ? `sticky left-0 z-10 min-w-[160px] ${
                                  focused ? "bg-muted" : "bg-card"
                                }`
                              : "";
                          const groupStart =
                            idx > 0 && columns[idx - 1].group !== col.group
                              ? "border-l border-border"
                              : "";
                          const status = col.rag ? col.rag(row, goals) : "neutral";
                          const rag = status !== "neutral" ? ragCell(status) : "";
                          const text = display(row, col);
                          return (
                            <td
                              key={col.key}
                              title={col.truncate ? text : undefined}
                              className={`${cellPad} ${sticky} ${groupStart} ${col.width ?? ""} ${rag} ${
                                numeric ? "text-right tabular-nums" : "text-left"
                              }`}
                            >
                              {col.truncate ? <div className="truncate">{text}</div> : text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    {columns.map((col, idx) => {
                      const groupStart =
                        idx > 0 && columns[idx - 1].group !== col.group
                          ? "border-l border-border"
                          : "";
                      if (idx === 0) {
                        return (
                          <td
                            key={col.key}
                            className={`${footBase} sticky bottom-0 left-0 z-30 min-w-[160px] text-left`}
                          >
                            Grand total
                          </td>
                        );
                      }
                      const numeric = col.type !== "text";
                      return (
                        <td
                          key={col.key}
                          className={`${footBase} ${groupStart} sticky bottom-0 z-20 ${
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
