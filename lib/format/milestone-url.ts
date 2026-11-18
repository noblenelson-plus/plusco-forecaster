// lib/format/milestone-url.ts

/**
 * Milestones page view ↔ URL query string, so a view can be shared as a link
 * ("Andrew Butts · RFQ3 · flags to justify"). Pure: `parseMilestoneView` reads
 * a query string (unknown values dropped), `buildMilestoneQuery` writes one
 * (empty filters omitted, stable key order).
 *
 *   ?year=2026&checkpoint=rfq3&gm=…&agency=…&region=…&bl=…
 *    &status=failed,not_validated&flagCategory=…&flag=…
 */

import { stepById } from "../constants/confirmation-steps";
import { FLAG_CATEGORIES, FLAG_TYPES } from "./flag-insights";
import { MILESTONE_STATUS_ORDER } from "./milestone-summary";
import type { RfqValidationStatus } from "../types/forecast-flags.types";

export interface MilestoneView {
  year?: number;
  checkpoint?: string;
  gm: string[];
  agency: string[];
  region: string[];
  bl: string[];
  status: RfqValidationStatus[];
  flagCategory: string[];
  flag: string[];
}

const list = (p: URLSearchParams, key: string): string[] =>
  (p.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const CATEGORY_IDS = new Set<string>(FLAG_CATEGORIES.map((c) => c.id));
const TYPE_IDS = new Set<string>(FLAG_TYPES.map((t) => t.id));
const STATUS_IDS = new Set<string>(MILESTONE_STATUS_ORDER);

export function parseMilestoneView(search: string): MilestoneView {
  const p = new URLSearchParams(search);
  const y = Number(p.get("year"));
  const cp = p.get("checkpoint") ?? "";
  return {
    year: Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : undefined,
    checkpoint: stepById(cp) ? cp : undefined,
    gm: list(p, "gm"),
    agency: list(p, "agency"),
    region: list(p, "region"),
    bl: list(p, "bl"),
    status: list(p, "status").filter((s) => STATUS_IDS.has(s)) as RfqValidationStatus[],
    flagCategory: list(p, "flagCategory").filter((s) => CATEGORY_IDS.has(s)),
    flag: list(p, "flag").filter((s) => TYPE_IDS.has(s)),
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
    ["status", v.status],
    ["flagCategory", v.flagCategory],
    ["flag", v.flag],
  ];
  for (const [k, values] of lists) if (values.length > 0) p.set(k, values.join(","));
  const q = p.toString();
  return q ? `?${q}` : "";
}
