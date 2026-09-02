// lib/services/forecast-sheets-import-service.ts

/**
 * Read side of the forecast grid's Sheets round-trip: turn a pasted spreadsheet
 * link into a validated diff against the current grid.
 *
 * It reads ONLY the "BL Submission" tab — the MediaOcean / MediaBox reference
 * tabs are never touched, so edits there can't affect anything. Because the
 * OAuth scope is drive.file, the importer can only open sheets the app created
 * (i.e. a forecaster export); a link to some other sheet fails with a clear
 * message rather than a raw Google error. Parsing/validation live in the pure
 * buildBlImportDiff — this layer only does the I/O and maps failures to
 * human-readable, actionable errors.
 */

import {
  connect,
  extractSpreadsheetId,
  getSheetTitles,
  isConnected,
  readSheet,
} from "./google-sheets-service";
import { buildBlImportDiff, type ImportDiff } from "../format/forecast-sheets-import";
import type { AxisData, AxisConfig } from "../types/forecaster.types";

/** The tab written by the forecast grid's export (forecast-sheets.ts). */
const BL_TAB = "BL Submission";

/** A user-facing, actionable problem with the source sheet (not a code bug). */
export class ImportSourceError extends Error {}

export interface PreparedBlImport {
  spreadsheetId: string;
  diff: ImportDiff;
}

/**
 * Resolves a pasted link/id, opens the sheet, reads the BL Submission tab, and
 * returns the diff. Throws ImportSourceError for anything the user can fix
 * (bad link, wrong/inaccessible sheet, missing tab). The returned diff may
 * still be `blocked` with per-row format errors — those are shown in the
 * preview, not thrown here.
 */
export async function prepareBlImport(
  input: string,
  config: AxisConfig,
  data: AxisData
): Promise<PreparedBlImport> {
  const spreadsheetId = extractSpreadsheetId(input);
  if (!spreadsheetId) {
    throw new ImportSourceError(
      "Paste a valid Google Sheets link or spreadsheet id."
    );
  }

  if (!isConnected()) await connect();

  let titles: string[];
  try {
    titles = await getSheetTitles(spreadsheetId);
  } catch {
    throw new ImportSourceError(
      "Couldn't open that sheet. The importer can only read sheets exported from " +
        "the forecaster (and shared with your Google account). Export a fresh sheet, " +
        "edit it, then paste its link."
    );
  }

  const hasBlTab = titles.some(
    (t) => t.trim().toLowerCase() === BL_TAB.toLowerCase()
  );
  if (!hasBlTab) {
    throw new ImportSourceError(
      `That sheet has no "${BL_TAB}" tab` +
        (titles.length ? ` (found: ${titles.join(", ")})` : "") +
        ". Paste a link to a sheet exported from the forecaster."
    );
  }

  const matrix = await readSheet(spreadsheetId, BL_TAB);
  const diff = buildBlImportDiff(matrix, config, data);
  return { spreadsheetId, diff };
}