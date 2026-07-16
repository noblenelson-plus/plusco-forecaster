// components/clients/copy-commissions-modal.tsx
"use client";

/**
 * Admin modal that bulk-copies commission rates from one year to another
 * across every client — the year-end "seed next year" workflow. Same
 * semantics as the per-client "Copy from previous year" button: each media
 * type's December rate applied uniformly to the target year.
 *
 * The preview (dry run) is computed live from the already-loaded client
 * docs; nothing is written until the admin confirms. By default, clients
 * that already have rates for the target year are left untouched.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Copy, AlertTriangle, ArrowRight } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import {
  computeCommissionCopy,
  applyCommissionCopy,
  configuredYears,
} from "../../lib/services/commission-service";

interface CopyCommissionsModalProps {
  open: boolean;
  clients: Client[];
  onClose: () => void;
  /** Called after the changes are written, with the number of updated clients. */
  onApplied: (updatedCount: number) => void;
}

export default function CopyCommissionsModal({
  open,
  clients,
  onClose,
  onApplied,
}: CopyCommissionsModalProps) {
  // Source years: every year configured on at least one client.
  const sourceYears = useMemo(() => {
    const years = new Set<number>();
    clients.forEach((c) =>
      configuredYears(c.commissionsConfig ?? {}).forEach((y) => years.add(y))
    );
    return [...years].sort((a, b) => b - a);
  }, [clients]);

  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState<number | null>(null);
  const [toYear, setToYear] = useState<number | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  // Reset on open; default to "current year → next year" when available.
  useEffect(() => {
    if (!open) return;
    const from = sourceYears.includes(currentYear)
      ? currentYear
      : sourceYears[0] ?? null;
    setFromYear(from);
    setToYear(from != null ? from + 1 : null);
    setOverwrite(false);
    setError("");
    setSyncProgress(null);
  }, [open, sourceYears, currentYear]);

  // Target years: the year after each source year, plus a bit of slack.
  const targetYears = useMemo(() => {
    if (fromYear == null) return [];
    return [fromYear + 1, fromYear + 2, fromYear - 1].filter((y) => y !== fromYear);
  }, [fromYear]);

  const report = useMemo(() => {
    if (fromYear == null || toYear == null || fromYear === toYear) return null;
    return computeCommissionCopy(clients, fromYear, toYear, overwrite);
  }, [clients, fromYear, toYear, overwrite]);

  async function handleApply() {
    if (!report || report.copies.length === 0) return;
    setApplying(true);
    setError("");
    try {
      const { written, syncFailures } = await applyCommissionCopy(
        report,
        (done, total) => setSyncProgress({ done, total })
      );
      if (syncFailures.length > 0) {
        alert(
          `The ${report.toYear} rates were saved for all ${written} clients, but ` +
            `syncing the Revenue forecasts failed for: ${syncFailures.join(", ")}. ` +
            `Re-saving those clients' rates will retry the sync.`
        );
      }
      onApplied(written);
    } catch (err) {
      setError(
        "Failed to copy rates: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
      setApplying(false);
      setSyncProgress(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={applying ? undefined : onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Copy commission rates
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Seeds a year from another one, for every client: each media
              type&apos;s December rate is applied uniformly to the target year.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-500 border border-red-500 text-white px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {sourceYears.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No client has commission rates configured yet — nothing to copy.
            </p>
          ) : (
            <>
              {/* Year pickers */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    From
                  </label>
                  <select
                    value={fromYear ?? ""}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setFromYear(y);
                      setToYear(y + 1);
                    }}
                    disabled={applying}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer"
                  >
                    {sourceYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <ArrowRight size={14} className="text-gray-300 mt-5 flex-shrink-0" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    To
                  </label>
                  <select
                    value={toYear ?? ""}
                    onChange={(e) => setToYear(Number(e.target.value))}
                    disabled={applying}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer"
                  >
                    {targetYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Overwrite toggle */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  disabled={applying}
                  className="mt-0.5 accent-yellow-400"
                />
                <span className="text-sm text-gray-700">
                  Overwrite clients that already have {toYear} rates
                  <span className="block text-xs text-gray-400">
                    Off: those clients are skipped and keep their current {toYear} rates.
                  </span>
                </span>
              </label>

              {/* Dry-run preview */}
              {report && (
                <div className="space-y-3">
                  {report.copies.length === 0 ? (
                    <div className="bg-yellow-400 border border-yellow-400 text-gray-900 px-3 py-2 rounded-lg text-sm">
                      Nothing to copy: no client has {report.fromYear} rates
                      {report.skippedExisting.length > 0 &&
                        ` without existing ${report.toYear} rates`}
                      .
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-gray-600">
                        {report.copies.length} client
                        {report.copies.length !== 1 ? "s" : ""} will get{" "}
                        {report.toYear} rates:
                      </p>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                        {report.copies.map((c) => (
                          <div
                            key={c.cl_id}
                            className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="truncate text-gray-900">{c.name}</span>
                            <span className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-400">
                              {c.mediaTypes.length} type{c.mediaTypes.length !== 1 ? "s" : ""}
                              {c.hadTargetConfig && (
                                <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-gray-900 font-medium">
                                  overwrites
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(report.skippedExisting.length > 0 ||
                    report.skippedNoSource.length > 0) && (
                    <div className="bg-gray-50 border border-gray-200 text-gray-500 px-3 py-2 rounded-lg text-xs flex gap-2">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>
                        {report.skippedExisting.length > 0 && (
                          <>
                            Skipped ({report.toYear} rates already set):{" "}
                            {report.skippedExisting.map((c) => c.name).join(", ")}.{" "}
                          </>
                        )}
                        {report.skippedNoSource.length > 0 && (
                          <>
                            No {report.fromYear} rates:{" "}
                            {report.skippedNoSource.length} client
                            {report.skippedNoSource.length !== 1 ? "s" : ""}.
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          {applying && syncProgress && (
            <span className="text-xs text-gray-400 mr-auto">
              Syncing forecasts ({syncProgress.done}/{syncProgress.total})...
            </span>
          )}
          <button
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !report || report.copies.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {applying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Copy size={14} />
            )}
            {applying
              ? "Copying..."
              : report && report.copies.length > 0
                ? `Copy to ${report.copies.length} client${report.copies.length !== 1 ? "s" : ""}`
                : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
