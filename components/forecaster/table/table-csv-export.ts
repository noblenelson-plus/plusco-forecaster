// filepath: components/forecaster/table/table-csv-export.ts
/**
 * CSV download for descriptor-driven tables.
 *
 * Sibling of table-export.ts (the Google Sheets path): it reuses the SAME
 * buildExportMatrix, so a CSV download and a Sheets export produce identical
 * content -- header row, one row per (sorted) data row, optional grand total.
 * The only difference is the transport: this needs no Google auth, it just
 * builds a text/csv blob and triggers a browser download. Ideal for the raw MIR
 * / Billing pages where a lead wants the file to pivot on themselves.
 *
 * Values come from buildExportMatrix as CellValue (string | number): numbers stay
 * numeric (summable in Excel/Sheets), percents come through as their display
 * string. Standard RFC-4180 quoting is applied so commas, quotes and newlines in
 * text cells (client names, estimate names, etc.) never break the columns.
 */

import type { TableColumn } from "./table-column.types";
import { buildExportMatrix, type CellValue } from "./table-export";

/** RFC-4180 quote a single cell: wrap in quotes and double internal quotes when needed. */
function csvCell(value: CellValue): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote if the value contains a comma, quote, CR or LF; otherwise leave bare.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Turn a matrix (from buildExportMatrix) into an RFC-4180 CSV string. */
export function matrixToCsv(matrix: CellValue[][]): string {
  return matrix.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Build the export matrix from the table descriptors and trigger a CSV download.
 * Mirrors exportToNewSheet's signature so the two buttons feel identical to use.
 *
 * @param filename  file name WITHOUT extension; ".csv" is appended.
 */
export function downloadTableCsv<R, T>({
  columns,
  rows,
  totals,
  filename,
  includeTotals = true,
}: {
  columns: TableColumn<R, T>[];
  rows: R[];
  totals: T;
  filename: string;
  includeTotals?: boolean;
}): void {
  const matrix = buildExportMatrix(columns, rows, totals, includeTotals);
  const csv = matrixToCsv(matrix);

  // Prefix a UTF-8 BOM so Excel opens accented client names (é, à, ç) correctly.
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const safe = filename.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe || "export"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
