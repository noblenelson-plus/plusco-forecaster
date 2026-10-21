// lib/format/media-to-labs.ts

/**
 * Pure planning for "Copy to Labs": ticked Media Spend BL lines → Labs BL
 * cells of the same submission.
 *
 * A Media line can only go to a Labs partner of its own media type: the year's
 * partners (admin → Labs) each carry exactly one `mediaType`, so an OOH line
 * may land on Billups-OOH but never on a Programmatic partner. A media type
 * with no partner that year is "not a Labs channel" — its lines are reported
 * and never copied. The user picks one partner per media type per copy.
 *
 * Each line is scaled by a share (100% = the full media amount) and routed:
 *   - "same":    to the Labs project with the Media line's project name
 *                (case/whitespace-insensitive), created when none matches;
 *   - "project": everything into one existing Labs project.
 *
 * The routing, summing and overwrite counting are delegated to the reference
 * copy planner (lib/format/reference-copy): a Media line is turned into a
 * reference leaf whose "campaign" is its project and whose "channel" is the
 * chosen partner id. Copied amounts REPLACE what Labs holds in the chosen
 * months — the grid's applyReferencePaste writes the plan in one undo step.
 *
 * Firebase-free: plain data in, plain plan out.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { AxisData, ForecastBucket, RowTypeOption } from "../types/forecaster.types";
import { MEDIA_TYPE_LABELS } from "../types/forecaster.types";
import type { LabsPartner } from "../types/labs.types";
import { planReferenceCopy, type CopyPlan, type ReferenceLeaf } from "./reference-copy";

/** One Media Spend BL line (project × media type), keyed by its rowId. */
export interface MediaLine {
  key: string;
  project: string;
  /** The Media row type (a MediaType value). */
  mediaType: string;
  label: string;
  months: MonthlyMap;
}

/** Every BL line of the Media working copy, keyed by rowId. */
export function mediaLines(data: AxisData): Map<string, MediaLine> {
  const out = new Map<string, MediaLine>();
  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      out.set(row.rowId, {
        key: row.rowId,
        project: bucket.name,
        mediaType: row.rowType,
        label: row.label,
        months: row.months,
      });
    }
  }
  return out;
}

/** Display label of a media type (falls back to the raw value). */
export function mediaTypeLabel(mediaType: string): string {
  return MEDIA_TYPE_LABELS[mediaType as keyof typeof MEDIA_TYPE_LABELS] ?? mediaType;
}

/** One media type among the ticked lines, with the partners it may go to. */
export interface MediaTypeGroup {
  mediaType: string;
  label: string;
  lines: MediaLine[];
  /** The year's Labs partners of this media type (empty → not a Labs channel). */
  partners: LabsPartner[];
}

/**
 * Groups the ticked lines by media type, in the Media type order of the lines,
 * each with its candidate partners (sorted by name). `partners` must already be
 * limited to the submission's year.
 */
export function groupByMediaType(lines: MediaLine[], partners: LabsPartner[]): MediaTypeGroup[] {
  const groups = new Map<string, MediaTypeGroup>();
  for (const line of lines) {
    let g = groups.get(line.mediaType);
    if (!g) {
      g = {
        mediaType: line.mediaType,
        label: mediaTypeLabel(line.mediaType),
        lines: [],
        partners: partners
          .filter((p) => p.mediaType === line.mediaType)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
      groups.set(line.mediaType, g);
    }
    g.lines.push(line);
  }
  return [...groups.values()];
}

export type LabsDestination =
  | { kind: "same" }
  | { kind: "project"; bucketId: string };

export interface MediaToLabsPlan extends CopyPlan {
  /** Media type labels with no Labs partner this year (lines not copied). */
  notLabs: string[];
  /** Number of ticked lines that will not be copied for that reason. */
  notLabsLines: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function planMediaToLabs({
  groups,
  partnerFor,
  sharePct,
  months,
  destination,
  buckets,
  rowTypeOptions,
}: {
  groups: MediaTypeGroup[];
  /** Chosen partner id per media type. */
  partnerFor: Record<string, string | undefined>;
  /** Share of each Media amount copied, in percent (100 = all of it). */
  sharePct: number;
  /** Months to write (already limited to the ones the user may edit in Labs). */
  months: number[];
  destination: LabsDestination;
  /** The Labs working copy's projects. */
  buckets: ForecastBucket[];
  /** The Labs axis row types (the year's partners). */
  rowTypeOptions: RowTypeOption[];
}): MediaToLabsPlan {
  const notLabs: string[] = [];
  let notLabsLines = 0;
  const leaves: ReferenceLeaf[] = [];
  const factor = Math.max(0, sharePct) / 100;

  for (const g of groups) {
    const partner = g.partners.find((p) => p.partnerId === partnerFor[g.mediaType]);
    if (!partner) {
      if (g.partners.length === 0) {
        notLabs.push(g.label);
        notLabsLines += g.lines.length;
      }
      continue;
    }
    for (const line of g.lines) {
      const scaled: MonthlyMap = {};
      for (const m of MONTHS) {
        const v = line.months[m];
        if (v) scaled[m] = round2(v * factor);
      }
      leaves.push({
        key: line.key,
        campaign: line.project,
        channel: partner.partnerId,
        channelLabel: partner.name,
        months: scaled,
      });
    }
  }

  const plan = planReferenceCopy({
    leaves,
    months,
    destination: destination.kind === "same" ? { kind: "split" } : destination,
    buckets,
    rowTypeOptions,
  });
  return { ...plan, notLabs, notLabsLines };
}
