// lib/format/flag-insights.ts

/**
 * Milestones page — Section 2, "Insights by flag type": the 7 flag types of
 * Adriana's report (3 categories), how each maps onto the persisted flag rules,
 * and the roll-ups (flags, clients, $ up / down / net, justification mix),
 * overall or grouped by GM / Agency / Region. Pure and Firebase-free.
 *
 * Built on the flags saved at the checkpoint (flag_history: each client's last
 * validation of that milestone, kept in step with later justifications).
 * Amounts are each flag's `delta` converted to CAD.
 */

import { BL_MEDIAOCEAN_THRESHOLD } from "../flags/bl-alerts";
import {
  MEDIA_LABS_SWING_THRESHOLD,
  REVENUE_SWING_THRESHOLD,
} from "../flags/swing-rules";
import { UNDER_TARGET_ABSOLUTE, UNDER_TARGET_RELATIVE } from "../flags/under-target-rules";
import {
  FLAG_CONTEXTS,
  type FlagContext,
  type FlagRuleId,
  type StoredFlag,
} from "../types/forecast-flags.types";
import type { FlagSnapshot } from "../services/flag-history-service";

export type FlagCategoryId = "forecast_qa" | "rfq_swings" | "pacing";

export const FLAG_CATEGORIES: { id: FlagCategoryId; label: string }[] = [
  { id: "forecast_qa", label: "Forecast QA" },
  { id: "rfq_swings", label: "RFQ Swings" },
  { id: "pacing", label: "Pacing (booked vs forecasted)" },
];

export type FlagTypeId =
  | "labs_error"
  | "under_forecasting_media"
  | "under_forecasting_labs"
  | "swing_revenue"
  | "swing_media"
  | "swing_labs"
  | "pacing_labs"
  | "pacing_media";

export interface FlagTypeDef {
  id: FlagTypeId;
  category: FlagCategoryId;
  label: string;
  /** Threshold in words, for the header / footnote. */
  threshold: string;
  /**
   * How to read the amount, in plain words: what is subtracted from what and
   * what a + or − means. Shown under each category table ("How to read the
   * amounts").
   */
  amountNote: string;
  /** Media / Labs types: what the per-"On" breakdown lists (media types or partners). */
  breakdown?: "Media type" | "Partner";
}

const k = (n: number) => `$${Math.round(n / 1000)}K`;

export const FLAG_TYPES: FlagTypeDef[] = [
  {
    id: "labs_error",
    category: "forecast_qa",
    label: "Labs error",
    threshold: "Labs forecast above the media forecast of its media type (full year) — must be corrected, can't be justified",
    amountNote: "Labs forecast − media forecast of the media type. Always +: the Labs partners add up to more than the media type.",
  },
  {
    id: "under_forecasting_media",
    category: "forecast_qa",
    label: "Under-forecasting — Media",
    threshold: `MediaOcean bookings ${k(BL_MEDIAOCEAN_THRESHOLD)}+ above the BL forecast (full year), per media type`,
    amountNote: "MediaOcean bookings − BL forecast. Always +: more is booked than forecast, so the forecast is too low (under-forecast).",
    breakdown: "Media type",
  },
  {
    id: "under_forecasting_labs",
    category: "forecast_qa",
    label: "Under-forecasting — Labs",
    threshold: `MediaOcean bookings ${k(BL_MEDIAOCEAN_THRESHOLD)}+ above the BL forecast (full year), per Labs partner`,
    amountNote: "MediaOcean bookings − BL forecast. Always +: more is booked with the partner than forecast, so the forecast is too low (under-forecast).",
    breakdown: "Partner",
  },
  {
    id: "swing_revenue",
    category: "rfq_swings",
    label: "RFQ swing — Revenues",
    threshold: `Annual revenue ±${k(REVENUE_SWING_THRESHOLD)} vs the previous RFQ`,
    amountNote: "This RFQ − previous RFQ. + = forecast went up, − = forecast went down.",
  },
  {
    id: "swing_media",
    category: "rfq_swings",
    label: "RFQ swing — Media",
    threshold: `Annual media ±${k(MEDIA_LABS_SWING_THRESHOLD)} vs the previous RFQ, per media type`,
    amountNote: "This RFQ − previous RFQ. + = forecast went up, − = forecast went down.",
    breakdown: "Media type",
  },
  {
    id: "swing_labs",
    category: "rfq_swings",
    label: "RFQ swing — Labs",
    threshold: `Annual Labs ±${k(MEDIA_LABS_SWING_THRESHOLD)} vs the previous RFQ, per partner`,
    amountNote: "This RFQ − previous RFQ. + = forecast went up, − = forecast went down.",
    breakdown: "Partner",
  },
  {
    id: "pacing_labs",
    category: "pacing",
    label: "Labs pacing YTD",
    threshold: `Booked ${Math.round(UNDER_TARGET_RELATIVE * 100)}% or ${k(UNDER_TARGET_ABSOLUTE)}+ under the forecast over the milestone's months, per partner`,
    amountNote: "MediaOcean bookings − BL forecast over the milestone's months. Always −: less is booked than forecast so far.",
    breakdown: "Partner",
  },
  {
    id: "pacing_media",
    category: "pacing",
    label: "Media pacing YTD",
    threshold: `Booked ${Math.round(UNDER_TARGET_RELATIVE * 100)}% or ${k(UNDER_TARGET_ABSOLUTE)}+ under the forecast over the milestone's months, per media type`,
    amountNote: "MediaOcean bookings − BL forecast over the milestone's months. Always −: less is booked than forecast so far.",
    breakdown: "Media type",
  },
];

