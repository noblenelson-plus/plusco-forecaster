// components/forecaster/forecast-grid.tsx
"use client";

/**
 * Grid de prévision générique — piloté par un AxisConfig + le hook
 * useForecasterGrid. Utilisé tel quel par Media, puis Revenue et Labs.
 *
 * Anatomie :
 *   [Toolbar]  compare · add bucket · discard/save (+ compteur dirty)
 *   [Table]    Jan → Déc + Total
 *     ├─ Bucket (header : nom éditable, add row, delete)
 *     │    ├─ Rows typées (EditableCell × 12 + TotalCell)
 *     │    └─ Sous-total bucket
 *     ├─ ... autres buckets
 *     ├─ TOTAL (grand total BL_INPUT)
 *     └─ Actuals (ADMIN_INPUT — éditable admin seulement)
 *
 * Les suppressions (ligne/bucket) sont locales jusqu'au Save —
 * récupérables via Discard, donc pas de confirmation bloquante.
 */

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Lock,
  ChevronDown,
  RotateCcw,
  FolderPlus,
} from "lucide-react";
import type { AxisConfig, ForecastBucket } from "../../lib/types/forecaster.types";
import { buildCellKey } from "../../lib/types/forecaster.types";
import {
  type UseForecasterGridResult,
  sumMonths,
  monthTotals,
  grandMonthTotals,
} from "../../lib/hooks/use-forecaster-grid";
import { MONTHS } from "../../lib/types/common.types";
import { EditableCell, TotalCell } from "./editable-cell";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface ForecastGridProps {
  config: AxisConfig;
  grid: UseForecasterGridResult;
}

