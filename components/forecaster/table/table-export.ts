// components/forecaster/table/table-export.ts

/**
 * Google Sheets export for descriptor-driven tables.
 *
 * Exports what is on screen: the visible columns, in display order, with the
 * active sort applied — so the sheet matches the table the room just looked at.
 *
 * Values are written with USER_ENTERED, so Sheets parses them rather than
 * storing text. Money and text go out as their raw values (a number stays a
 * number and stays summable); percentages go out as their display string,
 * because "18.5%" round-trips into a real percent-formatted cell whereas the
 * bare fraction 0.185 would land as an unformatted decimal.
 *
 * Reuses the Bulk Edit Google transport — no new auth path, no new scopes.
 */

import type { TableColumn } from "./table-column.types";
import {
  connect,
  createSpreadsheet,
  isConnected,
  isGoogleConfigured,
  writeValues,
} from "../../../lib/services/google-sheets-service";

export type CellValue = string | number;

/** Label of the pinned summary row, matching the table footer. */
const TOTAL_LABEL = "Grand total";

/** Coerces one cell for Sheets. Nulls become empty cells, never "—". */
function exportCell<R, T>(
  column: TableColumn<R, T>,
  raw: number | string | null,
  display: string
): CellValue {
  if (raw === null) return "";
  if (column.kind === "percent" || column.kind === "share") return display;
  return raw;
}

/**
 * Builds the sheet matrix: one header row, one row per data row, then the
 * grand total. Row order is the caller's — pass the sorted rows.
 */
export function buildExportMatrix<R, T>(
  columns: TableColumn<R, T>[],
  rows: R[],
  totals: T,
  /** Append the grand-total row. Off for tables that have no footer. */
  includeTotals = true
): CellValue[][] {
  const header: CellValue[] = columns.map((column) => column.label);

  const body: CellValue[][] = rows.map((row) =>
    columns.map((column) =>
      exportCell(column, column.raw(row), column.display(row))
    )
  );

if (!includeTotals) return [header, ...body];

  const totalRow: CellValue[] = columns.map((column, index) => {
    if (!column.total) return index === 0 ? TOTAL_LABEL : "";
    const display = column.total(totals);
    const raw = column.totalRaw ? column.totalRaw(totals) : display;
    return exportCell(column, raw, display);
  });

  return [header, ...body, totalRow];
}

/** Thrown when the feature is unavailable rather than merely failing. */
export class SheetsUnavailableError extends Error {}

/**
 * Pushes a matrix to a brand-new spreadsheet and returns its URL.
 *
 * Connects first when there is no live token. The Google token is short-lived
 * and cannot be refreshed client-side, so a long meeting may need a reconnect —
 * the popup handles that silently when a session is still valid.
 */
export async function exportToNewSheet({
  title,
  sheetTitle,
  matrix,
}: {
  /** Spreadsheet file name, e.g. "Client detail — 2026 RFQ2 vs 2025 Final". */
  title: string;
  /** Tab name inside the file. Keep it short. */
  sheetTitle: string;
  matrix: CellValue[][];
}): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new SheetsUnavailableError(
      "Google Sheets export is not configured for this environment."
    );
  }

  if (!isConnected()) await connect();

  const spreadsheet = await createSpreadsheet(title, [sheetTitle]);
  await writeValues(spreadsheet.spreadsheetId, sheetTitle, matrix);
  return spreadsheet.url;
}