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
  | "under_forecasting"
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
  /** How to read the $ (what "up" and "down" mean for this type). */
  amountNote: string;
}

const k = (n: number) => `$${Math.round(n / 1000)}K`;

export const FLAG_TYPES: FlagTypeDef[] = [
  {
    id: "labs_error",
    category: "forecast_qa",
    label: "Labs error",
    threshold: "Labs forecast above the media forecast of its media type (full year) — must be corrected, can't be justified",
    amountNote: "Labs above media",
  },
  {
    id: "under_forecasting",
    category: "forecast_qa",
    label: "Under-forecasting",
    threshold: `MediaOcean bookings ${k(BL_MEDIAOCEAN_THRESHOLD)}+ above the BL forecast (full year), per media type / Labs partner`,
    amountNote: "Booked above forecast",
  },
  {
    id: "swing_revenue",
    category: "rfq_swings",
    label: "RFQ swing — Revenues",
    threshold: `Annual revenue ±${k(REVENUE_SWING_THRESHOLD)} vs the previous RFQ`,
    amountNote: "vs previous RFQ",
  },
  {
    id: "swing_media",
    category: "rfq_swings",
    label: "RFQ swing — Media",
    threshold: `Annual media ±${k(MEDIA_LABS_SWING_THRESHOLD)} vs the previous RFQ, per media type`,
    amountNote: "vs previous RFQ",
  },
  {
    id: "swing_labs",
    category: "rfq_swings",
    label: "RFQ swing — Labs",
    threshold: `Annual Labs ±${k(MEDIA_LABS_SWING_THRESHOLD)} vs the previous RFQ, per partner`,
    amountNote: "vs previous RFQ",
  },
  {
    id: "pacing_labs",
    category: "pacing",
    label: "Labs pacing YTD",
    threshold: `Booked ${Math.round(UNDER_TARGET_RELATIVE * 100)}% or ${k(UNDER_TARGET_ABSOLUTE)}+ under the forecast over the milestone's months, per partner`,
    amountNote: "Booked vs forecast",
  },
  {
    id: "pacing_media",
    category: "pacing",
    label: "Media pacing YTD",
    threshold: `Booked ${Math.round(UNDER_TARGET_RELATIVE * 100)}% or ${k(UNDER_TARGET_ABSOLUTE)}+ under the forecast over the milestone's months, per media type`,
    amountNote: "Booked vs forecast",
  },
];

/**
 * Every persisted flag rule → its report flag type. A Record over FlagRuleId,
 * so adding a rule to the engine without placing it here fails the build
 * instead of silently dropping its flags from the Milestones page.
 */
export const FLAG_TYPE_BY_RULE: Record<FlagRuleId, FlagTypeId> = {
  "labs-over-media": "labs_error",
  "mediaocean-over-media": "under_forecasting",
  "mediaocean-over-labs": "under_forecasting",
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

export interface FlagTypeStats {
  type: FlagTypeDef;
  /** Group label ("Total PlusCo" when not grouped). */
  group: string;
  flags: number;
  clients: number;
  /** Clients in scope in this group (flagged or not) — the base for "% of clients". */
  groupClients: number;
  /** Sum of positive deltas, CAD. */
  up: number;
  /** Sum of negative deltas, CAD (≤ 0). */
  down: number;
  net: number;
  justified: number;
  /** Justification mix, most used first; unjustified flags last. */
  contexts: ContextShare[];
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
  const acc = new Map<string, FlagTypeStats & { clientSet: Set<string>; ctx: Map<string, number> }>();

  for (const c of clients) {
    const group = groupOf(c, by);
    for (const f of c.flags) {
      const type = flagTypeOf(f);
      if (!type || !wanted.has(type.id)) continue;
      const key = `${group}\u0000${type.id}`;
      let s = acc.get(key);
      if (!s) {
        s = { type, group, flags: 0, clients: 0, groupClients: groupSize.get(group) ?? 0, up: 0, down: 0, net: 0, justified: 0, contexts: [], clientSet: new Set(), ctx: new Map() };
        acc.set(key, s);
      }
      const d = (f.delta ?? 0) * c.toCad;
      s.flags += 1;
      s.clientSet.add(c.clientId);
      if (d >= 0) s.up += d;
      else s.down += d;
      s.net += d;
      const ctx = f.justified && f.context ? f.context : "NOT_JUSTIFIED";
      if (ctx !== "NOT_JUSTIFIED") s.justified += 1;
      s.ctx.set(ctx, (s.ctx.get(ctx) ?? 0) + 1);
    }
  }

  const typeOrder = new Map(FLAG_TYPES.map((t, i) => [t.id, i]));
  return [...acc.values()]
    .map(({ clientSet, ctx, ...s }) => ({
      ...s,
      clients: clientSet.size,
      contexts: [...ctx.entries()]
        .map(([context, flags]) => ({
          context: context as ContextShare["context"],
          label:
            context === "NOT_JUSTIFIED"
              ? "Not justified"
              : FLAG_CONTEXTS.find((x) => x.value === context)?.label ?? context,
          flags,
        }))
        .sort(
          (a, b) =>
            Number(a.context === "NOT_JUSTIFIED") - Number(b.context === "NOT_JUSTIFIED") ||
            b.flags - a.flags
        ),
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
      label:
        context === "NOT_JUSTIFIED"
          ? "Not justified"
          : FLAG_CONTEXTS.find((x) => x.value === context)?.label ?? context,
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