/** Flag type ids before Under-forecasting was split into Media / Labs (old links). */
export const LEGACY_FLAG_TYPE_IDS: Record<string, FlagTypeId[]> = {
  under_forecasting: ["under_forecasting_media", "under_forecasting_labs"],
};

/**
 * Every persisted flag rule → its report flag type. A Record over FlagRuleId,
 * so adding a rule to the engine without placing it here fails the build
 * instead of silently dropping its flags from the Milestones page.
 */
export const FLAG_TYPE_BY_RULE: Record<FlagRuleId, FlagTypeId> = {
  "labs-over-media": "labs_error",
  "mediaocean-over-media": "under_forecasting_media",
  "mediaocean-over-labs": "under_forecasting_labs",
  "revenue-swing": "swing_revenue",
  "media-swing": "swing_media",
  "labs-swing": "swing_labs",
  "labs-under-target": "pacing_labs",
  "media-under-target": "pacing_media",
};

const TYPE_BY_ID = new Map<FlagTypeId, FlagTypeDef>(FLAG_TYPES.map((t) => [t.id, t]));

/** The report flag type of a stored flag (undefined for an unknown rule). */
export function flagTypeOf(flag: Pick<StoredFlag, "ruleId">): FlagTypeDef | undefined {
  const id = FLAG_TYPE_BY_RULE[flag.ruleId];
  return id ? TYPE_BY_ID.get(id) : undefined;
}

const LABS_RULES = new Set<FlagRuleId>(["mediaocean-over-labs", "labs-swing", "labs-under-target"]);

/**
 * What a flag is "on" — its media type, Labs partner, or annual revenue (the
 * "On" column of Flags by client). Labs partner titles drop their media type
 * ("Yahoo (Programmatic)" → "Yahoo"); flags stored before the per-media-type
 * split ("annual") read "Full year".
 */
export function flagOnLabel(flag: Pick<StoredFlag, "ruleId" | "subject" | "title">): string {
  if (flag.ruleId === "revenue-swing") return "Annual revenue";
  if (flag.subject === "annual") return "Full year";
  if (LABS_RULES.has(flag.ruleId)) return flag.title.replace(/\s*\([^)]*\)\s*$/, "");
  return flag.title;
}

type OnKind = "Media type" | "Partner" | "Revenue";

function onKindOf(flag: Pick<StoredFlag, "ruleId" | "axis">): OnKind {
  if (flag.ruleId === "revenue-swing" || flag.axis === "revenue") return "Revenue";
  return LABS_RULES.has(flag.ruleId) ? "Partner" : "Media type";
}

/** Stable key of a flag's "On" value — what the On filter selects. */
export function flagOnKey(flag: Pick<StoredFlag, "ruleId" | "subject" | "title" | "axis">): string {
  return `${onKindOf(flag)}:${flagOnLabel(flag)}`;
}

/**
 * The "On" filter options: every media type, partner and revenue line flagged
 * among the given clients (limited to `types`), media types first, then
 * partners, then revenue — each labelled with its kind.
 */
