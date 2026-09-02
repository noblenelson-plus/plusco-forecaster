// lib/format/mediaocean-pivot.ts

/**
 * Pivots the MediaOcean (pink) reference strip between its two orientations, the
 * same way the MediaBox (blue) strip pivots Campaign ↔ Channel.
 *
 * The source is the grid's `data.actuals` rows: one row per media channel, each
 * optionally carrying `details` (breakdown lines). A detail line's campaign name
 * lives in its first free-text level (`levels[0]`); levels 1–2 (product,
 * estimate) are ignored here. When a channel has detail lines the grid keeps its
 * total in sync as Σ details, so pivoting on the details reconciles back to the
 * channel totals.
 *
 * Two rules keep the campaign view's grand total equal to the channel view's:
 *   - a detail line with an empty campaign name is grouped under NO_CAMPAIGN;
 *   - a channel with NO detail lines contributes its own total under NO_CAMPAIGN
 *     (so channels that were never broken into campaigns are still counted, not
 *     silently dropped).
 *
 * Pure and Firebase-free. The copy-to-BL mapping itself lives in the paste layer
 * (bl-paste-target / mediabox-paste); this module only reshapes the numbers.
 */

import type { ForecastRow } from "../types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../types/common.types";

/** Bucket label for spend with no campaign name (empty level-0, or a channel
 *  with no detail lines). */
export const NO_CAMPAIGN = "— No campaign —";

/** Detail level that holds the campaign name (level 1 = product, 2 = estimate). */
const CAMPAIGN_LEVEL = 0;

/** Add every month of `from` into `into` (mutates `into`). */
function addMonths(into: MonthlyMap, from: MonthlyMap | undefined): void {
  if (!from) return;
  for (const m of MONTHS) {
    const v = from[m];
    if (v != null) into[m] = (into[m] ?? 0) + v;
  }
}

/** Σ of a monthly map. */
export function sumMonths(m: MonthlyMap | undefined): number {
  if (!m) return 0;
  return MONTHS.reduce((acc, mo) => acc + (m[mo] ?? 0), 0);
}

/** A child line under a pivot node (a campaign under a channel, or vice versa). */
export interface PivotChild {
  /** Stable key within its parent (the channel rowType, or the campaign name). */
  key: string;
  /** Display label (channel label, or campaign name). */
  label: string;
  /** The channel's BL rowType value — carried on BOTH orientations so the
   *  copy-to-BL step can map to the right media type regardless of view. */
  channelRowType: string;
  months: MonthlyMap;
}

/** A pivot group: a parent (channel or campaign) and its children. */
export interface PivotNode {
  key: string;
  label: string;
  months: MonthlyMap;
  children: PivotChild[];
}

export interface MediaOceanPivot {
  /** Channel → campaigns (the default, matches the current strip). */
  byChannel: PivotNode[];
  /** Campaign → channels (the inverted view; also what "Copy all to BL" uses). */
  byCampaign: PivotNode[];
  /** Grand total across everything (equal in both orientations). */
  grand: MonthlyMap;
  /** True when at least one channel carries detail (campaign) lines. */
  hasCampaigns: boolean;
}

/** One (campaign × channel) cell — the atom both orientations are built from. */
interface Leaf {
  campaign: string;
  channelRowType: string;
  channelLabel: string;
  months: MonthlyMap;
}

function campaignName(levels: string[] | undefined): string {
  const raw = (levels?.[CAMPAIGN_LEVEL] ?? "").trim();
  return raw === "" ? NO_CAMPAIGN : raw;
}

/**
 * Flatten the channel rows into (campaign × channel) leaves. Detailed channels
 * contribute one leaf per detail line (summed later where a campaign repeats in
 * a channel); detail-less channels contribute a single NO_CAMPAIGN leaf from
 * their own months, so nothing is dropped from the campaign view.
 */
function toLeaves(channelRows: ForecastRow[]): Leaf[] {
  const leaves: Leaf[] = [];
  for (const row of channelRows) {
    const details = row.details ?? [];
    if (details.length === 0) {
      leaves.push({
        campaign: NO_CAMPAIGN,
        channelRowType: row.rowType,
        channelLabel: row.label,
        months: { ...row.months },
      });
      continue;
    }
    for (const d of details) {
      leaves.push({
        campaign: campaignName(d.levels),
        channelRowType: row.rowType,
        channelLabel: row.label,
        months: { ...d.months },
      });
    }
  }
  return leaves;
}

/**
 * Group leaves by a chosen dimension into parent nodes, merging children that
 * share the same child key (e.g. the same campaign appearing twice in a channel)
 * by summing their months.
 */
function group(
  leaves: Leaf[],
  parentKey: (l: Leaf) => string,
  parentLabel: (l: Leaf) => string,
  childKey: (l: Leaf) => string,
  childLabel: (l: Leaf) => string
): PivotNode[] {
  const nodes = new Map<string, PivotNode>();
  // Per parent: childKey → child (so repeats merge instead of duplicating).
  const childIndex = new Map<string, Map<string, PivotChild>>();

  for (const l of leaves) {
    const pKey = parentKey(l);
    let node = nodes.get(pKey);
    if (!node) {
      node = { key: pKey, label: parentLabel(l), months: {}, children: [] };
      nodes.set(pKey, node);
      childIndex.set(pKey, new Map());
    }
    addMonths(node.months, l.months);

    const children = childIndex.get(pKey)!;
    const cKey = childKey(l);
    let child = children.get(cKey);
    if (!child) {
      child = {
        key: cKey,
        label: childLabel(l),
        channelRowType: l.channelRowType,
        months: {},
      };
      children.set(cKey, child);
      node.children.push(child);
    }
    addMonths(child.months, l.months);
  }

  return [...nodes.values()];
}

/**
 * NO_CAMPAIGN always sorts last; everything else by descending annual total so
 * the biggest campaigns/channels lead (matches the dashboard's ordering habit).
 */
function sortNodes(nodes: PivotNode[]): PivotNode[] {
  return [...nodes].sort((a, b) => {
    if (a.label === NO_CAMPAIGN) return 1;
    if (b.label === NO_CAMPAIGN) return -1;
    return sumMonths(b.months) - sumMonths(a.months);
  });
}

export function buildMediaOceanPivot(channelRows: ForecastRow[]): MediaOceanPivot {
  const leaves = toLeaves(channelRows);

  const byChannel = group(
    leaves,
    (l) => l.channelRowType,
    (l) => l.channelLabel,
    (l) => l.campaign,
    (l) => l.campaign
  );
  const byCampaign = group(
    leaves,
    (l) => l.campaign,
    (l) => l.campaign,
    (l) => l.channelRowType,
    (l) => l.channelLabel
  );

  const grand: MonthlyMap = {};
  for (const l of leaves) addMonths(grand, l.months);

  const hasCampaigns = channelRows.some((r) => (r.details?.length ?? 0) > 0);

  // Channels keep their natural order; campaigns sort biggest-first (NO_CAMPAIGN last).
  return {
    byChannel,
    byCampaign: sortNodes(byCampaign),
    grand,
    hasCampaigns,
  };
}