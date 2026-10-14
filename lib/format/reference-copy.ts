// lib/format/reference-copy.ts

/**
 * Pure planning for the structured "Copy to my submission" flow: ticked rows of
 * a reference strip (MediaBox or MediaOcean) → BL cells of the submission.
 *
 * The selection is a list of LEAVES — one (channel × campaign) atom each, with
 * its 12-month values. A plan resolves every leaf's channel to a BL row type,
 * routes it to a destination project, sums leaves landing on the same
 * (project, row type, month), and counts what would be overwritten — so the
 * dialog can show the exact outcome before anything is written. The grid's
 * `applyReferencePaste` then writes the plan in one undoable step.
 *
 * Two destinations:
 *   - "project": everything goes into one existing project;
 *   - "split":   one project per campaign, matched to an existing project by
 *                name (case/whitespace-insensitive), created when none matches.
 *                Leaves without a campaign can't be routed and are reported.
 *
 * Only the chosen months are written; every other cell is left alone. Within a
 * chosen month a matched row type is SET (replace) — a 0 clears the cell.
 *
 * Firebase-free: plain data in, plain plan out.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { ForecastBucket, RowTypeOption } from "../types/forecaster.types";
import { isSkippedChannel, resolveRowType } from "./mediabox-paste";
import { NO_CAMPAIGN, buildMediaOceanPivot } from "./mediaocean-pivot";
import type { ForecastRow } from "../types/forecaster.types";

/** Stable key of one (channel × campaign) atom of a reference strip. */
export function leafKey(channel: string, campaign: string): string {
  return JSON.stringify([channel, campaign]);
}

/**
 * Keys of the read-only reference rows in the grid's cell-selection model —
 * shared by the grid (which orders them) and the strips (which render them).
 * Prefixed so they never collide with BL / actuals row ids.
 */
export const referenceRowKey = {
  /** MediaBox group row, or its child at `childIndex`. */
  mediabox: (groupKey: string, childIndex?: number) =>
    JSON.stringify(["mb", groupKey, childIndex ?? null]),
  /** MediaOcean campaign-view row, or its channel child. */
  mediaocean: (campaignKey: string, channelKey?: string) =>
    JSON.stringify(["mo", campaignKey, channelKey ?? null]),
  /** Another year's MediaOcean row (reference-year peek). */
  otherYear: (rowId: string) => JSON.stringify(["ref", rowId]),
};

/**
 * Placeholder campaign names the two sources use for spend with no campaign:
 * MediaOcean's NO_CAMPAIGN and MediaBox's "(No campaign)" (NO_CAMPAIGN_LABEL in
 * mediabox-totals-service, not imported here to keep this module Firebase-free).
 */
const NO_CAMPAIGN_NAMES = new Set([NO_CAMPAIGN, "(No campaign)"]);

/** True for the "no campaign" bucket of either source. */
export function isNoCampaign(name: string): boolean {
  return NO_CAMPAIGN_NAMES.has(name);
}

/** Display order of the reference strips: as delivered, or by name. */
export type ReferenceSort = "default" | "asc" | "desc";

/**
 * Sorts reference rows by name (natural, case-insensitive: "Q2" before
 * "Q10"); "default" keeps the given order. The "no campaign" bucket always
 * stays last. View-only — reference data is never reordered in storage.
 */