export function computeOnOptions(
  clients: { flags: StoredFlag[] }[],
  types: FlagTypeId[]
): { value: string; label: string }[] {
  const wanted = new Set(types);
  const seen = new Map<string, { kind: OnKind; name: string }>();
  for (const c of clients) {
    for (const f of c.flags) {
      const t = flagTypeOf(f);
      if (!t || !wanted.has(t.id)) continue;
      const key = flagOnKey(f);
      if (!seen.has(key)) seen.set(key, { kind: onKindOf(f), name: flagOnLabel(f) });
    }
  }
  const kindOrder: Record<OnKind, number> = { "Media type": 0, Partner: 1, Revenue: 2 };
  return [...seen.entries()]
    .sort(
      ([, a], [, b]) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name)
    )
    .map(([value, { kind, name }]) => ({ value, label: `${kind}: ${name}` }));
}

/** One client's flags for the checkpoint's RFQ, with what grouping needs. */
export interface ClientFlags {
  clientId: string;
  clientName: string;
  gm: string;
  agency: string;
  region: string;
  /** Office city (Toronto, Montreal…) — the "Agency-City" view. */
  office?: string;
  /** Business Lead display name (Section 3). */
  bl?: string;
  /** Client currency — amounts are stored in it (Section 3 shows them as is). */
  currency?: string;
  /** The client's flag history for the year (stepId → snapshot) — Section 3's "previous justification". */
  history?: Record<string, FlagSnapshot>;
  /** Multiplier to CAD (1 for CAD clients, the year's USD→CAD rate for USD). */
  toCad: number;
  flags: StoredFlag[];
}

export type GroupBy = "total" | "gm" | "agency" | "agencyCity";

export const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: "total", label: "Total PlusCo" },
  { id: "gm", label: "GM" },
  { id: "agency", label: "Agency" },
  { id: "agencyCity", label: "Agency-City" },
];

export interface ContextShare {
  context: FlagContext | "NOT_JUSTIFIED";
  label: string;
  flags: number;
}

/** The numbers of one row: a flag type, or one media type / partner under it. */
export interface FlagRowStats {
  flags: number;
  clients: number;
  /** Sum of positive deltas, CAD. */
  up: number;
  /** Sum of negative deltas, CAD (≤ 0). */
  down: number;
  net: number;
  justified: number;
  /** Justification mix, most used first; unjustified flags last. */
  contexts: ContextShare[];
}

/** One media type / partner under a Media or Labs flag type row. */
export interface FlagOnStats extends FlagRowStats {
  /** Media type or partner name. */
  label: string;
}

export interface FlagTypeStats extends FlagRowStats {
  type: FlagTypeDef;
  /** Group label ("Total PlusCo" when not grouped). */
  group: string;
  /** Clients in scope in this group (flagged or not) — the base for "% of clients". */
  groupClients: number;
  /** Media / Labs types: the same numbers per media type or partner, largest net gap first. */
  byOn: FlagOnStats[];
}

/** Running totals of one row while flags are added. */
interface RowAcc {
  flags: number;
  clientSet: Set<string>;
  up: number;
  down: number;
  net: number;
  justified: number;
  ctx: Map<string, number>;
}

const newRowAcc = (): RowAcc => ({ flags: 0, clientSet: new Set(), up: 0, down: 0, net: 0, justified: 0, ctx: new Map() });

function addToRow(r: RowAcc, clientId: string, delta: number, ctx: string) {
  r.flags += 1;
  r.clientSet.add(clientId);
  if (delta >= 0) r.up += delta;
  else r.down += delta;
  r.net += delta;
  if (ctx !== "NOT_JUSTIFIED") r.justified += 1;
  r.ctx.set(ctx, (r.ctx.get(ctx) ?? 0) + 1);
}

const contextLabel = (context: string) =>
  context === "NOT_JUSTIFIED"
    ? "Not justified"
    : FLAG_CONTEXTS.find((x) => x.value === context)?.label ?? context;

function finishRow(r: RowAcc): FlagRowStats {
  return {
    flags: r.flags,
    clients: r.clientSet.size,
    up: r.up,
    down: r.down,
    net: r.net,
    justified: r.justified,
    contexts: [...r.ctx.entries()]
      .map(([context, flags]) => ({
        context: context as ContextShare["context"],
        label: contextLabel(context),
        flags,
      }))
      .sort(
        (a, b) =>
          Number(a.context === "NOT_JUSTIFIED") - Number(b.context === "NOT_JUSTIFIED") ||
          b.flags - a.flags
      ),
  };
}

function groupOf(c: ClientFlags, by: GroupBy): string {
  if (by === "total") return "Total PlusCo";
  if (by === "agencyCity") return `${c.agency || "No agency"} – ${c.office || "No office"}`;
  const v = by === "gm" ? c.gm : c.agency;
  return v || "—";
}

