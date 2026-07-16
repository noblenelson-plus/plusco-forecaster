// components/report-center/general-forecast-report.tsx
"use client";

/**
 * "General Forecast Data" report card — the first Report Center report. Picks
 * a scope (clients × years × RFQs × axes) and generates a one-tab Google Sheet
 * with the selected axes flattened together, a Submission column (RFQ2-2026), a vertical
 * Total column, and per-axis "BL Submission (BL+Admin)" summary rows (the
 * forecast grid's mauve source-of-truth line). See report-service.ts.
 */

import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import { RFQ_TYPES, type RFQType } from "../../lib/types/rfq.types";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { BulkReference } from "../../lib/services/bulk-import-service";
import {
  type ReportResult,
  generateGeneralForecastReport,
} from "../../lib/services/report-service";

const AXIS_OPTIONS: { value: AxisId; label: string }[] = [
  { value: "media", label: "Media" },
  { value: "labs", label: "Labs" },
  { value: "revenue", label: "Revenue" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
        active
          ? "bg-yellow-400 border-yellow-400 text-gray-900"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function GeneralForecastReport({
  reference,
  connected,
}: {
  reference: BulkReference;
  connected: boolean;
}) {
  const years = useMemo(
    () => [...new Set(reference.rfqs.map((r) => r.year))].sort((a, b) => b - a),
    [reference.rfqs]
  );

  const [clientIds, setClientIds] = useState<string[]>([]);
  const [selYears, setSelYears] = useState<number[]>(years.slice(0, 1));
  const [selRfqs, setSelRfqs] = useState<RFQType[]>([]);
  // All axes selected by default — matches the report's historical behavior.
  const [selAxes, setSelAxes] = useState<AxisId[]>(
    AXIS_OPTIONS.map((a) => a.value)
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);

  const toggleRfq = (v: RFQType) =>
    setSelRfqs((list) =>
      list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
    );

  const toggleAxis = (v: AxisId) =>
    setSelAxes((list) =>
      list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
    );

  const canGenerate =
    connected &&
    !busy &&
    clientIds.length > 0 &&
    selYears.length > 0 &&
    selRfqs.length > 0 &&
    selAxes.length > 0;

  async function handleGenerate() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await generateGeneralForecastReport(
        { clientIds, years: selYears, rfqs: selRfqs, axes: selAxes },
        reference
      );
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
          <FileSpreadsheet size={17} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            General Forecast Data
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The selected axes (Media · Labs · Revenue) flattened into one tab, with
            a <span className="font-medium text-gray-700">Submission</span>{" "}
            column (e.g. RFQ2-2026), a vertical{" "}
            <span className="font-medium text-gray-700">Total</span> column, and
            per-axis{" "}
            <span className="font-medium text-gray-700">
              BL Submission (BL+Admin)
            </span>{" "}
            rows — the grid&apos;s source-of-truth line, where admin figures win
            each month over the BL forecast.
          </p>
        </div>
      </div>

      {/* Scope — clients × years × RFQs */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Clients"
          searchable
          options={reference.clients.map((c) => ({
            value: c.cl_id,
            label: c.CL_Name,
          }))}
          selectedValues={clientIds}
          onChange={setClientIds}
        />
        <MultiSelectDropdown
          label="Years"
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          selectedValues={selYears.map(String)}
          onChange={(vals) => setSelYears(vals.map(Number))}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          RFQ
        </p>
        <div className="flex flex-wrap gap-2">
          {RFQ_TYPES.map((t) => (
            <Chip
              key={t.value}
              active={selRfqs.includes(t.value)}
              onClick={() => toggleRfq(t.value)}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Axes
        </p>
        <div className="flex flex-wrap gap-2">
          {AXIS_OPTIONS.map((a) => (
            <Chip
              key={a.value}
              active={selAxes.includes(a.value)}
              onClick={() => toggleAxis(a.value)}
            >
              {a.label}
            </Chip>
          ))}
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
            Report created — {result.rowCount} rows.
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
            ? "Creates a new sheet each time — a one-way snapshot (not importable)."
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
            <FileSpreadsheet size={14} />
          )}
          {busy ? "Generating…" : "Generate report"}
        </button>
      </div>
    </div>
  );
}
