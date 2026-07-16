// components/bulk-edit/import-panel.tsx
"use client";

/**
 * Import side of Bulk Edit: paste the (already edited) sheet URL, pull the three
 * axis tabs, run the QA, and open the review modal. No write happens until the
 * user confirms inside the modal.
 */

import { useState } from "react";
import { Loader2, FileSearch, Check } from "lucide-react";
import ReviewModal from "./review-modal";
import type { AxisId } from "../../lib/types/forecaster.types";
import {
  type BulkReference,
  type PreparedImport,
  prepareImport,
} from "../../lib/services/bulk-import-service";
import { extractSpreadsheetId } from "../../lib/services/google-sheets-service";

const AXES: { id: AxisId; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "revenue", label: "Revenue" },
  { id: "labs", label: "Labs" },
];

export default function ImportPanel({
  reference,
  connected,
  userUid,
  onImported,
}: {
  reference: BulkReference;
  connected: boolean;
  userUid?: string;
  onImported: () => void;
}) {
  const [input, setInput] = useState("");
  const [axes, setAxes] = useState<AxisId[]>(["media", "revenue", "labs"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);

  const toggleAxis = (id: AxisId) =>
    setAxes((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  async function handlePull() {
    const id = extractSpreadsheetId(input);
    if (!id) {
      setError("Enter a valid Google Sheets URL or spreadsheet id.");
      return;
    }
    if (axes.length === 0) {
      setError("Select at least one tab to import.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await prepareImport(id, reference, axes);
      setPrepared(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read the sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Import from Google Sheet</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Paste the edited sheet&apos;s URL. We&apos;ll validate every row before anything is written.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
        />
        <button
          onClick={handlePull}
          disabled={!connected || busy || !input.trim() || axes.length === 0}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
          {busy ? "Reading…" : "Pull & Review"}
        </button>
      </div>

      {/* Tabs to import */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Tabs to import
        </p>
        <div className="flex flex-wrap gap-2">
          {AXES.map((a) => {
            const checked = axes.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAxis(a.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  checked
                    ? "bg-yellow-400 border-yellow-400 text-gray-900"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    checked ? "bg-yellow-400 border-yellow-400 text-gray-900" : "bg-white border-gray-300"
                  }`}
                >
                  {checked && <Check size={12} strokeWidth={3} />}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {!connected && (
        <p className="text-xs text-gray-400">Connect Google to enable import.</p>
      )}

      {error && (
        <div className="bg-red-500 border border-red-500 text-white px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {prepared && (
        <ReviewModal
          prepared={prepared}
          userUid={userUid}
          onClose={() => setPrepared(null)}
          onImported={() => {
            setPrepared(null);
            setInput("");
            onImported();
          }}
        />
      )}
    </div>
  );
}