/**
 * Per (group × flag type) roll-up over the given clients, limited to
 * `types`. Types with no flag in a group are omitted. Ordered by group, then
 * the FLAG_TYPES order.
 */
export function computeFlagInsights(
  clients: ClientFlags[],
  types: FlagTypeId[],
  by: GroupBy
): FlagTypeStats[] {
  const wanted = new Set(types);
  const groupSize = new Map<string, number>();
  for (const c of clients) {
    const g = groupOf(c, by);
    groupSize.set(g, (groupSize.get(g) ?? 0) + 1);
  }
  const acc = new Map<
    string,
    { type: FlagTypeDef; group: string; row: RowAcc; byOn: Map<string, RowAcc> }
  >();

  for (const c of clients) {
    const group = groupOf(c, by);
    for (const f of c.flags) {
      const type = flagTypeOf(f);
      if (!type || !wanted.has(type.id)) continue;
      const key = `${group}\u0000${type.id}`;
      let s = acc.get(key);
      if (!s) {
        s = { type, group, row: newRowAcc(), byOn: new Map() };
        acc.set(key, s);
      }
      const d = (f.delta ?? 0) * c.toCad;
      const ctx = f.justified && f.context ? f.context : "NOT_JUSTIFIED";
      addToRow(s.row, c.clientId, d, ctx);
      if (type.breakdown) {
        const on = flagOnLabel(f);
        let o = s.byOn.get(on);
        if (!o) {
          o = newRowAcc();
          s.byOn.set(on, o);
        }
        addToRow(o, c.clientId, d, ctx);
      }
    }
  }

  const typeOrder = new Map(FLAG_TYPES.map((t, i) => [t.id, i]));
  return [...acc.values()]
    .map((s) => ({
      type: s.type,
      group: s.group,
      groupClients: groupSize.get(s.group) ?? 0,
      ...finishRow(s.row),
      byOn: [...s.byOn.entries()]
        .map(([label, o]) => ({ label, ...finishRow(o) }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.label.localeCompare(b.label)),
    }))
    .sort(
      (a, b) =>
        (a.group === "—" ? 1 : 0) - (b.group === "—" ? 1 : 0) ||
        a.group.localeCompare(b.group) ||
        (typeOrder.get(a.type.id) ?? 0) - (typeOrder.get(b.type.id) ?? 0)
    );
}

/** Flag types a category selection + type selection resolve to (empty = all). */
export function resolveFlagTypes(categories: string[], typeIds: string[]): FlagTypeId[] {
  return FLAG_TYPES.filter(
    (t) =>
      (categories.length === 0 || categories.includes(t.category)) &&
      (typeIds.length === 0 || typeIds.includes(t.id))
  ).map((t) => t.id);
}

export interface ContextSummaryRow {
  context: ContextShare["context"];
  label: string;
  flags: number;
  /** Clients with at least one flag of this reason. */
  clients: number;
}

export interface ContextSummary {
  /** Flags in the category. */
  totalFlags: number;
  /** Clients with at least one flag in the category. */
  totalClients: number;
  /** Reasons, most used first; "Not justified" last. */
  rows: ContextSummaryRow[];
}

/**
 * Justification reasons across a set of flag types (one category): per reason,
 * the number of flags and of distinct clients ("% of clients due to Budget
 * Cuts" — Adriana's ask), over the given clients.
 */
export function computeContextSummary(clients: ClientFlags[], types: FlagTypeId[]): ContextSummary {
  const wanted = new Set(types);
  const flagsBy = new Map<string, number>();
  const clientsBy = new Map<string, Set<string>>();
  const flagged = new Set<string>();
  let totalFlags = 0;
  for (const c of clients) {
    for (const f of c.flags) {
      const t = flagTypeOf(f);
      if (!t || !wanted.has(t.id)) continue;
      const ctx = f.justified && f.context ? f.context : "NOT_JUSTIFIED";
      totalFlags += 1;
      flagged.add(c.clientId);
      flagsBy.set(ctx, (flagsBy.get(ctx) ?? 0) + 1);
      const set = clientsBy.get(ctx) ?? new Set<string>();
      set.add(c.clientId);
      clientsBy.set(ctx, set);
    }
  }
  const rows = [...flagsBy.entries()]
    .map(([context, flags]) => ({
      context: context as ContextShare["context"],
      label: contextLabel(context),
      flags,
      clients: clientsBy.get(context)?.size ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(a.context === "NOT_JUSTIFIED") - Number(b.context === "NOT_JUSTIFIED") ||
        b.flags - a.flags
    );
  return { totalFlags, totalClients: flagged.size, rows };
}
