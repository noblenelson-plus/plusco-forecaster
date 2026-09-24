// filepath: components/forecaster/sections/raw-table-page.tsx
"use client";

/**
 * Shared scaffold for the RAW data pages (MIR Raw Data, Billing Summary), backed
 * by the per-agency report snapshots the monthly sync publishes to Firebase
 * Storage (lib/dashboard/data/report-snapshot.ts). No BigQuery: nobody needs
 * BigQuery access, and each user only ever downloads their own agencies' files
 * (Admin: all agencies) — storage.rules enforce that.
 *
 * A real filter bar: each filterable field is an independent multi-select, and
 * they combine freely (AND across fields, OR within a field) — like Looker. The
 * preview table shows the first 10 matching rows in the team's column order;
 * export (CSV or Google Sheets) writes the FULL filtered result.
 *
 * Data flow: on mount (or when the user's agency scope changes) the snapshot is
 * downloaded once and held column-encoded in memory; filter options, the match
 * count, the preview and exports are all computed locally from it.
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
import { useAgencyScope } from "../../../lib/hooks/use-agency-scope";
import { agencyScopeLabel } from "../../../lib/format/agency-scope";
import {
  distinctValues,
  filterRowIndices,
  loadReport,
  rowAt,
  type LoadedReport,
  type ReportTable,
} from "../../../lib/dashboard/data/report-snapshot";

type RawRow = Record<string, unknown>;
type RawColumn = TableColumn<RawRow, Record<string, never>>;

const NO_TOTALS = {} as Record<string, never>;
const HIDDEN_FIELDS = new Set(["id", "_rowIndex", "_syncBatchId"]);
const PREVIEW_LIMIT = 10;

export interface RawFilterDef {
  field: string;
  label: string;
}

export interface RawTablePageProps {
  title: string;
  icon: LucideIcon;
  /** Snapshot table: "mir" | "billing". */
  tableKey: ReportTable;
  /** Filter fields shown in the bar (column names in the snapshot). */
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

export default function RawTablePage({
  title,
  icon: Icon,
  tableKey,
  filters,
  columnOrder,
  moneyFields,
  exportTitle,
}: RawTablePageProps) {
  const { scope, loading: scopeLoading } = useAgencyScope();
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"" | "csv" | "sheets">("");
  const [exportError, setExportError] = useState<string | null>(null);

  // Download the snapshot for the user's agencies (cached across sub-tabs).
  useEffect(() => {
    if (scopeLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadReport(tableKey, scope);
        if (!cancelled) setReport(loaded);
      } catch (e) {
        if (!cancelled) {
          setReport(null);
          setError(e instanceof Error ? e.message : "Failed to load the report.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableKey, scope, scopeLoading]);

  const table = report?.table ?? null;

  // Dropdown values per filter field, from the loaded rows only.
  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (table) for (const f of filters) out[f.field] = distinctValues(table, f.field);
    return out;
  }, [table, filters]);

  const matched = useMemo(
    () => (table ? filterRowIndices(table, selected) : []),
    [table, selected]
  );

  const rows = useMemo<RawRow[]>(
    () => (table ? matched.slice(0, PREVIEW_LIMIT).map((r) => rowAt(table, r)) : []),
    [table, matched]
  );

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

  // Every matching row, materialized only at export time.
  const fetchFull = useCallback(async (): Promise<RawRow[]> => {
    if (!table) return [];
    return matched.map((r) => rowAt(table, r));
  }, [table, matched]);

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

  const busy = exporting !== "" || loading || !table || matched.length === 0;

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
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {anyFilter
              ? `${matched.length.toLocaleString("en-CA")} matching rows. Previewing the first ${PREVIEW_LIMIT}; export writes all of them.`
              : `${matched.length.toLocaleString("en-CA")} rows. Showing a sample of the first ${PREVIEW_LIMIT} (all columns). Apply filters above to narrow, then export.`}
          </p>
          {report && (
            <p className="text-xs text-muted-foreground">
              Agencies: {scope.all ? agencyScopeLabel(scope) : report.agencies.join(", ") || "none"}
              {report.syncedAt &&
                ` · Data as of ${new Date(report.syncedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}`}
            </p>
          )}
        </div>
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
        <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          Couldn&apos;t load {title}: {error}
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
                    {report && report.agencies.length === 0
                      ? "No report data is available for your agency."
                      : "No rows match the current filters."}
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
