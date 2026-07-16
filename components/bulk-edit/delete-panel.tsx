// components/bulk-edit/delete-panel.tsx
"use client";

/**
 * Bulk delete side of Bulk Edit: pick a scope (clients × years × RFQs × axes ×
 * sections), preview exactly which non-empty sections will be cleared, then
 * confirm. Like the import, this admin tool bypasses RFQ locks (the lock only
 * gates the Business Leads' grid). Deleting Media/Revenue re-syncs the derived
 * Revenue commission, mirroring the import path.
 */

import { useMemo, useState } from "react";
import {
  Trash2,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";
import TargetChips from "./target-chips";
import { RFQ_TYPES, type RFQType } from "../../lib/types/rfq.types";
import type { AxisId } from "../../lib/types/forecaster.types";
import {
  type BulkReference,
  type DeleteScope,
  type PreparedDelete,
  type DeleteResult,
  prepareBulkDelete,
  commitBulkDelete,
} from "../../lib/services/bulk-import-service";

const AXES: { id: AxisId; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "labs", label: "Labs" },
  { id: "revenue", label: "Revenue" },
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

export default function DeletePanel({
  reference,
  userUid,
  onDeleted,
}: {
  reference: BulkReference;
  userUid?: string;
  onDeleted: () => void;
}) {
  const years = useMemo(
    () => [...new Set(reference.rfqs.map((r) => r.year))].sort((a, b) => b - a),
    [reference.rfqs]
  );

  const [clientIds, setClientIds] = useState<string[]>([]);
  const [selYears, setSelYears] = useState<number[]>([]);
  const [selRfqs, setSelRfqs] = useState<RFQType[]>([]);
  const [axes, setAxes] = useState<AxisId[]>([]);
  const [includeBL, setIncludeBL] = useState(true);
  const [includeActuals, setIncludeActuals] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedDelete | null>(null);
  const [result, setResult] = useState<DeleteResult | null>(null);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Any scope change invalidates a previous preview — the chips must always
  // reflect exactly what the delete button will clear.
  const resetPreview = () => {
    setPrepared(null);
    setResult(null);
    setError("");
  };

  const scopeReady =
    clientIds.length > 0 &&
    selYears.length > 0 &&
    selRfqs.length > 0 &&
    axes.length > 0 &&
    (includeBL || includeActuals);

  async function handlePreview() {
    setPreviewing(true);
    setError("");
    setResult(null);
    const scope: DeleteScope = {
      clientIds,
      years: selYears,
      rfqs: selRfqs,
      axes,
      includeBL,
      includeActuals,
    };
    try {
      setPrepared(await prepareBulkDelete(scope, reference));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleDelete() {
    if (!prepared) return;
    setDeleting(true);
    setError("");
    try {
      const res = await commitBulkDelete(prepared, reference, userUid);
      setResult(res);
      setPrepared(null);
      if (res.errors.length === 0) onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white border border-red-200 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Trash2 size={16} className="text-red-500" />
          Bulk delete
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Clear forecast data for a scope. Preview first — every section that
          will be emptied shows as a chip, and nothing is written until you
          confirm.
        </p>
      </div>

      {/* Clients + years */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Clients"
          searchable
          options={reference.clients.map((c) => ({ value: c.cl_id, label: c.CL_Name }))}
          selectedValues={clientIds}
          onChange={(v) => {
            setClientIds(v);
            resetPreview();
          }}
        />
        <MultiSelectDropdown
          label="Years"
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          selectedValues={selYears.map(String)}
          onChange={(vals) => {
            setSelYears(vals.map(Number));
            resetPreview();
          }}
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
              onClick={() => {
                toggle(selRfqs, t.value, setSelRfqs);
                resetPreview();
              }}
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
              <Chip
                key={a.id}
                active={axes.includes(a.id)}
                onClick={() => {
                  toggle(axes, a.id, setAxes);
                  resetPreview();
                }}
              >
                {a.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sections</p>
          <div className="flex flex-wrap gap-2">
            <Chip
              active={includeBL}
              onClick={() => {
                setIncludeBL((v) => !v);
                resetPreview();
              }}
            >
              BL Input
            </Chip>
            <Chip
              active={includeActuals}
              onClick={() => {
                setIncludeActuals((v) => !v);
                resetPreview();
              }}
            >
              Admin Input
            </Chip>
          </div>
          {includeActuals && (
            <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-amber-700">
              Admin Input on Media/Labs is the year&apos;s annual MediaOcean
              data — clearing it affects every RFQ of that year, not just the
              selected ones.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500 border border-red-500 text-white px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Preview — chips of every section that will be cleared */}
      {prepared && (
        <div className="space-y-3 rounded-xl border border-red-500 bg-red-500 p-4">
          {prepared.targets.length === 0 ? (
            <p className="text-sm text-white">
              Nothing to delete — the selected scope holds no data.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">
                {prepared.targets.length} section
                {prepared.targets.length !== 1 ? "s" : ""} will be emptied:
              </p>
              <TargetChips targets={prepared.targets} />
            </>
          )}
        </div>
      )}

      {result && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            result.errors.length === 0
              ? "bg-green-500 border-green-500 text-white"
              : "bg-yellow-400 border-yellow-400 text-gray-900"
          }`}
        >
          {result.errors.length === 0 ? (
            <CheckCircle2 size={16} className="text-white" />
          ) : (
            <AlertTriangle size={16} className="text-gray-900" />
          )}
          {result.sectionsCleared} section{result.sectionsCleared !== 1 ? "s" : ""} cleared
          {result.commissionsRecalculated > 0 &&
            ` · ${result.commissionsRecalculated} commission re-sync${
              result.commissionsRecalculated !== 1 ? "s" : ""
            }`}
          {result.errors.length > 0 && ` · ${result.errors.length} error(s): ${result.errors[0]}`}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-gray-400">
          Includes locked RFQs (admin tool). This cannot be undone.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            disabled={!scopeReady || previewing || deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {previewing ? "Scanning…" : "Preview deletion"}
          </button>
          <button
            onClick={handleDelete}
            disabled={!prepared || prepared.targets.length === 0 || deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting
              ? "Deleting…"
              : prepared && prepared.targets.length > 0
                ? `Delete ${prepared.targets.length} section${prepared.targets.length !== 1 ? "s" : ""}`
                : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
