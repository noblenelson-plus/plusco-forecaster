// components/clients/sheet-import-modal.tsx
"use client";

import { useState } from "react";
import { X, AlertTriangle, Loader2, FileSpreadsheet, Upload } from "lucide-react";
import {
  CSVValidationResult,
  ImportStructureError,
  validateClientTable,
} from "../../lib/services/client-service";
import {
  extractSpreadsheetId,
  getSpreadsheetInfo,
  GoogleApiError,
  readSheet,
} from "../../lib/services/google-sheets-service";

/**
 * Reads the tab a pasted link points to (its `#gid=`, else the first tab) as
 * a table of strings, rows padded to the header width (the API drops trailing
 * empty cells). `name` is "File › Tab", shown in the review modal.
 */
async function readLinkedSheet(link: string): Promise<{ name: string; table: string[][] }> {
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
function describeSheetError(err: unknown): string {
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

interface SheetImportModalProps {
  /** cl_ids already in the app — ids not in it are flagged as new clients. */
  existingIds: ReadonlySet<string>;
  onClose: () => void;
  /** The sheet passed the structure check — hand off to the review modal. */
  onValidated: (result: CSVValidationResult) => void;
  /** Fallback: pick a CSV file instead. */
  onUploadCSV: () => void;
}

/**
 * Step 1 of the client import: paste a Google Sheet link. The sheet is read
 * with the admin's own Google access and dry-run validated; a wrongly-shaped
 * sheet is flagged here (nothing to review), otherwise the row-level review
 * happens in ImportModal.
 */
export default function SheetImportModal({
  existingIds,
  onClose,
  onValidated,
  onUploadCSV,
}: SheetImportModalProps) {
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function handleCheck() {
    setChecking(true);
    setProblems([]);
    try {
      // First Google call opens the consent popup when there's no live token.
      const { name, table } = await readLinkedSheet(link.trim());
      onValidated(validateClientTable(name, table, existingIds));
    } catch (err) {
      setProblems(
        err instanceof ImportStructureError ? err.problems : [describeSheetError(err)]
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg bg-white shadow-2xl flex flex-col max-h-[80vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 flex items-center justify-center">
                <FileSpreadsheet size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Import from Google Sheets
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Nothing is saved until you confirm the review.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Google Sheet link
              </label>
              <input
                type="url"
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && link.trim() && !checking) handleCheck();
                }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="w-full px-3 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
              <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc pl-4">
                <li>
                  Start from <strong>Export → Client list</strong> so the columns
                  match. Keep the headers on row 1 and don&apos;t rename them.
                </li>
                <li>
                  The tab open in the link is imported (the first tab if the
                  link has no <code>#gid=</code>).
                </li>
                <li>
                  Rows with a <code>cl_id</code> update that client; rows
                  without one create a new client.
                </li>
              </ul>
            </div>

            {problems.length > 0 && (
              <div className="bg-red-500 px-3 py-2.5 space-y-1.5">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <AlertTriangle size={14} />
                  This sheet can&apos;t be imported
                </p>
                {problems.map((p, i) => (
                  <p key={i} className="text-xs text-white leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              onClick={onUploadCSV}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Upload size={13} />
              Upload a CSV file instead
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCheck}
                disabled={checking || !link.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checking && <Loader2 size={14} className="animate-spin" />}
                {checking ? "Checking..." : "Check sheet"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
