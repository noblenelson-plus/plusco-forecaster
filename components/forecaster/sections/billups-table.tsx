// filepath: components/forecaster/sections/billups-table.tsx
"use client";

/**
 * Per-client Billups table for the Executive KPIs → Billups page. A single flat,
 * sortable list (the Looker "Billups Booked to Date" table), source-agnostic:
 * it renders whatever BillupsClientRow[] the section hands it, whether those came
 * from the MIR feed or the forecast feed.
 *
 * Capped-scroll shell matching the app's other detail tables (client-detail /
 * investment-kpis): a 520px scroll region with a sticky header row and a sticky
 * grand-total footer, both on bg-muted so they stay legible over scrolling rows.
 * The section wraps this in a ChartCard, which provides the outer panel border.
 *
 * Styling mirrors the shared VarianceTable look: uppercase muted headers, rows on
 * border-b border-border/60, and a bold border-t-2 grand-total. Grand-total shares
 * are WEIGHTED — sum(billups) / sum(channel), never an average of per-row shares.
 *
 * Sorting mirrors the app's use-table-sort semantics: numeric columns sort
 * largest-first on the first click, text columns A→Z; nulls always sort last;
 * a third click clears back to the default (OOH Channel, descending). Sorting
 * runs on each column's raw value, never on the formatted string.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BillupsClientRow } from "../../../lib/dashboard/data/use-billups-by-client";

// ─── Formatting helpers (match the MediaOcean sections) ───────────────────────

/** 3848626 → "$3,848,626" (en-CA, full precision like the Looker table). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.88 → "88%" ; null → "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Ratio that returns null when the denominator is 0 (renders as "—"). */
function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Eligibility boolean → the Looker "Yes" / "N/A" label. */
function eligLabel(b: boolean): string {
  return b ? "Yes" : "N/A";
}

// ─── Column model ─────────────────────────────────────────────────────────────

type Align = "left" | "right" | "center";

interface Column {
  id: string;
  header: string;
  align: Align;
  /** Whether this column sorts numerically (largest-first) or as text (A→Z). */
  numeric: boolean;
  /** Formatted cell text for a row. */
  cell: (r: BillupsClientRow) => string;
  /** Sort key for a row (nulls sort last). */
  raw: (r: BillupsClientRow) => number | string | null;
  /** Optional formatted grand-total cell for the footer row. */
  footer?: (rows: BillupsClientRow[]) => string;
}

const sum = (rows: BillupsClientRow[], pick: (r: BillupsClientRow) => number): number =>
  rows.reduce((acc, r) => acc + pick(r), 0);

const COLUMNS: Column[] = [
  {
    id: "gmPod",
    header: "GM Pod",
    align: "left",
    numeric: false,
    cell: (r) => r.gmPod || "—",
    raw: (r) => r.gmPod,
    footer: () => "Grand total",
  },
  {
    id: "client",
    header: "Client",
    align: "left",
    numeric: false,
    cell: (r) => r.clientName || "—",
    raw: (r) => r.clientName,
  },
  {
    id: "businessLead",
    header: "Business Lead",
    align: "left",
    numeric: false,
    cell: (r) => r.businessLead || "—",
    raw: (r) => r.businessLead,
  },
  {
    id: "agency",
    header: "Agency",
    align: "left",
    numeric: false,
    cell: (r) => r.agency || "—",
    raw: (r) => r.agency,
  },
  {
    id: "buRegion",
    header: "BU Region",
    align: "left",
    numeric: false,
    cell: (r) => r.buRegion || "—",
    raw: (r) => r.buRegion,
  },
  {
    id: "status",
    header: "Status",
    align: "left",
    numeric: false,
    cell: (r) => r.clientStatus || "—",
    raw: (r) => r.clientStatus,
  },
  {
    id: "eligOoh",
    header: "Elig. OOH",
    align: "center",
    numeric: false,
    cell: (r) => eligLabel(r.eligibleOoh),
    raw: (r) => eligLabel(r.eligibleOoh),
  },
  {
    id: "eligPrint",
    header: "Elig. Print",
    align: "center",
    numeric: false,
    cell: (r) => eligLabel(r.eligiblePrint),
    raw: (r) => eligLabel(r.eligiblePrint),
  },
  {
    id: "oohTotal",
    header: "OOH Channel",
    align: "right",
    numeric: true,
    cell: (r) => money(r.oohTotal),
    raw: (r) => r.oohTotal,
    footer: (rows) => money(sum(rows, (r) => r.oohTotal)),
  },
  {
    id: "billupsOoh",
    header: "Billups-OOH",
    align: "right",
    numeric: true,
    cell: (r) => money(r.billupsOoh),
    raw: (r) => r.billupsOoh,
    footer: (rows) => money(sum(rows, (r) => r.billupsOoh)),
  },
  {
    id: "shareOoh",
    header: "Billups Share OOH",
    align: "right",
    numeric: true,
    cell: (r) => pct(ratio(r.billupsOoh, r.oohTotal)),
    raw: (r) => ratio(r.billupsOoh, r.oohTotal),
    footer: (rows) =>
      pct(ratio(sum(rows, (r) => r.billupsOoh), sum(rows, (r) => r.oohTotal))),
  },
  {
    id: "printTotal",
    header: "Print Channel",
    align: "right",
    numeric: true,
    cell: (r) => money(r.printTotal),
    raw: (r) => r.printTotal,
    footer: (rows) => money(sum(rows, (r) => r.printTotal)),
  },
  {
    id: "billupsPrint",
    header: "Billups-Print",
    align: "right",
    numeric: true,
    cell: (r) => money(r.billupsPrint),
    raw: (r) => r.billupsPrint,
    footer: (rows) => money(sum(rows, (r) => r.billupsPrint)),
  },
  {
    id: "sharePrint",
    header: "Billups Share Print",
    align: "right",
    numeric: true,
    cell: (r) => pct(ratio(r.billupsPrint, r.printTotal)),
    raw: (r) => ratio(r.billupsPrint, r.printTotal),
    footer: (rows) =>
      pct(ratio(sum(rows, (r) => r.billupsPrint), sum(rows, (r) => r.printTotal))),
  },
];

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";
interface SortState {
  columnId: string;
  direction: SortDirection;
}

