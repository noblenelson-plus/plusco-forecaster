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
import { MONTHS, type MonthlyMap } from "../../lib/types/common.types";
import type { AxisConfig, ForecastBucket } from "../../lib/types/forecaster.types";
import type {
  UseForecasterGridResult,
  CampaignProjectPaste,
} from "../../lib/hooks/use-forecaster-grid";
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

/** Normalize a media-type label/code for matching (lowercase, alphanumerics only). */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A MediaBox campaign as the copy buttons hand it in: a name plus its channel
 * breakdown (each channel's label + 12-month CAD values). Structurally matches
 * the campaign groups the MediaBox section already builds.
 */
export interface CampaignCopySource {
  name: string;
  types: { label: string; byMonth: MonthlyMap }[];
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
  /** Copy one MediaBox campaign into BL submission as its own project. */
  pasteCampaign: (campaign: CampaignCopySource) => void;
  /** Copy every given MediaBox campaign into BL, each as its own project. */
  pasteCampaigns: (campaigns: CampaignCopySource[]) => void;
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

  // Copy MediaBox campaigns into BL submission, each as its own project. Maps
  // each channel's display label to a BL rowType code (normalized match against
  // config.rowTypeOptions); unmatched channels paste under their raw label and
  // are reported in the toast. Overwrite-by-name + fill happen in the grid.
  const pasteCampaigns = useCallback(
    (campaigns: CampaignCopySource[]) => {
      if (grid.locked || campaigns.length === 0) return;

      const lookup = new Map<string, { value: string; label: string }>();
      for (const o of config.rowTypeOptions) {
        lookup.set(normKey(o.value), { value: o.value, label: o.label });
        lookup.set(normKey(o.label), { value: o.value, label: o.label });
      }

      const unmatched = new Set<string>();
      const specs: CampaignProjectPaste[] = campaigns
        .filter((c) => c.name.trim() !== "")
        .map((c) => ({
          name: c.name,
          channels: c.types.map((t) => {
            const hit = lookup.get(normKey(t.label));
            if (!hit) unmatched.add(t.label);
            return {
              rowType: hit?.value ?? t.label,
              label: hit?.label ?? t.label,
              months: t.byMonth,
            };
          }),
        }));

      if (specs.length === 0) return;

      const { created, overwritten } = grid.pasteCampaignsAsProjects(specs);

      const parts: string[] = [
        specs.length === 1
          ? `Copied "${specs[0].name}" to BL`
          : `Copied ${specs.length} campaigns to BL`,
      ];
      const counts: string[] = [];
      if (created) counts.push(`${created} created`);
      if (overwritten) counts.push(`${overwritten} overwritten`);
      if (counts.length) parts.push(counts.join(", "));
      let kind: ForecastToastKind = "success";
      if (unmatched.size > 0) {
        parts.push(
          `${unmatched.size} channel${unmatched.size > 1 ? "s" : ""} unmatched`
        );
        kind = "warning";
      }
      parts.push("Save to keep");
      showForecastToast(parts.join(" · "), kind);
    },
    [grid, config.rowTypeOptions]
  );

  const pasteCampaign = useCallback(
    (campaign: CampaignCopySource) => pasteCampaigns([campaign]),
    [pasteCampaigns]
  );

  return {
    buckets,
    targetBucketId,
    setTargetBucketId: setChosen,
    targetName,
    canPaste,
    pasteMonth,
    pasteCampaign,
    pasteCampaigns,
  };
}

/**
 * Target-project selector for a source-section header. Renders nothing when the
 * axis has a single project (the target is then unambiguous — that lone bucket).
 */
export function TargetProjectSelect({ api }: { api: BlPasteApi }) {
  if (!api.canPaste) return null;
  if (api.buckets.length <= 1) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-900">
        <ClipboardPaste size={11} />
        <span className="normal-case">paste into {api.targetName}</span>
      </span>
    );
  }
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

/**
 * Copy button for a single MediaBox campaign row — copies that campaign into BL
 * submission as its own project. Hidden when pasting is unavailable (locked RFQ).
 */
export function CopyCampaignButton({
  api,
  campaign,
}: {
  api: BlPasteApi;
  campaign: CampaignCopySource;
}) {
  if (!api.canPaste) return null;
  return (
    <button
      type="button"
      onClick={() => api.pasteCampaign(campaign)}
      title={`Copy "${campaign.name}" to BL submission as its own project`}
      aria-label={`Copy ${campaign.name} to BL submission`}
      className="inline-flex items-center justify-center p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200"
    >
      <ClipboardPaste size={13} />
    </button>
  );
}

/**
 * "Copy all to BL" button for the MediaBox section header — copies every
 * campaign into BL submission, each as its own project. Hidden when pasting is
 * unavailable or there is nothing to copy.
 */
export function CopyAllCampaignsButton({
  api,
  campaigns,
}: {
  api: BlPasteApi;
  campaigns: CampaignCopySource[];
}) {
  if (!api.canPaste || campaigns.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => api.pasteCampaigns(campaigns)}
      title="Copy every campaign to BL submission, each as its own project"
      className="inline-flex items-center gap-1 border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-900 hover:bg-gray-100"
    >
      <ClipboardPaste size={11} />
      <span className="normal-case">Copy all to BL</span>
    </button>
  );
}