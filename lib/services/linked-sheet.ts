// lib/services/linked-sheet.ts

/**
 * Reading a Google Sheet from a pasted link (the client import and the
 * Forecast Access team import), with the admin's own Google access.
 */

import {
  extractSpreadsheetId,
  getSpreadsheetInfo,
  GoogleApiError,
  readSheet,
} from "./google-sheets-service";

/**
 * Reads the tab a pasted link points to (its `#gid=`, else the first tab) as
 * a table of strings, rows padded to the header width (the API drops trailing
 * empty cells). `name` is "File › Tab", shown in the review modal.
 */
export async function readLinkedSheet(link: string): Promise<{ name: string; table: string[][] }> {
  // "Publish to web" links carry a different id (2PACX-…) the API can't open.
  if (/\/spreadsheets\/d\/e\//.test(link)) {
    throw new Error(
      "That's a “Publish to web” link. Paste the sheet's normal link instead (copy it from the address bar)."
    );
  }
  const id = extractSpreadsheetId(link);
  if (!id) {
    throw new Error(
      "That doesn't look like a Google Sheets link — it should start with https://docs.google.com/spreadsheets/d/…"
    );
  }
  const gid = /[#&?]gid=(\d+)/.exec(link)?.[1];

  const info = await getSpreadsheetInfo(id);
  const tab =
    (gid !== undefined && info.tabs.find((t) => t.sheetId === Number(gid))) || info.tabs[0];
  if (!tab) throw new Error("That spreadsheet has no tabs.");

  // Unformatted values: numbers come back plain and checkboxes as booleans,
  // which String() turns into "true"/"false".
  const grid = (await readSheet(id, tab.title)).map((row) =>
    row.map((v) => (v == null ? "" : String(v)))
  );
  const width = grid[0]?.length ?? 0;
  const table = grid.map((row) =>
    row.length < width ? [...row, ...Array<string>(width - row.length).fill("")] : row
  );
  return { name: `${info.title} › ${tab.title}`, table };
}

/** Turns Google API failures into what the admin should do about them. */
export function describeSheetError(err: unknown): string {
  if (err instanceof GoogleApiError) {
    if (err.status === 403) {
      return "You don't have access to this sheet. Ask its owner to share it with you (Viewer is enough), then retry.";
    }
    if (err.status === 404) return "Sheet not found — check the link.";
    if (err.status === 400 && /not supported for this document/i.test(err.message)) {
      return "That file is an uploaded Excel/CSV, not a Google Sheet. Open it, use File → Save as Google Sheets, and paste the new link.";
    }
    if (err.status === 401) return "Your Google access expired — please retry.";
  }
  return err instanceof Error ? err.message : "Unknown error";
}

