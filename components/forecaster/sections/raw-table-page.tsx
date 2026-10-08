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
 * the Google Sheets export writes the FULL filtered result.
 *
 * Data flow: on mount (or when the user's agency scope changes) the snapshot is
 * downloaded once and held column-encoded in memory; filter options, the match
 * count, the preview and exports are all computed locally from it.
 */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Sheet as SheetIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import MultiSelectDropdown, {
  type Option,
} from "../../_shared/multi-select-dropdown";
import {
  assertSizesFitInSheets,
  exportToNewSheet,
  SheetsUnavailableError,
  type CellValue,
} from "../table/table-export";
import {
  connect,
  isConnected,
  isGoogleConfigured,
} from "../../../lib/services/google-sheets-service";
import { useAgencyScope } from "../../../lib/hooks/use-agency-scope";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { disambiguatePersonOptions, personLabel } from "../../../lib/format/person";
import { agencyScopeLabel } from "../../../lib/format/agency-scope";
import {
  distinctValues,
  filterRowIndices,
  loadReport,
  rowAt,
  type ColumnarTable,
  type LoadedReport,
  type ReportTable,
} from "../../../lib/dashboard/data/report-snapshot";

type RawRow = Record<string, unknown>;

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
  /**
   * Show/export only the `columnOrder` fields. Off (default): any other
   * snapshot column is appended after them.
   */
  onlyListedColumns?: boolean;
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

/**
 * Visible fields: `preferred` order first (when present), then — unless
 * `onlyListed` — every other snapshot column.
 */
function orderFields(
  columns: string[],
  preferred: string[],
  onlyListed = false
): string[] {
  const present = new Set(columns.filter((c) => !HIDDEN_FIELDS.has(c)));
  const ordered = preferred.filter((f, i) => present.has(f) && preferred.indexOf(f) === i);
  if (onlyListed) return ordered;
  const seen = new Set(ordered);
  for (const f of present) if (!seen.has(f)) ordered.push(f);
  return ordered;
}

/** Rows built between yields to the browser while preparing an export. */
const BUILD_BATCH_ROWS = 5_000;

/**
 * The raw export matrix (header + one row per matching row), read straight
 * from the columnar snapshot: no per-row objects and no display formatting —
 * numbers stay numbers, everything else goes out as text, nulls as empty
 * cells. Built in batches that yield to the browser, so the page stays
 * responsive and can show progress on large exports.
 */
async function buildRawMatrix(
  table: ColumnarTable,
  rowIndices: number[],
  fields: string[],
  onProgress: (pct: number) => void
): Promise<CellValue[][]> {
  const cols = fields.map((f) => ({ dict: table.dicts[f], idx: table.idx[f] }));
  const matrix: CellValue[][] = [fields];
  for (let start = 0; start < rowIndices.length; start += BUILD_BATCH_ROWS) {
    const end = Math.min(start + BUILD_BATCH_ROWS, rowIndices.length);
    for (let i = start; i < end; i++) {
      const r = rowIndices[i];
      matrix.push(
        cols.map(({ dict, idx }) => {
          const v = dict[idx[r]];
          if (v === null || v === undefined) return "";
          return typeof v === "number" ? v : String(v);
        })
      );
    }
    onProgress(Math.round((end / rowIndices.length) * 100));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return matrix;
}

export default function RawTablePage({
  title,
  icon: Icon,
  tableKey,
  filters,
  columnOrder,
  onlyListedColumns = false,
  moneyFields,
  exportTitle,
}: RawTablePageProps) {
  const { scope, loading: scopeLoading } = useAgencyScope();
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Export progress label ("" = idle), shown on the button. */
  const [exportStage, setExportStage] = useState("");
  /** The last exported sheet — a link, since the auto-opened tab is often blocked. */
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
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

  // Person columns (Business Lead) may hold emails: show names instead.
  const usersMap = useUsersMap();

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

  // A filter change invalidates the last export's "Open sheet" link.
  const setFilter = (field: string, vals: string[]) => {
    setSheetUrl(null);
    setSelected((prev) => ({ ...prev, [field]: vals }));
  };

  const anyFilter = Object.values(selected).some((v) => v.length > 0);

  const clearFilters = () => {
    setSheetUrl(null);
    setSelected({});
  };

  // Columns shown in the preview and written by the export (one list, so the
  // two always match). Every row carries every snapshot column, so this comes
  // from the table's shape, not its rows.
  const exportFields = useMemo(
    () => (table ? orderFields(table.columns, columnOrder, onlyListedColumns) : []),
    [table, columnOrder, onlyListedColumns]
  );
  const previewFields = rows.length > 0 ? exportFields : [];

  const exportSheets = async () => {
    setExportError(null);
    setSheetUrl(null);
    if (!isGoogleConfigured()) {
      setExportError("Google Sheets export is not configured for this environment.");
      return;
    }
    if (!table) return;
    try {
      // Instant size check from the shape alone, so an over-limit export is
      // rejected before the Google popup — nobody should sign in just to be
      // told it's too big.
      assertSizesFitInSheets([{ rows: matched.length + 1, cols: exportFields.length }]);
      // Open the connect popup straight from the click (any slow work before
      // it delays the popup and risks the popup blocker).
      if (!isConnected()) await connect();
      setExportStage("Preparing…");
      const matrix = await buildRawMatrix(table, matched, exportFields, (pct) =>
        setExportStage(`Preparing ${pct}%…`)
      );
      const url = await exportToNewSheet({
        title: exportTitle,
        sheetTitle: title,
        matrix,
        onProgress: (done, total) =>
          setExportStage(total > 1 ? `Uploading ${done}/${total}…` : "Uploading…"),
      });
      setSheetUrl(url);
      // Usually blocked after a long upload (no longer tied to the click), so
      // the "Open sheet" link below is the reliable way in.
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
      setExportStage("");
    }
  };

  const busy = exportStage !== "" || loading || !table || matched.length === 0;

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
            options={disambiguatePersonOptions(
              (options[f.field] || [])
                .map((v): Option => ({ value: v, label: personLabel(v, usersMap) }))
                .sort((a, b) => a.label.localeCompare(b.label))
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
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              <ExternalLink size={14} />
              Open sheet
            </a>
          )}
          <button
            type="button"
            onClick={exportSheets}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportStage ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <SheetIcon size={14} />
            )}
            {exportStage || "Export to Sheets"}
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
