// lib/format/milestone-url.ts

/**
 * Milestones page view ↔ URL query string, so a view can be shared as a link
 * ("Andrew Butts · RFQ3 · flags to justify"). Pure: `parseMilestoneView` reads
 * a query string (unknown values dropped), `buildMilestoneQuery` writes one
 * (empty filters omitted, stable key order).
 *
 *   ?year=2026&checkpoint=rfq3&gm=…&agency=…&region=…&bl=…&client=…
 *    &status=failed,not_validated&flagCategory=…&flag=…&on=…
 *
 * `status` is the Milestones by client table's status filter. Absent = the
 * default (DEFAULT_TABLE_STATUSES: the clients left to validate); "all" = no
 * status picked (every client).
 */

import { stepById } from "../constants/confirmation-steps";
import { FLAG_CATEGORIES, FLAG_TYPES, LEGACY_FLAG_TYPE_IDS } from "./flag-insights";
import { MILESTONE_STATUS_ORDER } from "./milestone-summary";
import type { RfqValidationStatus } from "../types/forecast-flags.types";

/** The Milestones by client table opens on the clients left to validate. */
export const DEFAULT_TABLE_STATUSES: RfqValidationStatus[] = ["failed", "not_validated"];

export interface MilestoneView {
  year?: number;
  checkpoint?: string;
  gm: string[];
  agency: string[];
  region: string[];
  bl: string[];
  client: string[];
  status: RfqValidationStatus[];
  flagCategory: string[];
  flag: string[];
  /** "On" filter: media types / partners / revenue (flagOnKey values). */
  on: string[];
}

const list = (p: URLSearchParams, key: string): string[] =>
  (p.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const CATEGORY_IDS = new Set<string>(FLAG_CATEGORIES.map((c) => c.id));
const TYPE_IDS = new Set<string>(FLAG_TYPES.map((t) => t.id));
const STATUS_IDS = new Set<string>(MILESTONE_STATUS_ORDER);

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export function parseMilestoneView(search: string): MilestoneView {
  const p = new URLSearchParams(search);
  const y = Number(p.get("year"));
  const cp = p.get("checkpoint") ?? "";
  const rawStatus = p.get("status");
  return {
    year: Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : undefined,
    checkpoint: stepById(cp) ? cp : undefined,
    gm: list(p, "gm"),
    agency: list(p, "agency"),
    region: list(p, "region"),
    bl: list(p, "bl"),
    client: list(p, "client"),
    status:
      rawStatus === null
        ? [...DEFAULT_TABLE_STATUSES]
        : (list(p, "status").filter((s) => STATUS_IDS.has(s)) as RfqValidationStatus[]),
    flagCategory: list(p, "flagCategory").filter((s) => CATEGORY_IDS.has(s)),
    // Old links may carry a flag type id that was split since (under_forecasting).
    flag: [...new Set(list(p, "flag").flatMap((s) => LEGACY_FLAG_TYPE_IDS[s] ?? [s]))].filter((s) =>
      TYPE_IDS.has(s)
    ),
    on: list(p, "on"),
  };
}

export function buildMilestoneQuery(v: MilestoneView): string {
  const p = new URLSearchParams();
  if (v.year) p.set("year", String(v.year));
  if (v.checkpoint) p.set("checkpoint", v.checkpoint);
  const lists: [string, string[]][] = [
    ["gm", v.gm],
    ["agency", v.agency],
    ["region", v.region],
    ["bl", v.bl],
    ["client", v.client],
    ["flagCategory", v.flagCategory],
    ["flag", v.flag],
    ["on", v.on],
  ];
  for (const [k, values] of lists) if (values.length > 0) p.set(k, values.join(","));
  if (v.status.length === 0) p.set("status", "all");
  else if (!sameSet(v.status, DEFAULT_TABLE_STATUSES)) p.set("status", v.status.join(","));
  const q = p.toString();
  return q ? `?${q}` : "";
}
