// components/report-center/all-flags-report.tsx
"use client";

/**
 * "All Flags" report card — the Report Center report that snapshots every flag
 * of every type (QA checks, big swings, under-target) for every client into one
 * Google Sheet tab. Unlike the General Forecast report it takes no scope: it
 * always covers all clients and all existing submissions. See report-service.ts.
 */

import { useState } from "react";
import { Flag, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import type { BulkReference } from "../../lib/services/bulk-import-service";
import {
  type ReportResult,
  generateAllFlagsReport,
} from "../../lib/services/report-service";

export default function AllFlagsReport({
  reference,
  connected,
}: {
  reference: BulkReference;
  connected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);

  const canGenerate = connected && !busy;

  async function handleGenerate() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await generateAllFlagsReport(reference);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 text-yellow-400">
          <Flag size={17} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">All Flags</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Every flag of every type — {""}
            <span className="font-medium text-gray-700">QA checks</span>,{" "}
            <span className="font-medium text-gray-700">big swings</span> and{" "}
            <span className="font-medium text-gray-700">under-target</span> — for{" "}
            <span className="font-medium text-gray-700">all clients</span> across
            every submission, flattened into one tab. Each row carries the client
            (agency, tier, currency), the submission (year, RFQ), the flag&apos;s
            axis, amounts (current, reference, delta), and — for persisted flags —
            its justification (context &amp; note). Amounts are in each
            client&apos;s own currency.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500 border border-red-500 text-white px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="flex items-center justify-between gap-3 bg-green-500 border border-green-500 rounded-lg px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-white">
            <CheckCircle2 size={16} className="text-white" />
            Report created — {result.rowCount} flags.
          </span>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-white hover:underline"
          >
            Open <ExternalLink size={14} />
          </a>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-gray-400">
          {connected
            ? "Scans every client and submission — may take a moment. Creates a one-way snapshot (not importable)."
            : "Connect Google to enable reports."}
        </p>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Flag size={14} />
          )}
          {busy ? "Generating…" : "Generate report"}
        </button>
      </div>
    </div>
  );
}
