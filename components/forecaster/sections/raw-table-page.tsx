// filepath: components/forecaster/sections/raw-table-page.tsx
"use client";

/**
 * Shared scaffold for the RAW data pages (MIR Raw Data, Billing Summary), backed
 * by the /api/raw-table BigQuery route.
 *
 * A real filter bar: each filterable field is an independent multi-select, and
 * they combine freely (AND across fields, OR within a field) â€” like Looker. No
 * "scope" concept. The preview table shows the first 10 matching rows in the
 * team's column order; export (CSV or Google Sheets) pulls the FULL filtered
 * result from BigQuery (never held in the browser until the moment of export).
 *
 * Data flow:
 *   - on mount: POST {action:"options"} -> distinct values for every filter field.
 *   - on filter change: POST {action:"query", mode:"preview"} -> 10 rows.
 *   - on export click: POST {action:"query", mode:"full"} -> whole slice, then
 *     build the export matrix and hand it to CSV / Sheets.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Download, Sheet as SheetIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import MultiSelectDropdown, {
  type Option,
} from "../../_shared/multi-select-dropdown";
import type { TableColumn } from "../table/table-column.types";
import { downloadTableCsv } from "../table/table-csv-export";
import {
  buildExportMatrix,
  exportToNewSheet,
  SheetsUnavailableError,
} from "../table/table-export";
import {
  connect,
  isConnected,
  isGoogleConfigured,
} from "../../../lib/services/google-sheets-service";

type RawRow = Record<string, unknown>;
type RawColumn = TableColumn<RawRow, Record<string, never>>;

const NO_TOTALS = {} as Record<string, never>;
const HIDDEN_FIELDS = new Set(["id", "_rowIndex", "_syncBatchId"]);

export interface RawFilterDef {
  field: string;
  label: string;
}

export interface RawTablePageProps {
  title: string;
  icon: LucideIcon;
  /** Route table key: "mir" | "billing". */
  tableKey: string;
  /** Filter fields shown in the bar (must match the route's allowlist). */
  filters: RawFilterDef[];
  /** Preferred column order for preview + export (present fields first). */
  columnOrder: string[];
  /** Fields rendered right-aligned / $-formatted. */
  moneyFields: Set<string>;
  /** File-name stem for exports. */
  exportTitle: string;
}

