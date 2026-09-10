// components/forecaster/sections/labs-target-vs-booked-data.ts

/**
 * Labs "Target vs Booked by Partner" — the exec-KPI table that mirrors the
 * senior-leadership deck screenshot. Pure compute (no React, no Firestore) so it
 * can be unit-reconciled against the sheet before any UI exists.
 *
 * Column → source (see the wiring hook in ./use-labs-target-vs-booked):
 *   A  Deal type            PartnerTarget.dealType         (partner_targets/{year})
 *   B  Included in RFQ       PartnerTarget.inLabsForecaster2
 *   C  Partner               PartnerTarget.partner
 *   D  PLUSCO Labs target    PartnerTarget.mediaSpendTarget
 *   E  RFQ2 Labs target      rfq2TargetByPartner  (pacing RFQ2-BL; forecaster-only → null)
 *   F  Booked to date (MIR)  bookedByPartner      (MediaOcean MIR, all partners)
 *   G  % of PLUSCO target    F / D
 *   H  % of RFQ target       F / E   (null → "–%" when E is absent)
 *   I  Total media (MIR)     computeTotalMediaInvestment(mirRows).grandTotal  (all channels except N/A)
 *   J  Labs share of media   Σ F (all rows) / I
 *   K  …(forecaster only)    Σ F (included rows) / I
 *
 * Roster + granularity:
 *   - The roster is the partner_targets rows, filtered to the chosen deal types.
 *     Default = the deck view (Labs + Labs - BRP).
 *   - Split admin partners are rolled up (Billups-OOH + Billups-Print → "Billups";
 *     MIQ-Prog + MIQ-Social → "MIQ"). D and E sum across the group.
 *   - Booked (F) is joined at the ROLLED-UP level using a canonical key
 *     (lowercase, strip spaces/punctuation, apply the roll-up). MIR aggregates
 *     these partners under a single, differently-spelled name (e.g. "billups",
 *     "sirius xm"), so a literal name match misses them; the canonical key makes
 *     the rolled-up group match MIR exactly once (no double-count).
 *   - Tiles J/K are computed from the rolled-up groups (all vs forecaster).
 */

import {
  computeTotalMediaInvestment,
  type MediaInvestmentRow,
} from "../../../lib/dashboard/data/use-mediaocean-investment-mix";
import {
  type DealType,
  type PartnerTarget,
} from "../../../lib/types/partner-targets.types";

// ─── Public shapes ────────────────────────────────────────────────────────────

/** One display row of the table (post roll-up). */
export interface LabsTargetVsBookedRow {
  /** Display partner name (roll-up applied). */
  partner: string;
  /** Deal type of the group (children share it; first child wins if mixed). */
  dealType: DealType;
  /** True only when every rolled-up child is in Labs Forecaster 2.0. */
  includedInRfq: boolean;
  /** D — Σ PLUSCO media-spend target across the group. */
  pluscoTarget: number;
  /** E — Σ RFQ2-BL target; null when no child has one (non-forecaster). */
  rfq2Target: number | null;
  /** F — booked-to-date (MIR) for the group. */
  booked: number;
  /** G — F / D; null when D = 0. */
  pctOfPlusco: number | null;
  /** H — F / E; null when E is null or 0 (renders "–%"). */
  pctOfRfq: number | null;
}

/** Grand-total row (across all displayed rows). */
export interface LabsTargetVsBookedTotals {
  pluscoTarget: number;
  rfq2Target: number | null;
  booked: number;
  pctOfPlusco: number | null;
  pctOfRfq: number | null;
}

/** The three headline tiles (I / J / K). */
export interface LabsShareTiles {
  /** I — total media (MIR), all channels except N/A. */
  totalMedia: number;
  /** J — Σ booked (all rows) / total media; null when total media = 0. */
  labsShareAll: number | null;
  /** K — Σ booked (forecaster rows) / total media; null when total media = 0. */
  labsShareForecaster: number | null;
}

export interface LabsTargetVsBookedResult {
  rows: LabsTargetVsBookedRow[];
  totals: LabsTargetVsBookedTotals;
  tiles: LabsShareTiles;
  /** QA: roster groups with no MIR booked match (rendered as $0 — investigate). */
  unmatchedTargets: string[];
  /** QA: MIR labs partners with booked but no roster group (excluded from table). */
  unmatchedMirPartners: string[];
}

