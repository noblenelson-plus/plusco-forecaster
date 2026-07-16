// components/clients/recompute-tiers-modal.tsx
"use client";

/**
 * Admin modal that recomputes every client's tier from the digital media
 * spend (Digital Direct + Programmatic + SEM + Social) of one reference
 * submission. The admin picks the year + RFQ — typically the last completed
 * one; the picker defaults to the most recent LOCKED RFQ — then reviews the
 * dry-run diff before anything is written.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, ArrowRight, RefreshCw, AlertTriangle } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { RFQ, RFQType } from "../../lib/types/rfq.types";
import { sortRFQs } from "../../lib/types/rfq.types";
import { fetchRFQs, getRFQYears, getRFQsForYear } from "../../lib/services/rfq-service";
import {
  computeTierUpdates,
  applyTierUpdates,
  type TierRecomputeReport,
} from "../../lib/services/client-service";
import { CLIENT_TIERS } from "../../lib/constants/client.constants";
import { TIER_GROW_MIN, TIER_FULL_MIN } from "../../lib/format/tier";

const TIER_LABEL = Object.fromEntries(CLIENT_TIERS.map((t) => [t.value, t.label]));

/** "$1,250,000" — always shows the amount, unlike formatMoney (0 → "—"). */
function fmtCad(value: number): string {
  return "$" + Math.round(value).toLocaleString("en-CA");
}

interface RecomputeTiersModalProps {
  open: boolean;
  clients: Client[];
  onClose: () => void;
  /** Called after the changes are written, with the number of updated clients. */
  onApplied: (updatedCount: number) => void;
}

export default function RecomputeTiersModal({
  open,
  clients,
  onClose,
  onApplied,
}: RecomputeTiersModalProps) {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loadingRfqs, setLoadingRfqs] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [rfqType, setRfqType] = useState<RFQType | null>(null);

  const [computing, setComputing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<TierRecomputeReport | null>(null);
  const [error, setError] = useState("");

  // Load RFQs on open; default the selection to the most recent LOCKED RFQ
  // (a locked RFQ is a finalized one), falling back to the most recent overall.
  useEffect(() => {
    if (!open) return;
    setReport(null);
    setError("");
    setLoadingRfqs(true);
    fetchRFQs()
      .then((all) => {
        const sorted = sortRFQs(all);
        setRfqs(sorted);
        const preferred = sorted.find((r) => r.status === "LOCKED") ?? sorted[0];
        setYear(preferred?.year ?? null);
        setRfqType(preferred?.type ?? null);
      })
      .catch((err) =>
        setError("Failed to load RFQs: " + (err?.message ?? "Unknown error"))
      )
      .finally(() => setLoadingRfqs(false));
  }, [open]);

  const years = useMemo(() => getRFQYears(rfqs), [rfqs]);
  const rfqsForYear = useMemo(
    () => (year != null ? getRFQsForYear(rfqs, year) : []),
    [rfqs, year]
  );

  function handleYearChange(newYear: number) {
    setYear(newYear);
    setReport(null);
    // Keep the RFQ type when it exists for the new year, else pick the first.
    const options = getRFQsForYear(rfqs, newYear);
    if (!options.some((r) => r.type === rfqType)) {
      setRfqType(options[0]?.type ?? null);
    }
  }

  async function handleCompute() {
    if (year == null || rfqType == null) return;
    setComputing(true);
    setError("");
    setReport(null);
    try {
      setReport(await computeTierUpdates(clients, year, rfqType));
    } catch (err) {
      setError(
        "Failed to compute tiers: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setComputing(false);
    }
  }

  async function handleApply() {
    if (!report) return;
    setApplying(true);
    setError("");
    try {
      const count = await applyTierUpdates(report);
      onApplied(count);
    } catch (err) {
      setError(
        "Failed to apply changes: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Recompute tiers
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              From digital spend (Direct + Prog + SEM + Social), in CAD —
              Partner &lt; {fmtCad(TIER_GROW_MIN)} · Grow up to{" "}
              {fmtCad(TIER_FULL_MIN)} · Full above.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
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

          {/* Reference submission picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reference RFQ (usually the last completed one)
            </label>
            {loadingRfqs ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading RFQs...
              </div>
            ) : rfqs.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No RFQs available.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={year ?? ""}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={rfqType ?? ""}
                  onChange={(e) => {
                    setRfqType(e.target.value as RFQType);
                    setReport(null);
                  }}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer"
                >
                  {rfqsForYear.map((r) => (
                    <option key={r.rfq_id} value={r.type}>
                      {r.type}{r.status === "LOCKED" ? " (locked)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dry-run results */}
          {report && (
            <div className="space-y-3">
              {report.changes.length === 0 ? (
                <div className="bg-green-500 border border-green-500 text-white px-3 py-2 rounded-lg text-sm">
                  All {report.computations.length - report.skipped.length}{" "}
                  computed tiers already match — nothing to update.
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-600">
                    {report.changes.length} client
                    {report.changes.length !== 1 ? "s" : ""} will change (
                    {report.computations.length - report.skipped.length}{" "}
                    computed):
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {report.changes.map((c) => (
                      <div
                        key={c.cl_id}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate text-gray-900">{c.name}</span>
                        <span className="flex items-center gap-1.5 flex-shrink-0 text-xs">
                          <span className="text-gray-400">
                            {c.currentTier ? TIER_LABEL[c.currentTier] ?? c.currentTier : "—"}
                          </span>
                          <ArrowRight size={11} className="text-gray-300" />
                          <span className="font-medium text-gray-900">
                            {TIER_LABEL[c.computedTier]}
                          </span>
                          <span className="text-gray-400 ml-1">
                            ({fmtCad(c.digitalSpendCad)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {report.skipped.length > 0 && (
                <div className="bg-yellow-400 border border-yellow-400 text-gray-900 px-3 py-2 rounded-lg text-xs flex gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Skipped (no USD→CAD rate set for {year}):{" "}
                    {report.skipped.map((c) => c.name).join(", ")}. Their tier
                    was left untouched — set the rate in the currency settings
                    and recompute.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {!report ? (
            <button
              onClick={handleCompute}
              disabled={computing || loadingRfqs || year == null || rfqType == null}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
            >
              {computing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {computing ? "Computing..." : "Compute"}
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={applying || report.changes.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
            >
              {applying && <Loader2 size={14} className="animate-spin" />}
              {applying
                ? "Applying..."
                : `Apply ${report.changes.length} change${report.changes.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