export default function ForecastGrid({
  config,
  grid,
}: ForecastGridProps) {
  const comparing = grid.referenceData !== null;
  const blReadOnly = grid.locked;

  // Totaux mémorisés
  const grandTotals = useMemo(() => grandMonthTotals(grid.data), [grid.data]);
  const refGrandTotals = useMemo(
    () => (grid.referenceData ? grandMonthTotals(grid.referenceData) : null),
    [grid.referenceData]
  );

  return (
    <div className="space-y-4">
      <GridToolbar config={config} grid={grid} />

      {grid.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {grid.error}
        </div>
      )}

      {grid.loading ? (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400 bg-white border border-gray-200 rounded-xl">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading {config.title}...</span>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs w-52">
                  {config.bucketLabel} / {config.rowTypeLabel}
                </th>
                {MONTH_LABELS.map((m) => (
                  <th
                    key={m}
                    className="px-1.5 py-2.5 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right min-w-[72px]"
                  >
                    {m}
                  </th>
                ))}
                <th className="px-2.5 py-2.5 font-semibold text-gray-700 uppercase tracking-wider text-xs text-right min-w-[88px] bg-gray-100/60">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {grid.data.buckets.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-gray-400">
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      No {config.bucketLabel.toLowerCase()} yet
                    </p>
                    <p className="text-xs">
                      {blReadOnly
                        ? "This RFQ is locked."
                        : `Add a ${config.bucketLabel.toLowerCase()} to start forecasting.`}
                    </p>
                  </td>
                </tr>
              ) : (
                grid.data.buckets.map((bucket) => (
                  <BucketSection
                    key={bucket.bucketId}
                    bucket={bucket}
                    config={config}
                    grid={grid}
                    comparing={comparing}
                    readOnly={blReadOnly}
                  />
                ))
              )}

              {/* ─── Grand total BL_INPUT ─── */}
              {grid.data.buckets.length > 0 && (
                <tr className="bg-gray-900">
                  <td className="sticky left-0 z-10 bg-gray-900 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider">
                    Total
                  </td>
                  {MONTHS.map((m) => (
                    <td key={m} className="px-2.5 py-2 text-right align-top">
                      <p className="text-sm font-bold text-white tabular-nums">
                        {grandTotals[m]
                          ? Math.round(grandTotals[m]).toLocaleString("en-CA")
                          : "—"}
                      </p>
                      {refGrandTotals && (
                        <p className="text-[11px] text-gray-400 tabular-nums">
                          {refGrandTotals[m]
                            ? Math.round(refGrandTotals[m]).toLocaleString("en-CA")
                            : "—"}
                        </p>
                      )}
                    </td>
                  ))}
                  <td className="px-2.5 py-2 text-right align-top bg-gray-800">
                    <p className="text-sm font-bold text-yellow-400 tabular-nums">
                      {Math.round(sumMonths(grandTotals)).toLocaleString("en-CA")}
                    </p>
                    {refGrandTotals && (
                      <p className="text-[11px] text-gray-400 tabular-nums">
                        {Math.round(sumMonths(refGrandTotals)).toLocaleString("en-CA")}
                      </p>
                    )}
                  </td>
                </tr>
              )}

              {/* ─── Actuals (ADMIN_INPUT) ─── */}
              <tr className="bg-blue-50/40 border-t-2 border-blue-100">
                <td className="sticky left-0 z-10 bg-blue-50/40 px-4 py-2">
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                    {config.actualsLabel}
                  </span>
                  {!grid.canEditActuals && (
                    <Lock size={10} className="inline ml-1.5 text-blue-300 -mt-0.5" />
                  )}
                </td>
                {MONTHS.map((m) => {
                  const coord = {
                    category: "ADMIN_INPUT" as const,
                    bucketId: null,
                    rowId: null,
                    month: m,
                  };
                  return (
                    <EditableCell
                      key={m}
                      value={grid.data.actuals[m] ?? 0}
                      onChange={(v) => grid.setCellValue(coord, v)}
                      reference={
                        comparing ? grid.referenceData!.actuals[m] ?? 0 : null
                      }
                      dirty={grid.dirtyMap.has(buildCellKey(coord))}
                      readOnly={!grid.canEditActuals}
                    />
                  );
                })}
                <TotalCell
                  value={sumMonths(grid.data.actuals)}
                  reference={
                    comparing ? sumMonths(grid.referenceData!.actuals) : null
                  }
                  emphasis="bucket"
                />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function GridToolbar({
  config,
  grid,
}: {
  config: AxisConfig;
  grid: UseForecasterGridResult;
}) {
  const [addingBucket, setAddingBucket] = useState(false);
  const [bucketName, setBucketName] = useState("");

  function submitBucket() {
    const name = bucketName.trim();
    if (name) grid.addBucket(name);
    setBucketName("");
    setAddingBucket(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left — lock badge (comparison selector now lives in the page context bar) */}
      <div className="flex items-center gap-2">
        {grid.locked && (
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
            <Lock size={12} />
            RFQ locked — read only
          </span>
        )}
      </div>

      {/* Droite — add bucket + discard/save */}
      <div className="flex items-center gap-2">
        {!grid.locked &&
          config.allowMultipleBuckets &&
          (addingBucket ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitBucket();
                  if (e.key === "Escape") setAddingBucket(false);
                }}
                placeholder={`${config.bucketLabel} name...`}
                className="w-44 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                onClick={submitBucket}
                className="px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingBucket(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <FolderPlus size={14} />
              Add {config.bucketLabel.toLowerCase()}
            </button>
          ))}

        {grid.hasChanges && (
          <button
            onClick={grid.discard}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            title="Discard unsaved changes"
          >
            <RotateCcw size={13} />
            Discard
          </button>
        )}

        <button
          onClick={grid.save}
          disabled={!grid.hasChanges || grid.saving || grid.locked}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
        >
          {grid.saving && <Loader2 size={14} className="animate-spin" />}
          Save
          {grid.hasChanges && (
            <span className="px-1.5 py-0.5 rounded-md bg-gray-900 text-yellow-400 text-[10px] font-bold">
              {grid.dirtyCount > 0 ? grid.dirtyCount : "•"}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Section bucket (header + rows + sous-total) ─────────────────────────────

function BucketSection({
  bucket,
  config,
  grid,
  comparing,
  readOnly,
}: {
  bucket: ForecastBucket;
  config: AxisConfig;
  grid: UseForecasterGridResult;
  comparing: boolean;
  readOnly: boolean;
}) {
  const [addingRow, setAddingRow] = useState(false);

  const bucketTotals = useMemo(() => monthTotals(bucket.rows), [bucket.rows]);
  const refBucket = comparing ? grid.findReferenceBucket(bucket.name) : null;
  const refBucketTotals = useMemo(
    () => (refBucket ? monthTotals(refBucket.rows) : null),
    [refBucket]
  );

  // Types encore disponibles dans ce bucket
  const availableTypes = config.allowDuplicateRowTypes
    ? config.rowTypeOptions
    : config.rowTypeOptions.filter(
        (o) => !bucket.rows.some((r) => r.rowType === o.value)
      );

  return (
    <>
      {/* Header du bucket */}
      <tr className="bg-gray-50/80 border-t border-gray-200">
        <td colSpan={14} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={bucket.name}
              disabled={readOnly}
              onChange={(e) => grid.renameBucket(bucket.bucketId, e.target.value)}
              className="font-semibold text-gray-900 text-sm bg-transparent border border-transparent rounded-md px-1.5 py-0.5 -ml-1.5
                hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white
                disabled:hover:border-transparent w-56"
            />

            {!readOnly && (
              <>
                {/* Add row */}
                {addingRow ? (
                  <div className="relative">
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          grid.addRow(bucket.bucketId, e.target.value);
                        }
                        setAddingRow(false);
                      }}
                      onBlur={() => setAddingRow(false)}
                      className="appearance-none pl-3 pr-8 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                    >
                      <option value="" disabled>
                        {config.rowTypeLabel}...
                      </option>
                      {availableTypes.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingRow(true)}
                    disabled={availableTypes.length === 0}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    <Plus size={12} />
                    {config.rowTypeLabel}
                  </button>
                )}

                {/* Delete bucket */}
                <button
                  onClick={() => grid.removeBucket(bucket.bucketId)}
                  className="ml-auto p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title={`Remove ${config.bucketLabel.toLowerCase()} (until saved)`}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Rows */}
      {bucket.rows.length === 0 ? (
        <tr>
          <td colSpan={14} className="px-8 py-2.5 text-xs text-gray-400 border-b border-gray-100">
            No {config.rowTypeLabel.toLowerCase()} yet — add one above.
          </td>
        </tr>
      ) : (
        bucket.rows.map((row) => {
          const refRow = comparing
            ? grid.findReferenceRow(bucket.name, row.rowType)
            : null;
          return (
            <tr key={row.rowId} className="group hover:bg-gray-50/60 transition-colors">
              <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                <div className="flex items-center gap-1.5 pl-2">
                  <span className="text-sm text-gray-700">{row.label}</span>
                  {!readOnly && (
                    <button
                      onClick={() => grid.removeRow(bucket.bucketId, row.rowId)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all"
                      title="Remove row (until saved)"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </td>
              {MONTHS.map((m) => {
                const coord = {
                  category: "BL_INPUT" as const,
                  bucketId: bucket.bucketId,
                  rowId: row.rowId,
                  month: m,
                };
                return (
                  <EditableCell
                    key={m}
                    value={row.months[m] ?? 0}
                    onChange={(v) => grid.setCellValue(coord, v)}
                    reference={comparing ? refRow?.months[m] ?? 0 : null}
                    dirty={grid.dirtyMap.has(buildCellKey(coord))}
                    readOnly={readOnly}
                  />
                );
              })}
              <TotalCell
                value={sumMonths(row.months)}
                reference={comparing ? sumMonths(refRow?.months ?? {}) : null}
                emphasis="row"
              />
            </tr>
          );
        })
      )}

      {/* Sous-total du bucket */}
      {bucket.rows.length > 1 && (
        <tr className="bg-gray-50/60">
          <td className="sticky left-0 z-10 bg-gray-50/60 px-4 py-1.5 border-b border-gray-100 pl-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Subtotal
          </td>
          {MONTHS.map((m) => (
            <TotalCell
              key={m}
              value={bucketTotals[m] ?? 0}
              reference={comparing ? refBucketTotals?.[m] ?? 0 : null}
              emphasis="bucket"
            />
          ))}
          <TotalCell
            value={sumMonths(bucketTotals)}
            reference={comparing ? sumMonths(refBucketTotals ?? {}) : null}
            emphasis="bucket"
          />
        </tr>
      )}
    </>
  );
}