export function sortReferenceRows<T>(rows: T[], label: (row: T) => string, dir: ReferenceSort): T[] {
  if (dir === "default") return rows;
  return [...rows].sort((a, b) => {
    const la = label(a);
    const lb = label(b);
    const na = isNoCampaign(la);
    const nb = isNoCampaign(lb);
    if (na !== nb) return na ? 1 : -1;
    const cmp = la.localeCompare(lb, undefined, { numeric: true, sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
}

/** Project names match case-insensitively, ignoring surrounding whitespace. */
export function sameBucketName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** One selectable (channel × campaign) atom of a reference strip. */
export interface ReferenceLeaf {
  key: string;
  campaign: string;
  /** Matched against the BL row types (a MediaBox label or a BL rowType). */
  channel: string;
  /** Display label of the channel / partner. */
  channelLabel: string;
  months: MonthlyMap;
}

/** Add `from` into `into` month by month (mutates `into`). */
function addMonths(into: MonthlyMap, from: MonthlyMap): void {
  for (const m of MONTHS) {
    const v = from[m];
    if (v) into[m] = (into[m] ?? 0) + v;
  }
}

/** Upsert a leaf into the catalog, summing when the atom repeats. */
function putLeaf(
  out: Map<string, ReferenceLeaf>,
  campaign: string,
  channel: string,
  channelLabel: string,
  months: MonthlyMap
): void {
  const key = leafKey(channel, campaign);
  const hit = out.get(key);
  if (hit) {
    addMonths(hit.months, months);
    return;
  }
  const own: MonthlyMap = {};
  addMonths(own, months);
  out.set(key, { key, campaign, channel, channelLabel, months: own });
}

/**
 * MediaBox leaves, keyed like the strip's checkboxes: one per (type label ×
 * campaign); a type with no campaign breakdown is one "(No campaign)" leaf.
 */
export function mediaboxLeaves(
  typeRows: {
    label: string;
    byMonth: MonthlyMap;
    campaigns: { name: string; byMonth: MonthlyMap }[];
  }[]
): Map<string, ReferenceLeaf> {
  const out = new Map<string, ReferenceLeaf>();
  for (const t of typeRows) {
    if (t.campaigns.length === 0) {
      putLeaf(out, "(No campaign)", t.label, t.label, t.byMonth);
      continue;
    }
    for (const c of t.campaigns) putLeaf(out, c.name, t.label, t.label, c.byMonth);
  }
  return out;
}

/**
 * MediaOcean leaves, keyed like the strip's checkboxes: the pivot's
 * (channel rowType × campaign) atoms. The channel is the actuals row's rowType,
 * which is already a BL row type — an exact match.
 */
export function mediaoceanLeaves(actuals: ForecastRow[]): Map<string, ReferenceLeaf> {
  const out = new Map<string, ReferenceLeaf>();
  for (const node of buildMediaOceanPivot(actuals).byCampaign) {
    for (const child of node.children) {
      putLeaf(out, node.key, child.channelRowType, child.label, child.months);
    }
  }
  return out;
}

/** Months (1–12) where at least one leaf carries a non-zero value. */
export function monthsWithData(leaves: ReferenceLeaf[]): number[] {
  return MONTHS.filter((m) => leaves.some((l) => (l.months[m] ?? 0) !== 0));
}

export type CopyDestination =
  | { kind: "project"; bucketId: string }
  | { kind: "split" };

/** One BL cell to set. */
export interface PlannedCell {
  rowType: string;
  label: string;
  month: number;
  value: number;
}

/** Everything that lands in one project. */
export interface PlannedProject {
  /** Existing project, or null when it will be created. */
  bucketId: string | null;
  name: string;
  /** Source campaigns routed here (split mode) — for the mapping preview. */
  campaigns: string[];
  cells: PlannedCell[];
}

export interface CopyPlan {
  projects: PlannedProject[];
  /** Cells set in total. */
  cellCount: number;
  /** Existing non-zero cells that will change (the overwrite warning). */
  overwrittenCells: number;
  /** Distinct (project, row type) rows holding those cells. */
  overwrittenRows: number;
  /** Channel labels that match no BL row type (not copied). */
  unmatched: string[];
  /** Catch-all channels skipped on purpose (e.g. "Other"). */
  skipped: string[];
  /** Split mode: leaves without a campaign (not copied). */
  noCampaignLeaves: number;
  /** Projects that will be created. */
  createdProjects: number;
}

/** Resolve a source channel to a BL row type option (shared matcher). */
function matchRowType(options: RowTypeOption[], channel: string): RowTypeOption | null {
  const value = resolveRowType(options, channel);
  return value ? options.find((o) => o.value === value) ?? null : null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function planReferenceCopy({
  leaves,
  months,
  destination,
  buckets,
  rowTypeOptions,
}: {
  leaves: ReferenceLeaf[];
  /** Months to write (already limited to the ones the user may edit). */
  months: number[];
  destination: CopyDestination;
  buckets: ForecastBucket[];
  rowTypeOptions: RowTypeOption[];
}): CopyPlan {
  const unmatched = new Set<string>();
  const skipped = new Set<string>();
  let noCampaignLeaves = 0;

  // Project key → { project, rowType → month → value }.
  const projects = new Map<
    string,
    { project: PlannedProject; sums: Map<string, { label: string; byMonth: MonthlyMap }> }
  >();

  const projectFor = (leaf: ReferenceLeaf) => {
    if (destination.kind === "project") {
      const bucket = buckets.find((b) => b.bucketId === destination.bucketId);
      if (!bucket) return null;
      return { key: bucket.bucketId, bucketId: bucket.bucketId, name: bucket.name };
    }
    const existing = buckets.find((b) => sameBucketName(b.name, leaf.campaign));
    return existing
      ? { key: existing.bucketId, bucketId: existing.bucketId, name: existing.name }
      : { key: `new:${leaf.campaign.trim().toLowerCase()}`, bucketId: null, name: leaf.campaign.trim() };
  };

  for (const leaf of leaves) {
    if (isSkippedChannel(leaf.channelLabel) || isSkippedChannel(leaf.channel)) {
      skipped.add(leaf.channelLabel);
      continue;
    }
    if (destination.kind === "split" && (isNoCampaign(leaf.campaign) || !leaf.campaign.trim())) {
      noCampaignLeaves++;
      continue;
    }
    const option = matchRowType(rowTypeOptions, leaf.channel);
    if (!option) {
      unmatched.add(leaf.channelLabel);
      continue;
    }
    const target = projectFor(leaf);
    if (!target) continue;

    let entry = projects.get(target.key);
    if (!entry) {
      entry = {
        project: { bucketId: target.bucketId, name: target.name, campaigns: [], cells: [] },
        sums: new Map(),
      };
      projects.set(target.key, entry);
    }
    if (!entry.project.campaigns.includes(leaf.campaign)) {
      entry.project.campaigns.push(leaf.campaign);
    }
    let sum = entry.sums.get(option.value);
    if (!sum) {
      sum = { label: option.label, byMonth: {} };
      entry.sums.set(option.value, sum);
    }
    addMonths(sum.byMonth, leaf.months);
  }

  // Materialize the cells and count what they overwrite.
  let cellCount = 0;
  let overwrittenCells = 0;
  let overwrittenRows = 0;
  let createdProjects = 0;
  const result: PlannedProject[] = [];

  for (const { project, sums } of projects.values()) {
    const bucket = project.bucketId
      ? buckets.find((b) => b.bucketId === project.bucketId)
      : undefined;
    if (!bucket) createdProjects++;
    for (const [rowType, { label, byMonth }] of sums) {
      const existingRow = bucket?.rows.find((r) => r.rowType === rowType);
      let rowHit = false;
      for (const m of months) {
        const value = round2(byMonth[m] ?? 0);
        const current = existingRow?.months[m] ?? 0;
        // A zero on a row that doesn't exist yet is a no-op — skip it.
        if (value === 0 && current === 0) continue;
        project.cells.push({ rowType, label, month: m, value });
        cellCount++;
        if (current !== 0 && current !== value) {
          overwrittenCells++;
          rowHit = true;
        }
      }
      if (rowHit) overwrittenRows++;
    }
    if (project.cells.length > 0) result.push(project);
    else if (!bucket) createdProjects--; // nothing would land — don't create it
  }

  return {
    projects: result,
    cellCount,
    overwrittenCells,
    overwrittenRows,
    unmatched: [...unmatched],
    skipped: [...skipped],
    noCampaignLeaves,
    createdProjects,
  };
}