function money(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}
function text(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

async function postRoute(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/raw-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (data && (data.error as string)) || `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

export default function RawTablePage({
  title,
  icon: Icon,
  tableKey,
  filters,
  columnOrder,
  moneyFields,
  exportTitle,
}: RawTablePageProps) {
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"" | "csv" | "sheets">("");
  const [exportError, setExportError] = useState<string | null>(null);

  // Load filter option lists once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await postRoute({ table: tableKey, action: "options" });
        if (cancelled) return;
        setOptions((data.options as Record<string, string[]>) || {});
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load filters.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableKey]);

  // Fetch the 10-row preview whenever the selected filters change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await postRoute({
          table: tableKey,
          action: "query",
          mode: "preview",
          filters: selected,
        });
        if (cancelled) return;
        setRows((data.rows as RawRow[]) || []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load rows.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableKey, selected]);

  const setFilter = (field: string, vals: string[]) =>
    setSelected((prev) => ({ ...prev, [field]: vals }));

  const anyFilter = Object.values(selected).some((v) => v.length > 0);

  const clearFilters = () => setSelected({});

  // Ordered field list for the preview: preferred order first, then the rest.
  const previewFields = useMemo(() => {
    if (rows.length === 0) return [];
    const present = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) present.add(k);
    HIDDEN_FIELDS.forEach((h) => present.delete(h));

    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const f of columnOrder) {
      if (present.has(f) && !seen.has(f)) {
        seen.add(f);
        ordered.push(f);
      }
    }
    for (const f of present) {
      if (!seen.has(f)) {
        seen.add(f);
        ordered.push(f);
      }
    }
    return ordered;
  }, [rows, columnOrder]);

  // Build export column descriptors for a given set of rows.
  const buildColumns = useCallback(
    (data: RawRow[]): RawColumn[] => {
      const present = new Set<string>();
      for (const r of data) for (const k of Object.keys(r)) present.add(k);
      HIDDEN_FIELDS.forEach((h) => present.delete(h));

      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const f of columnOrder) {
        if (present.has(f) && !seen.has(f)) {
          seen.add(f);
          ordered.push(f);
        }
      }
      for (const f of present) {
        if (!seen.has(f)) {
          seen.add(f);
          ordered.push(f);
        }
      }

      return ordered.map((field) => {
        const isMoney = moneyFields.has(field);
        return {
          id: field,
          label: field,
          group: "Raw",
          kind: isMoney ? "money" : "text",
          align: isMoney ? "right" : "left",
          raw: (row: RawRow) => {
            const v = row[field];
            if (v === null || v === undefined) return null;
            return typeof v === "number" ? v : String(v);
          },
          display: isMoney
            ? (row: RawRow) => money(row[field])
            : (row: RawRow) => text(row[field]),
        } as RawColumn;
      });
    },
    [columnOrder, moneyFields]
  );

  const fetchFull = useCallback(async (): Promise<RawRow[]> => {
    const data = await postRoute({
      table: tableKey,
      action: "query",
      mode: "full",
      filters: selected,
    });
    return (data.rows as RawRow[]) || [];
  }, [tableKey, selected]);

  const exportCsv = async () => {
    setExportError(null);
    setExporting("csv");
    try {
      const full = await fetchFull();
      const cols = buildColumns(full);
      const filterBits = Object.values(selected)
        .flat()
        .slice(0, 2)
        .join("-");
      downloadTableCsv({
        columns: cols,
        rows: full,
        totals: NO_TOTALS,
        filename: filterBits ? `${exportTitle} - ${filterBits}` : exportTitle,
        includeTotals: false,
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "CSV export failed.");
    } finally {
      setExporting("");
    }
  };

  const exportSheets = async () => {
    setExportError(null);
    if (!isGoogleConfigured()) {
      setExportError("Google Sheets export is not configured for this environment.");
      return;
    }
    try {
      // Open the connect popup inside the click gesture (survives popup blockers)
      // before any await, so the later export call finds a live session.
      if (!isConnected()) await connect();
      setExporting("sheets");
      const full = await fetchFull();
      const cols = buildColumns(full);
      const matrix = buildExportMatrix(cols, full, NO_TOTALS, false);
      const url = await exportToNewSheet({
        title: exportTitle,
        sheetTitle: title,
        matrix,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg =
        e instanceof SheetsUnavailableError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Sheets export failed.";
      setExportError(msg);
    } finally {
      setExporting("");
    }
  };

  const busy = exporting !== "";

  return (
    <div data-scroll-section data-scroll-label={title} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>

      {/* Filter bar + export actions. */}
      <div className="flex flex-wrap items-end gap-3">
        {filters.map((f) => (
          <MultiSelectDropdown
            key={f.field}
            label={f.label}
            options={(options[f.field] || []).map(
              (v): Option => ({ value: v, label: v })
            )}
            selectedValues={selected[f.field] || []}
            onChange={(vals: string[]) => setFilter(f.field, vals)}
            searchable
          />
        ))}
        {anyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </button>
        )}

      </div>

      {exportError && (
        <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
          {exportError}
        </div>
      )}

      {/* Actions bar: sample note + export buttons, directly above the table. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {anyFilter
            ? "Previewing the first 10 matching rows. Export downloads the full filtered result."
            : "Showing a sample of the first 10 rows (all columns). Apply filters above to narrow, then export the full result."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === "csv" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {exporting === "csv" ? "Preparing..." : "Download CSV"}
          </button>
          <button
            type="button"
            onClick={exportSheets}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === "sheets" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <SheetIcon size={14} />
            )}
            {exporting === "sheets" ? "Exporting..." : "Export to Sheets"}
          </button>
        </div>
      </div>

      {/* Body. */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="space-y-2">
          <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
            Couldn&apos;t load {title}: {error}
          </div>
          <p className="text-xs text-muted-foreground">
            This view queries BigQuery server-side. If this is an auth error, the
            host needs Application Default Credentials or a service account.
          </p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[600px] rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {previewFields.map((f) => (
                  <th
                    key={f}
                    className={
                      "whitespace-nowrap px-4 py-3 font-medium " +
                      (moneyFields.has(f) ? "text-right" : "text-left")
                    }
                  >
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                  {previewFields.map((f) => (
                    <td
                      key={f}
                      className={
                        "whitespace-nowrap px-4 py-2.5 " +
                        (moneyFields.has(f)
                          ? "text-right tabular-nums text-muted-foreground"
                          : "text-left text-muted-foreground")
                      }
                    >
                      {moneyFields.has(f) ? money(row[f]) : text(row[f])}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={previewFields.length || 1}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