// The Looker table lands sorted by OOH Channel, largest first.
const DEFAULT_SORT: SortState = { columnId: "oohTotal", direction: "desc" };

/** Numeric columns default to largest-first; text columns to A→Z. */
function defaultDirection(column: Column): SortDirection {
  return column.numeric ? "desc" : "asc";
}

/** Nulls always sort last, whichever direction is active. */
function compareValues(
  a: number | string | null,
  b: number | string | null
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-CA", { sensitivity: "base" });
}

// ─── Alignment classes ────────────────────────────────────────────────────────

function alignClass(align: Align): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

// ─── Table ────────────────────────────────────────────────────────────────────

export default function BillupsTable({ rows }: { rows: BillupsClientRow[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const activeColumn = useMemo(
    () => COLUMNS.find((c) => c.id === sort.columnId) ?? null,
    [sort.columnId]
  );

  const sortedRows = useMemo(() => {
    if (!activeColumn) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    // Array.prototype.sort is stable, so equal values keep their input order.
    return rows
      .slice()
      .sort(
        (a, b) => factor * compareValues(activeColumn.raw(a), activeColumn.raw(b))
      );
  }, [rows, activeColumn, sort.direction]);

  // Header click cycles: default direction → the opposite → back to DEFAULT_SORT.
  const toggle = (column: Column) => {
    setSort((current) => {
      if (current.columnId !== column.id) {
        return { columnId: column.id, direction: defaultDirection(column) };
      }
      if (current.direction === defaultDirection(column)) {
        return {
          columnId: column.id,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return DEFAULT_SORT;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No clients in scope for this selection.
      </div>
    );
  }

  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="min-w-[1100px] border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            {COLUMNS.map((c) => {
              const dir = sort.columnId === c.id ? sort.direction : null;
              return (
                <th
                  key={c.id}
                  className={`px-3 py-2 font-medium ${alignClass(c.align)}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${
                      c.align === "right"
                        ? "flex-row-reverse"
                        : c.align === "center"
                        ? "justify-center"
                        : ""
                    }`}
                  >
                    <span>{c.header}</span>
                    {dir === "asc" && <ChevronUp size={12} />}
                    {dir === "desc" && <ChevronDown size={12} />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r) => (
            <tr
              key={r.clientId}
              className="border-b border-border/60 hover:bg-muted/60"
            >
              {COLUMNS.map((c) => (
                <td
                  key={c.id}
                  className={`px-3 py-2 ${alignClass(c.align)} ${
                    c.numeric
                      ? "tabular-nums text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        <tfoot className="sticky bottom-0 z-20">
          <tr className="border-t-2 border-border bg-muted font-semibold">
            {COLUMNS.map((c) => (
              <td
                key={c.id}
                className={`px-3 py-2 ${alignClass(c.align)} ${
                  c.numeric ? "tabular-nums" : ""
                } text-foreground`}
              >
                {c.footer ? c.footer(sortedRows) : ""}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