export interface ComputeLabsTargetVsBookedParams {
  /** Partner rows from partner_targets/{year} (A–D + the flag). */
  targets: PartnerTarget[];
  /** F — labs booked per partner NAME (MediaOcean MIR), covers all partners. */
  bookedByPartner: Map<string, number>;
  /** E — RFQ2-BL labs target per partner NAME (pacing layer; forecaster-only). */
  rfq2TargetByPartner: Map<string, number>;
  /** I — MIR rows already filtered to the dashboard scope (year/months/pod/etc.). */
  mirRows: MediaInvestmentRow[];
  /** Which deal types to include; defaults to the deck view (Labs + Labs - BRP). */
  dealTypeFilter?: DealType[];
  /** Optional allow-list of display (post roll-up) partner names to keep. */
  partnerFilter?: string[];
  /** Roll-up map: raw target name → display name. Defaults to Billups/MIQ. */
  rollupMap?: Record<string, string>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** The deck's default deal-type filter. */
export const DECK_DEAL_TYPES: DealType[] = ["Labs", "Labs - BRP"];

/** Default partner roll-up (raw admin name → deck display name). */
export const DEFAULT_ROLLUP: Record<string, string> = {
  "Billups-OOH": "Billups",
  "Billups-Print": "Billups",
  "MIQ-Prog": "MIQ",
  "MIQ-Social": "MIQ",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase + strip everything but a–z0–9 (kills case, spaces, hyphens, dots). */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** n / d, or null when d is 0 (avoids Infinity/NaN in %). */
function ratio(n: number, d: number): number | null {
  return d !== 0 ? n / d : null;
}

/**
 * A canonical partner key that both sides of the booked join agree on: it
 * applies the roll-up (so "Billups-OOH" and the display "Billups" both land on
 * the same key) and normalises spelling (so MIR's "billups" / "sirius xm" match
 * too). Built once per call, closed over the roll-up map.
 */
function makeCanonical(rollup: Record<string, string>): (name: string) => string {
  // normKey(raw) → normKey(display), so MIR names that happen to equal a raw
  // child name also fold into the display group.
  const rolledKeys = new Map<string, string>();
  for (const [raw, display] of Object.entries(rollup)) {
    rolledKeys.set(normKey(raw), normKey(display));
  }
  return (name: string) => {
    const k = normKey(name);
    return rolledKeys.get(k) ?? k;
  };
}

// ─── Internal group accumulator (post roll-up) ────────────────────────────────

interface GroupAgg {
  displayName: string;
  dealType: DealType;
  allIncluded: boolean;
  pluscoTarget: number;
  rfq2Sum: number;
  rfq2Present: boolean;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function computeLabsTargetVsBooked(
  params: ComputeLabsTargetVsBookedParams
): LabsTargetVsBookedResult {
  const {
    targets,
    bookedByPartner,
    rfq2TargetByPartner,
    mirRows,
    dealTypeFilter,
    partnerFilter,
    rollupMap,
  } = params;

  const dealTypes = new Set<DealType>(dealTypeFilter ?? DECK_DEAL_TYPES);
  const rollup = rollupMap ?? DEFAULT_ROLLUP;
  const canonical = makeCanonical(rollup);

  // RFQ2 target (E) is looked up per raw partner name (the pacing layer names
  // partners the same way the targets page does), then summed during roll-up.
  const rfq2Lookup = new Map<string, number>();
  for (const [name, target] of rfq2TargetByPartner) {
    rfq2Lookup.set(normKey(name), target);
  }

  // Booked (F) aggregated by CANONICAL key, so MIR's aggregated / differently
  // spelled partners join the rolled-up rows exactly once.
  const bookedByCanonical = new Map<string, number>();
  for (const [name, net] of bookedByPartner) {
    const key = canonical(name);
    bookedByCanonical.set(key, (bookedByCanonical.get(key) ?? 0) + net);
  }

  // 1) Roster = targets filtered to the chosen deal types, rolled up to groups.
  const byDisplay = new Map<string, GroupAgg>();
  const order: string[] = [];

  for (const t of targets) {
    if (!dealTypes.has(t.dealType)) continue;

    const displayName = rollup[t.partner] ?? t.partner;
    let g = byDisplay.get(displayName);
    if (!g) {
      g = {
        displayName,
        dealType: t.dealType,
        allIncluded: true,
        pluscoTarget: 0,
        rfq2Sum: 0,
        rfq2Present: false,
      };
      byDisplay.set(displayName, g);
      order.push(displayName);
    }
    g.pluscoTarget += t.mediaSpendTarget ?? 0;
    g.allIncluded = g.allIncluded && Boolean(t.inLabsForecaster2);

    const r = rfq2Lookup.get(normKey(t.partner));
    if (r !== undefined) {
      g.rfq2Present = true;
      g.rfq2Sum += r;
    }
  }

  const groups = order.map((name) => byDisplay.get(name)!);
  const bookedOf = (g: GroupAgg) =>
    bookedByCanonical.get(canonical(g.displayName)) ?? 0;

  // 2) Tiles from ALL deal-scoped groups (unaffected by the partner filter).
  const totalMedia = computeTotalMediaInvestment(mirRows).grandTotal;
  let sumBookedAll = 0;
  let sumBookedForecaster = 0;
  for (const g of groups) {
    const b = bookedOf(g);
    sumBookedAll += b;
    if (g.allIncluded) sumBookedForecaster += b;
  }
  const tiles: LabsShareTiles = {
    totalMedia,
    labsShareAll: ratio(sumBookedAll, totalMedia),
    labsShareForecaster: ratio(sumBookedForecaster, totalMedia),
  };

  // 3) Display rows (optional partner allow-list), each joined to MIR booked.
  const keep = partnerFilter ? new Set(partnerFilter) : null;

  let rows: LabsTargetVsBookedRow[] = groups
    .filter((g) => (keep ? keep.has(g.displayName) : true))
    .map((g) => {
      const booked = bookedOf(g);
      const rfq2Target = g.rfq2Present ? g.rfq2Sum : null;
      return {
        partner: g.displayName,
        dealType: g.dealType,
        includedInRfq: g.allIncluded,
        pluscoTarget: g.pluscoTarget,
        rfq2Target,
        booked,
        pctOfPlusco: ratio(booked, g.pluscoTarget),
        pctOfRfq: rfq2Target === null ? null : ratio(booked, rfq2Target),
      };
    });

  // Deck ordering: forecaster partners first, then by PLUSCO target descending.
  rows = rows.sort((a, b) => {
    if (a.includedInRfq !== b.includedInRfq) return a.includedInRfq ? -1 : 1;
    return b.pluscoTarget - a.pluscoTarget;
  });

  // 4) Grand totals across the displayed rows.
  let tPlusco = 0;
  let tBooked = 0;
  let tRfq2 = 0;
  let tRfq2Present = false;
  for (const r of rows) {
    tPlusco += r.pluscoTarget;
    tBooked += r.booked;
    if (r.rfq2Target !== null) {
      tRfq2Present = true;
      tRfq2 += r.rfq2Target;
    }
  }
  const totalsRfq2 = tRfq2Present ? tRfq2 : null;

  const totals: LabsTargetVsBookedTotals = {
    pluscoTarget: tPlusco,
    rfq2Target: totalsRfq2,
    booked: tBooked,
    pctOfPlusco: ratio(tBooked, tPlusco),
    pctOfRfq: totalsRfq2 === null ? null : ratio(tBooked, totalsRfq2),
  };

  // 5) QA: groups with no MIR booked, and MIR booked keys claimed by no group.
  const groupKeys = new Set(groups.map((g) => canonical(g.displayName)));
  const unmatchedTargets = groups
    .filter((g) => !bookedByCanonical.has(canonical(g.displayName)))
    .map((g) => g.displayName);
  const unmatchedMirPartners = [...bookedByCanonical.keys()].filter(
    (k) => !groupKeys.has(k)
  );

  return { rows, totals, tiles, unmatchedTargets, unmatchedMirPartners };
}