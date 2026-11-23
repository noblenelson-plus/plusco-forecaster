// filepath: lib/finance-toolkit/investment-plan.ts

/**
 * New Business Calculator · start from media investment. Pure compute.
 *
 * Given an annual media investment, a digital share and (optionally) the number
 * of campaigns a year, find the current clients most like it and read the team
 * off what those clients actually use:
 *
 *   distance        |ln(client annual spend ÷ investment)|
 *                   + 2 × |client digital share − target digital share|
 *                   + 0.5 × |ln(client campaigns a year ÷ target campaigns)|   (when both are known)
 *   FTE for a match investment ÷ that client's spend per FTE
 *   answer          median of the matches' FTEs; range = lowest to highest
 *   team mix        average of the matches' shares of client hours by role
 *                   group and seniority (each match weighs the same), × answer
 *
 * No complexity multiplier yet: the matches' real teams already reflect how
 * complex their work is. Role groups are provisional (roles.ts).
 */

import { ROLE_GROUPS, SENIORITY, type RoleGroup, type Seniority } from "./roles";
import { MIN_MEDIABOX_SHARE, staffing, type StaffingRow } from "./staffing";

export interface InvestmentInputs {
  /** Annual media investment, CAD. */
  investment: number;
  /** 0–1. */
  digitalShare: number;
  /** Campaigns a year, or null to ignore. */
  campaigns: number | null;
  /** MediaOcean agency, or "all". */
  agency: string;
}

export interface InvestmentMatch {
  row: StaffingRow;
  /** Annual spend used for matching (new clients scaled to a year). */
  annualSpend: number;
  digitalShare: number;
  /** MediaBox campaigns scaled to all of the client's spend, when enough is linked. */
  campaignsPerYear: number | null;
  distance: number;
  /** Team this client's spend per FTE implies for the target investment. */
  fteForInvestment: number;
}

export interface InvestmentPlan {
  matches: InvestmentMatch[];
  fte: number;
  fteLow: number;
  fteHigh: number;
  /** Investment ÷ answer. */
  spendPerFte: number;
  byGroup: Record<RoleGroup, number>;
  byLevel: Record<Seniority, number>;
}

/** Weight of each term in the distance. */
const W_DIGITAL = 2;
const W_CAMPAIGNS = 0.5;

/** Clients a plan can be built from (big enough to be compared), for one agency or all. */
export function investmentCandidates(agency: string): InvestmentMatch[] {
  const result = staffing((c) => agency === "all" || c.agency === agency);
  if (!result) return [];
  return result.rows
    .filter((r) => r.comparable && r.spendPerFte !== null && r.client.spend > 0)
    .map((row) => {
      const c = row.client;
      const cx = c.complexity;
      return {
        row,
        annualSpend: c.isNew ? c.annualizedSpend : c.spend,
        digitalShare: c.digitalSpend / c.spend,
        campaignsPerYear: cx && c.mediaboxShare >= MIN_MEDIABOX_SHARE ? cx.campaigns / c.mediaboxShare : null,
        distance: 0,
        fteForInvestment: 0,
      };
    });
}

/** Scores every candidate against the inputs, closest first. */
export function rankMatches(candidates: InvestmentMatch[], inputs: InvestmentInputs): InvestmentMatch[] {
  return candidates
    .map((m) => {
      let d = Math.abs(Math.log(Math.max(m.annualSpend, 1) / Math.max(inputs.investment, 1)));
      d += W_DIGITAL * Math.abs(m.digitalShare - inputs.digitalShare);
      if (inputs.campaigns && m.campaignsPerYear) d += W_CAMPAIGNS * Math.abs(Math.log(m.campaignsPerYear / inputs.campaigns));
      return { ...m, distance: d, fteForInvestment: inputs.investment / m.row.spendPerFte! };
    })
    .sort((a, b) => a.distance - b.distance);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The plan from the chosen matches, or null with none. */
export function investmentPlan(inputs: InvestmentInputs, matches: InvestmentMatch[]): InvestmentPlan | null {
  if (!matches.length || inputs.investment <= 0) return null;
  const scored = matches.map((m) => ({ ...m, fteForInvestment: inputs.investment / m.row.spendPerFte! }));
  const ftes = scored.map((m) => m.fteForInvestment);
  const fte = median(ftes);

  const byGroup = Object.fromEntries(ROLE_GROUPS.map((g) => [g, 0])) as Record<RoleGroup, number>;
  const byLevel = Object.fromEntries(SENIORITY.map((l) => [l, 0])) as Record<Seniority, number>;
  for (const m of scored) {
    const h = m.row.hours || 1;
    for (const g of ROLE_GROUPS) byGroup[g] += m.row.byGroup[g] / h / scored.length;
    for (const l of SENIORITY) byLevel[l] += m.row.byLevel[l] / h / scored.length;
  }
  for (const g of ROLE_GROUPS) byGroup[g] *= fte;
  for (const l of SENIORITY) byLevel[l] *= fte;

  return {
    matches: scored,
    fte,
    fteLow: Math.min(...ftes),
    fteHigh: Math.max(...ftes),
    spendPerFte: inputs.investment / fte,
    byGroup,
    byLevel,
  };
}
