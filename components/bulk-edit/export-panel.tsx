// components/bulk-edit/export-panel.tsx
"use client";

/**
 * Export side of Bulk Edit: pick a scope (clients × years × RFQs × axes ×
 * sections) and push it to a fresh Google Sheet — one tab per axis plus a Guide.
 * Covers "by submission / by client / everything" simply by what is selected.
 */

import { useMemo, useState } from "react";
import { Download, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import { RFQ_TYPES, type RFQType } from "../../lib/types/rfq.types";
import type { AxisId } from "../../lib/types/forecaster.types";
import {
  type BulkReference,
  type ExportScope,
  type ExportResult,
  exportToSheet,
} from "../../lib/services/bulk-import-service";

const AXES: { id: AxisId; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "revenue", label: "Revenue" },
  { id: "labs", label: "Labs" },
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
          ? "bg-yellow-50 border-yellow-300 text-yellow-900"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function ExportPanel({
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
  const [axes, setAxes] = useState<AxisId[]>(["media", "revenue", "labs"]);
  const [includeBL, setIncludeBL] = useState(true);
  const [includeActuals, setIncludeActuals] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canExport =
    connected &&
    !busy &&
    clientIds.length > 0 &&
    selYears.length > 0 &&
    selRfqs.length > 0 &&
    axes.length > 0 &&
    (includeBL || includeActuals);

  async function handleExport() {
    setBusy(true);
    setError("");
    setResult(null);
    const scope: ExportScope = {
      clientIds,
      years: selYears,
      rfqs: selRfqs,
      axes,
      includeBL,
      includeActuals,
    };
    try {
      const res = await exportToSheet(scope, reference);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Export to Google Sheet</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Push the selected scope to a new sheet, edit it in Google Sheets, then import it back.
        </p>
      </div>

      {/* Clients + years */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Clients"
          searchable
          options={reference.clients.map((c) => ({ value: c.cl_id, label: c.CL_Name }))}
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

      {/* RFQs */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">RFQ</p>
        <div className="flex flex-wrap gap-2">
          {RFQ_TYPES.map((t) => (
            <Chip
              key={t.value}
              active={selRfqs.includes(t.value)}
              onClick={() => toggle(selRfqs, t.value, setSelRfqs)}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Axes + sections */}
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Axes</p>
          <div className="flex flex-wrap gap-2">
            {AXES.map((a) => (
              <Chip key={a.id} active={axes.includes(a.id)} onClick={() => toggle(axes, a.id, setAxes)}>
                {a.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sections</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={includeBL} onClick={() => setIncludeBL((v) => !v)}>
              BL Input
            </Chip>
            <Chip active={includeActuals} onClick={() => setIncludeActuals((v) => !v)}>
              Admin Input
            </Chip>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600" />
            Sheet created — {result.rowCounts.media + result.rowCounts.revenue + result.rowCounts.labs} rows
            (Media {result.rowCounts.media} · Revenue {result.rowCounts.revenue} · Labs {result.rowCounts.labs}).
          </span>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900"
          >
            Open <ExternalLink size={14} />
          </a>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-gray-400">
          {connected ? "Creates a new sheet each time." : "Connect Google to enable export."}
        </p>
        <button
          onClick={handleExport}
          disabled={!canExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy ? "Exporting…" : "Push to Google Sheet"}
        </button>
      </div>
    </div>
  );
}
