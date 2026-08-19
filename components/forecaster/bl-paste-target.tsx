// components/forecaster/bl-paste-target.tsx
"use client";

/**
 * "Paste a source month into the BL Input" — shared plumbing for the MediaBox
 * and MediaOcean sections of the forecast grid. A source month (its per-channel
 * / per-partner breakdown) is matched to the BL row types and *set* (replace)
 * onto the rows of one target project (bucket) for that month.
 *
 * The target project is a single selected bucket ("active bucket"): it defaults
 * to the project holding the most BL volume, and — only when the axis has more
 * than one project — a compact selector in each source-section header lets the
 * user retarget it. The per-month paste button lives in the section's total row.
 */

import { useCallback, useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { MONTHS } from "../../lib/types/common.types";
import type { AxisConfig, ForecastBucket } from "../../lib/types/forecaster.types";
import type { UseForecasterGridResult } from "../../lib/hooks/use-forecaster-grid";
import {
  buildMonthPaste,
  monthSourceTotal,
  type PasteSourceRow,
} from "../../lib/format/mediabox-paste";
import { showForecastToast, type ForecastToastKind } from "../../lib/format/toast";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Total BL volume of a bucket — drives the default target choice. */
function bucketVolume(bucket: ForecastBucket): number {
  return bucket.rows.reduce(
    (acc, r) => acc + MONTHS.reduce((s, m) => s + (r.months[m] ?? 0), 0),
    0
  );
}

export interface BlPasteApi {
  buckets: ForecastBucket[];
  targetBucketId: string | null;
  setTargetBucketId: (id: string) => void;
  targetName: string;
  /** True while a target exists and the RFQ isn't locked. */
  canPaste: boolean;
  /** Match `rows` for `month`, set the matched values into the target bucket. */
  pasteMonth: (rows: PasteSourceRow[], month: number, sourceLabel: string) => void;
}

export function useBlPasteTarget(
  grid: UseForecasterGridResult,
  config: AxisConfig
): BlPasteApi {
  const buckets = grid.data.buckets;
  const [chosen, setChosen] = useState<string | null>(null);

  // Default target = the project holding the most BL volume, else the first.
  const defaultBucketId = useMemo(() => {
    if (buckets.length === 0) return null;
    return buckets.reduce((best, b) =>
      bucketVolume(b) > bucketVolume(best) ? b : best
    ).bucketId;
  }, [buckets]);

  // Honour an explicit choice while it still exists; else fall back to default.
  const targetBucketId =
    chosen && buckets.some((b) => b.bucketId === chosen)
      ? chosen
      : defaultBucketId;
  const targetName =
    buckets.find((b) => b.bucketId === targetBucketId)?.name ?? "";

  const canPaste = !grid.locked && targetBucketId != null;

  const pasteMonth = useCallback(
    (rows: PasteSourceRow[], month: number, sourceLabel: string) => {
      if (grid.locked || targetBucketId == null) return;
      const { updates, matched, unmatched } = buildMonthPaste(
        rows,
        month,
        config.rowTypeOptions,
        targetBucketId
      );
      const monthLabel = MONTH_LABELS[month - 1];
      const typeNoun = config.rowTypeLabel.toLowerCase();
      if (matched.length === 0) {
        showForecastToast(
          `No matching ${typeNoun} for ${sourceLabel} ${monthLabel}`,
          "warning"
        );
        return;
      }
      grid.setCellsByType(updates);
      let kind: ForecastToastKind = "success";
      const parts = [
        `Pasted ${sourceLabel} ${monthLabel} → ${targetName}`,
        `${matched.length} ${typeNoun}${matched.length > 1 ? "s" : ""}`,
      ];
      if (unmatched.length > 0) {
        parts.push(`${unmatched.length} unmatched`);
        kind = "warning";
      }
      showForecastToast(parts.join(" · "), kind);
    },
    [grid, targetBucketId, targetName, config.rowTypeOptions, config.rowTypeLabel]
  );

  return {
    buckets,
    targetBucketId,
    setTargetBucketId: setChosen,
    targetName,
    canPaste,
    pasteMonth,
  };
}

/**
 * Target-project selector for a source-section header. Renders nothing when the
 * axis has a single project (the target is then unambiguous — that lone bucket).
 */
export function TargetProjectSelect({ api }: { api: BlPasteApi }) {
  if (api.buckets.length <= 1 || !api.canPaste) return null;
  return (
    <label className="flex items-center gap-1 text-[11px] font-medium text-gray-900">
      <ClipboardPaste size={11} />
      <span className="normal-case">paste into</span>
      <select
        value={api.targetBucketId ?? ""}
        onChange={(e) => api.setTargetBucketId(e.target.value)}
        className="max-w-[160px] truncate border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        {api.buckets.map((b) => (
          <option key={b.bucketId} value={b.bucketId}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Per-month paste button, placed inside a source-section total cell. Hidden when
 * the month has no source spend or pasting is unavailable; reveals on row hover
 * (the enclosing <tr> must carry the `group` class).
 */
export function MonthPasteButton({
  api,
  rows,
  month,
  sourceLabel,
  typeNoun,
}: {
  api: BlPasteApi;
  rows: PasteSourceRow[];
  month: number;
  sourceLabel: string;
  /** Row-type noun for the tooltip — e.g. "media type" / "partner". */
  typeNoun: string;
}) {
  if (!api.canPaste || monthSourceTotal(rows, month) === 0) return null;
  return (
    <button
      type="button"
      onClick={() => api.pasteMonth(rows, month, sourceLabel)}
      title={`Paste ${MONTH_LABELS[month - 1]} into ${api.targetName} — matches ${typeNoun}s`}
      aria-label={`Paste ${MONTH_LABELS[month - 1]} into the BL Input`}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center p-0.5 text-gray-600 hover:text-gray-900 hover:bg-gray-300"
    >
      <ClipboardPaste size={13} />
    </button>
  );
}
