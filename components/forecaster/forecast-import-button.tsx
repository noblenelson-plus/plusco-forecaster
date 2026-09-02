// components/forecaster/forecast-import-button.tsx
"use client";

/**
 * "Import from Sheet" toolbar action — the entry point for the round-trip.
 *
 * Flow: paste the (edited, app-exported) sheet link → prepareBlImport reads the
 * BL Submission tab and builds a diff → the preview dialog shows it (blocking on
 * any format error) → on confirm, grid.applyBlImport writes it in one undoable
 * commit that autosaves. Only the BL Submission tab is read; the MediaOcean /
 * MediaBox tabs are ignored, so reference data can't be touched.
 */

import { useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import ForecastImportDialog from "./forecast-import-dialog";
import { showForecastToast } from "../../lib/format/toast";
import {
  prepareBlImport,
  ImportSourceError,
} from "../../lib/services/forecast-sheets-import-service";
import type { ImportDiff } from "../../lib/format/forecast-sheets-import";
import type {
  UseForecasterGridResult,
} from "../../lib/hooks/use-forecaster-grid";
import type { AxisConfig } from "../../lib/types/forecaster.types";

export default function ForecastImportButton({
  grid,
  config,
}: {
  grid: UseForecasterGridResult;
  config: AxisConfig;
}) {
  const [open, setOpen] = useState(false); // URL popover
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diff, setDiff] = useState<ImportDiff | null>(null); // preview dialog

  const close = () => {
    setOpen(false);
    setError("");
  };

  const review = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await prepareBlImport(url, config, grid.data);
      setDiff(result.diff);
      close();
    } catch (e) {
      setError(
        e instanceof ImportSourceError
          ? e.message
          : e instanceof Error && e.message
            ? e.message
            : "Import failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = (opts: { applyRemovals: boolean }) => {
    if (diff) grid.applyBlImport(diff, opts);
    setDiff(null);
    setUrl("");
    showForecastToast("Import applied — autosaving. Undo to revert.", "success");
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
          title="Import an edited sheet's BL Submission tab back into the forecast"
        >
          <FileUp size={14} />
          Import from Sheet
        </button>

        {open && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-30" onClick={close} />
            <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  Import from Google Sheet
                </span>
                <button
                  onClick={close}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mb-2 text-xs text-gray-500">
                Paste the link of a sheet exported from here. Only the BL
                Submission tab is read; MediaOcean and MediaBox are ignored.
              </p>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim() && !busy) void review();
                }}
                autoFocus
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              {error && (
                <p className="mt-2 text-xs text-red-600">{error}</p>
              )}
              <button
                onClick={() => void review()}
                disabled={!url.trim() || busy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-500 disabled:opacity-50 transition-colors"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? "Reading…" : "Pull & Review"}
              </button>
            </div>
          </>
        )}
      </div>

      {diff && (
        <ForecastImportDialog
          diff={diff}
          bucketLabel={config.bucketLabel}
          onApply={apply}
          onClose={() => setDiff(null)}
        />
      )}
    </>
  );
}