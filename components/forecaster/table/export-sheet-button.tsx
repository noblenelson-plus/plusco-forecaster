// components/forecaster/table/export-sheet-button.tsx
"use client";

/**
 * "Export to Sheets" action for a descriptor-driven table.
 *
 * Exports exactly what is rendered — the caller passes its visible columns and
 * its sorted rows, so the sheet mirrors the table on screen.
 *
 * The Google popup must open inside the click handler to survive popup
 * blockers, so the connect step is awaited here rather than pre-warmed.
 */

import { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Sheet as SheetIcon,
} from "lucide-react";
import type { TableColumn } from "./table-column.types";
import {
  buildExportMatrix,
  exportToNewSheet,
  SheetsUnavailableError,
} from "./table-export";

type Status =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; url: string }
  | { state: "error"; message: string };

export default function ExportSheetButton<R, T>({
  columns,
  rows,
 totals,
  title,
  sheetTitle,
  includeTotals = true,
}: {
  /** Visible columns, in display order. */
  columns: TableColumn<R, T>[];
  /** Rows in the order shown (i.e. already sorted). */
  rows: R[];
  totals: T;
  /** Spreadsheet file name. */
  title: string;
  /** Tab name inside the file. */
  sheetTitle: string;
  /** Append the grand-total row. Off for tables with no footer. */
  includeTotals?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const run = async () => {
    setStatus({ state: "working" });
    try {
      const matrix = buildExportMatrix(columns, rows, totals, includeTotals);
      const url = await exportToNewSheet({ title, sheetTitle, matrix });
      setStatus({ state: "done", url });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof SheetsUnavailableError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : "Export failed. Please try again.";
      setStatus({ state: "error", message });
    }
  };
if (status.state === "done") {
    return (
      <a
        href={status.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ExternalLink size={14} />
        Open sheet
      </a>
    );
  }
  if (status.state === "error") {
    return (
      <button
        type="button"
        onClick={() => void run()}
        title={status.message}
        className="inline-flex items-center gap-2 rounded-lg border border-red-700 bg-card px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-muted"
      >
        <AlertCircle size={14} />
        Export failed — retry
      </button>
    );
  }

  const working = status.state === "working";

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={working}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {working ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <SheetIcon size={14} />
      )}
      {working ? "Exporting…" : "Export"}
    </button>
  );
}