// components/forecaster/sections/labs-target-vs-booked-data.ts

/**
 * Labs "Target vs Booked by Partner" — the exec-KPI table that mirrors the
 * senior-leadership deck. Pure compute (no React, no Firestore).
 *
 * Column → source (see the wiring hook in ./use-labs-target-vs-booked):
 *   A  Deal type            PartnerTarget.dealType         (partner_targets/{year})
 *   B  Included in RFQ       PartnerTarget.inLabsForecaster2
 *   C  Partner               PartnerTarget.partner
 *   D  PLUSCO Labs target    PartnerTarget.mediaSpendTarget
 *   E  RFQ2 Labs target      rfq2TargetByPartner  (pacing RFQ2-BL; forecaster-only → null)
 *   F  Booked to date (MIR)  bookedByPartner      (MediaOcean MIR, Labs deal-type)
 *   G  % of PLUSCO target    F / D
 *   H  % of RFQ target       F / E
 *   I  Total media (MIR)     computeTotalMediaInvestment(mirRows).grandTotal
 *   J  Labs share of media   Σ F (all rows) / I
 *   K  …(forecaster only)    Σ F (included rows) / I
 *
 * Roll-up: split admin partners are merged for display and for both target and
 * booked, via a canonical key (lowercase, strip spaces/punctuation, apply the
 * roll-up map). Billups-OOH + Billups-Print → "Billups"; MIQ-Prog + MIQ-Social
 * + AIM → "MIQ". AIM has an RFQ2 forecast but no PLUSCO target row, so E is
 * aggregated by canonical key (like booked) rather than per target row — that
 * way AIM's forecast still folds into MIQ.
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
  partner: string;
  dealType: DealType;
  includedInRfq: boolean;
  pluscoTarget: number;
  rfq2Target: number | null;
  booked: number;
  pctOfPlusco: number | null;
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
  totalMedia: number;
  labsShareAll: number | null;
  labsShareForecaster: number | null;
}

export interface LabsTargetVsBookedResult {
  rows: LabsTargetVsBookedRow[];
  totals: LabsTargetVsBookedTotals;
  tiles: LabsShareTiles;
  unmatchedTargets: string[];
  unmatchedMirPartners: string[];
}

export interface ComputeLabsTargetVsBookedParams {
  targets: PartnerTarget[];
  bookedByPartner: Map<string, number>;
  rfq2TargetByPartner: Map<string, number>;
  mirRows: MediaInvestmentRow[];
  dealTypeFilter?: DealType[];
  partnerFilter?: string[];
  rollupMap?: Record<string, string>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** The deck's default deal-type filter. */
export const DECK_DEAL_TYPES: DealType[] = ["Labs", "Labs - BRP"];

/** Default partner roll-up (raw admin/forecast name → deck display name). */
export const DEFAULT_ROLLUP: Record<string, string> = {
  "Billups-OOH": "Billups",
  "Billups-Print": "Billups",
  "MIQ-Prog": "MIQ",
  "MIQ-Social": "MIQ",
  "AIM": "MIQ",
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
 * A canonical partner key both sides of a join agree on: applies the roll-up
 * (so "Billups-OOH", "AIM", and the display "Billups"/"MIQ" all collapse) and
 * normalises spelling (so MIR's "billups" / "sirius xm" match too).
 */
function makeCanonical(rollup: Record<string, string>): (name: string) => string {
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

  // RFQ2 target (E) aggregated by CANONICAL key, mirroring booked — so partners
  // that roll into a group but have no PLUSCO target row (e.g. AIM → MIQ) still
  // contribute their forecast.
  const rfq2ByCanonical = new Map<string, number>();
  for (const [name, target] of rfq2TargetByPartner) {
    const key = canonical(name);
    rfq2ByCanonical.set(key, (rfq2ByCanonical.get(key) ?? 0) + target);
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
      };
      byDisplay.set(displayName, g);
      order.push(displayName);
    }
    g.pluscoTarget += t.mediaSpendTarget ?? 0;
    g.allIncluded = g.allIncluded && Boolean(t.inLabsForecaster2);
  }

  const groups = order.map((name) => byDisplay.get(name)!);
  const bookedOf = (g: GroupAgg) =>
    bookedByCanonical.get(canonical(g.displayName)) ?? 0;
  const rfq2Of = (g: GroupAgg): number | null => {
    const key = canonical(g.displayName);
    return rfq2ByCanonical.has(key) ? rfq2ByCanonical.get(key)! : null;
  };

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
      const rfq2Target = rfq2Of(g);
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
  let tBookedForRfq = 0; // booked only for rows that HAVE an RFQ2 target
  for (const r of rows) {
    tPlusco += r.pluscoTarget;
    tBooked += r.booked;
    if (r.rfq2Target !== null) {
      tRfq2Present = true;
      tRfq2 += r.rfq2Target;
      tBookedForRfq += r.booked;
    }
  }
  const totalsRfq2 = tRfq2Present ? tRfq2 : null;

  const totals: LabsTargetVsBookedTotals = {
    pluscoTarget: tPlusco,
    rfq2Target: totalsRfq2,
    booked: tBooked,
    pctOfPlusco: ratio(tBooked, tPlusco),
    pctOfRfq: totalsRfq2 === null ? null : ratio(tBookedForRfq, totalsRfq2),
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