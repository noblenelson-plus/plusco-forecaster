// filepath: lib/finance-toolkit/model.ts

/**
 * Finance Toolkit — pure compute over the static sample dataset (no React, no
 * Firebase). Every number the three tabs show comes from a function here, so
 * each one traces to a single formula:
 *
 *   staffing cost      Σ Maconomy cost amount of client-work hours (Base1 or Enterprise)
 *   gross margin       gross revenue − staffing cost
 *   margin %           Σ margin ÷ Σ revenue            (portfolio math, never an average of %)
 *   revenue per hour   Σ revenue ÷ Σ client-work hours
 *   cost per hour      Σ cost ÷ Σ hours
 *   FTE                hours ÷ FTE_HOURS_PER_MONTH
 *
 * Time classes: an hour is "client work" when its work code is a client code
 * AND it is booked to a real client. Everything booked to an agency house
 * account, plus the 15xx (time off) and 16xx (internal) work codes anywhere, is
 * overhead and never enters profitability or the calculator.
 */

import { getFinanceToolkitData } from "./data-holder";
import type {
  AgencyCurrency,
  CostBasis,
  FtFactTuple,
  FtMatchStatus,
  FtTimeClass,
} from "./finance-toolkit.types";

// Downloaded by the page (admin/finance-toolkit) before this module loads.
const DATA = getFinanceToolkitData();

// ─── Assumptions (shown in the UI) ───────────────────────────────────────────

/** 1 FTE = this many client-work hours per month. The data agrees: the median
 *  full employee-month logs ~140 client-work hours (see DATA.source). */
export const FTE_HOURS_PER_MONTH = 140;

/** An account is "over-serviced" when it earns less than this share of its
 *  scope's average revenue per client hour. */
export const OVER_SERVICED_RATIO = 0.5;

/** Accounts below this many client hours in the period are too small to flag. */
export const FLAG_MIN_HOURS = 40;

/** Roles under this share of the comparables' hours are grouped as "Other roles". */
export const ROLE_MIN_SHARE = 0.02;

/** Ramp: a client counts as "new" when its first client hour comes at least one
 *  full month after its agency's data really starts (the export is near-empty
 *  in Jan 2025, and MEK US only starts in Apr 2025 — a client first seen in the
 *  agency's first month may simply predate the data), and it has at least
 *  RAMP_MIN_HISTORY months observed; steady state = months 7–12. */
const RAMP_START_BUFFER = 1;
/** A month counts as the start of an agency's data once its hours reach this
 *  share of the agency's median month. */
const DATA_START_SHARE = 0.25;
const RAMP_MIN_HISTORY = 9;
const RAMP_MIN_STEADY_HOURS = 40;
const RAMP_MIN_CLIENTS = 5;

// ─── Decoded model ───────────────────────────────────────────────────────────

export interface FtClient {
  index: number;
  agencyId: string;
  agencyName: string;
  currency: AgencyCurrency;
  number: string;
  name: string;
  match: FtMatchStatus;
  /** Month index of the first / last client-work hour, or −1. */
  firstMonth: number;
  lastMonth: number;
  internal: boolean;
}

export type TimeType = "client" | "internal" | "timeoff";
export const TIME_TYPES: { id: TimeType; label: string }[] = [
  { id: "client", label: "Client work" },
  { id: "internal", label: "Internal & overhead" },
  { id: "timeoff", label: "Time off" },
];

interface Fact {
  client: number;
  month: number;
  role: number;
  time: TimeType;
  hours: number;
  costBase1: number;
  costEnterprise: number;
  billed: number;
  /** Hours whose entry carries a cost amount. */
  costedHours: number;
}

const clients: FtClient[] = DATA.clients.map(([agencyIndex, number, name, match, firstMonth, lastMonth], index) => {
  const agency = DATA.agencies[agencyIndex];
  return {
    index,
    agencyId: agency.id,
    agencyName: agency.name,
    currency: agency.currency,
    number,
    name,
    match,
    firstMonth,
    lastMonth,
    internal: match === "internal",
  };
});

function effectiveTime(f: FtFactTuple): TimeType {
  const tc: FtTimeClass = f[3];
  if (tc === 2) return "timeoff";
  if (tc === 1 || clients[f[0]].internal) return "internal";
  return "client";
}

const facts: Fact[] = DATA.facts.map((f) => ({
  client: f[0],
  month: f[1],
  role: f[2],
  time: effectiveTime(f),
  hours: f[4],
  costBase1: f[5],
  costEnterprise: f[6],
  billed: f[7],
  costedHours: f[8],
}));

/** Revenue month index → fact month index (both "YYYY-MM"). */
const revenueMonthToMonth = DATA.revenueMonths.map((m) => DATA.months.indexOf(m));

/** client → fact month index → gross revenue. */
const revenueByClientMonth = new Map<number, Map<number, number>>();
for (const [client, revMonth, amount] of DATA.revenue) {
  const month = revenueMonthToMonth[revMonth];
  let m = revenueByClientMonth.get(client);
  if (!m) revenueByClientMonth.set(client, (m = new Map()));
  m.set(month, (m.get(month) ?? 0) + amount);
}

/** client → month → anonymous employee ids on client work. */
const staffByClientMonth = new Map<number, Map<number, number[]>>();
for (const [client, month, ids] of DATA.staff) {
  let m = staffByClientMonth.get(client);
  if (!m) staffByClientMonth.set(client, (m = new Map()));
  m.set(month, ids);
}

/**
 * First month in which each agency's export is really populated (hours ≥
 * DATA_START_SHARE of the agency's median month). Jan 2025 is near-empty in
 * every file and MEK US starts in Apr 2025.
 */
const AGENCY_DATA_START: Record<string, number> = (() => {
  const byAgency = new Map<string, number[]>();
  for (const f of facts) {
    const a = clients[f.client].agencyId;
    let arr = byAgency.get(a);
    if (!arr) byAgency.set(a, (arr = new Array(DATA.months.length).fill(0)));
    arr[f.month] += f.hours;
  }
  const out: Record<string, number> = {};
  for (const [a, arr] of byAgency) {
    const sorted = [...arr].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    out[a] = Math.max(0, arr.findIndex((h) => h >= median * DATA_START_SHARE));
  }
  return out;
})();

/** First month index in which every agency's hours export is populated. */
const FIRST_FULL_MONTH = Math.min(...Object.values(AGENCY_DATA_START));

export const MODEL = {
  clients,
  roles: DATA.roles,
  months: DATA.months,
  agencies: DATA.agencies,
  /** Fact month indices covered by the gross revenue reports. */
  revenueMonthIndices: revenueMonthToMonth,
  source: DATA.source,
  generatedAt: DATA.generatedAt,
  /** Month index where each agency's export becomes populated. */
  agencyDataStart: AGENCY_DATA_START,
  /** Earliest month index with a populated export (Feb 2025). */
  firstFullMonth: FIRST_FULL_MONTH,
};

export const costOf = (f: { costBase1: number; costEnterprise: number }, basis: CostBasis) =>
  basis === "base1" ? f.costBase1 : f.costEnterprise;

/** Safe ratio: null when the denominator is 0. */
export const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

// ─── Scopes ──────────────────────────────────────────────────────────────────

export interface Scope {
  id: string;
  label: string;
  agencyIds: string[];
  currency: AgencyCurrency;
}

/** Scopes never mix currencies: the Canadian agencies roll up in CAD, MEK US
 *  stays in USD. */
export const SCOPES: Scope[] = [
  { id: "canada", label: "All Canadian agencies", agencyIds: ["cossette", "jungle", "k72"], currency: "CAD" },
  { id: "cossette", label: "Cossette Media", agencyIds: ["cossette"], currency: "CAD" },
  { id: "jungle", label: "Jungle Media", agencyIds: ["jungle"], currency: "CAD" },
  { id: "mek", label: "MEK US", agencyIds: ["mek"], currency: "USD" },
];

export const inScope = (scope: Scope, c: FtClient) => scope.agencyIds.includes(c.agencyId);

// ─── Month helpers ───────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" → "Mar 2026" (or "Mar 26" when short). */
export function monthLabel(index: number, short = false): string {
  const [y, m] = MODEL.months[index].split("-");
  return `${MONTH_SHORT[Number(m) - 1]} ${short ? y.slice(2) : y}`;
}

export function periodLabel(from: number, to: number): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
}

/** Distinct employees on client work for the given clients over [from, to]. */
function headcount(clientIdx: Iterable<number>, from: number, to: number): number {
  const people = new Set<number>();
  for (const c of clientIdx) {
    const byMonth = staffByClientMonth.get(c);
    if (!byMonth) continue;
    for (const [month, ids] of byMonth) {
      if (month < from || month > to) continue;
      for (const id of ids) people.add(id);
    }
  }
  return people.size;
}

// ─── Tab 1 · Hours Report Portal ─────────────────────────────────────────────

export type PortalGroup = "client" | "role" | "month" | "time" | "agency";

export interface PortalFilters {
  scope: Scope;
  /** null = every client in scope. */
  clients: Set<number> | null;
  /** null = every role. */
  roles: Set<number> | null;
  times: Set<TimeType>;
  from: number;
  to: number;
}

export interface PortalRow {
  key: string;
  label: string;
  sublabel?: string;
  hours: number;
  cost: number;
  billed: number;
  /** Share of the filtered hours. */
  share: number;
}

export interface PortalTotals {
  hours: number;
  cost: number;
  billed: number;
  costPerHour: number | null;
  billedPerHour: number | null;
  /** Share of the hours that carry a cost amount. */
  costCoverage: number | null;
}

export interface PortalResult {
  rows: PortalRow[];
  totals: PortalTotals;
  /** Hours and cost per month over the period, for the trend chart. */
  monthly: { month: number; client: number; internal: number; timeoff: number; cost: number }[];
  /** Distinct people on client work — null when a role filter makes it ambiguous. */
  people: number | null;
}

const TIME_LABEL: Record<TimeType, string> = { client: "Client work", internal: "Internal & overhead", timeoff: "Time off" };

export function portal(filters: PortalFilters, group: PortalGroup, basis: CostBasis): PortalResult {
  const groups = new Map<string, PortalRow>();
  const monthly = new Map<number, { client: number; internal: number; timeoff: number; cost: number }>();
  for (let m = filters.from; m <= filters.to; m++) monthly.set(m, { client: 0, internal: 0, timeoff: 0, cost: 0 });
  const totals = { hours: 0, cost: 0, billed: 0 };
  let costedHours = 0;
  const clientsSeen = new Set<number>();

  for (const f of facts) {
    if (f.month < filters.from || f.month > filters.to) continue;
    const c = clients[f.client];
    if (!inScope(filters.scope, c)) continue;
    if (filters.clients && !filters.clients.has(f.client)) continue;
    if (filters.roles && !filters.roles.has(f.role)) continue;
    if (!filters.times.has(f.time)) continue;
    const cost = costOf(f, basis);

    let key: string;
    let label: string;
    let sublabel: string | undefined;
    switch (group) {
      case "client":
        key = String(f.client);
        label = c.name;
        sublabel = `${c.agencyName} · #${c.number}`;
        break;
      case "role":
        key = String(f.role);
        label = MODEL.roles[f.role];
        break;
      case "month":
        key = String(f.month).padStart(3, "0");
        label = monthLabel(f.month);
        break;
      case "time":
        key = f.time;
        label = TIME_LABEL[f.time];
        break;
      case "agency":
        key = c.agencyId;
        label = c.agencyName;
        break;
    }
    const row = groups.get(key) ?? { key, label, sublabel, hours: 0, cost: 0, billed: 0, share: 0 };
    row.hours += f.hours;
    row.cost += cost;
    row.billed += f.billed;
    groups.set(key, row);

    totals.hours += f.hours;
    totals.cost += cost;
    totals.billed += f.billed;
    costedHours += f.costedHours;
    const mm = monthly.get(f.month)!;
    mm[f.time] += f.hours;
    mm.cost += cost;
    if (f.time === "client") clientsSeen.add(f.client);
  }

  const rows = [...groups.values()];
  for (const r of rows) r.share = totals.hours === 0 ? 0 : r.hours / totals.hours;
  if (group === "month") rows.sort((a, b) => a.key.localeCompare(b.key));
  else rows.sort((a, b) => b.hours - a.hours);

  return {
    rows,
    totals: {
      ...totals,
      costPerHour: ratio(totals.cost, totals.hours),
      billedPerHour: ratio(totals.billed, totals.hours),
      costCoverage: ratio(costedHours, totals.hours),
    },
    monthly: [...monthly.entries()].map(([month, v]) => ({ month, ...v })),
    people: filters.roles || !filters.times.has("client") ? null : headcount(clientsSeen, filters.from, filters.to),
  };
}

// ─── Tab 2 · Account Profitability ───────────────────────────────────────────

export type ProfitStatus = "matched" | "no-revenue" | "no-hours";
/** loss: staffing cost > positive revenue · over-serviced: low revenue per hour · credit: the period nets to ≤ 0 revenue (credit notes / reversals), so margin is not meaningful. */
export type ProfitFlag = "loss" | "over-serviced" | "credit" | null;

export interface ProfitRow {
  client: FtClient;
  status: ProfitStatus;
  revenue: number | null;
  cost: number | null;
  hours: number;
  people: number;
  margin: number | null;
  marginPct: number | null;
  revenuePerHour: number | null;
  costPerHour: number | null;
  costPctRevenue: number | null;
  /** Share of the client hours that carry a Maconomy cost amount. */
  costCoverage: number | null;
  flag: ProfitFlag;
}

export interface ProfitTotals {
  /** Every gross revenue line in scope, matched or not — ties to the reports. */
  revenue: number;
  /** Revenue booked to agency house accounts (reversals etc.), included in `revenue`. */
  houseRevenue: number;
  /** Revenue of accounts that also have hours (the margin base). */
  matchedRevenue: number;
  matchedCost: number;
  matchedHours: number;
  margin: number;
  marginPct: number | null;
  revenuePerHour: number | null;
  costPerHour: number | null;
  costPctRevenue: number | null;
  people: number;
  /** Revenue with no hours in the same agency (K72, cross-agency work…). */
  revenueOnly: number;
  revenueOnlyAccounts: number;
  /** Client work on accounts without a revenue line. */
  unmatchedHours: number;
  unmatchedCost: number;
  unmatchedAccounts: number;
  /** House accounts + internal + time off, for context. */
  overheadHours: number;
  overheadCost: number;
  flagged: number;
  lossMaking: number;
  /** Share of matched client hours that carry a cost amount. */
  costCoverage: number | null;
}

export interface ProfitResult {
  rows: ProfitRow[];
  totals: ProfitTotals;
}

export function profitability(scope: Scope, from: number, to: number, basis: CostBasis): ProfitResult {
  const hours = new Map<number, number>();
  const cost = new Map<number, number>();
  const costed = new Map<number, number>();
  let overheadHours = 0;
  let overheadCost = 0;
  for (const f of facts) {
    if (f.month < from || f.month > to) continue;
    const c = clients[f.client];
    if (!inScope(scope, c)) continue;
    if (f.time !== "client") {
      overheadHours += f.hours;
      overheadCost += costOf(f, basis);
      continue;
    }
    hours.set(f.client, (hours.get(f.client) ?? 0) + f.hours);
    cost.set(f.client, (cost.get(f.client) ?? 0) + costOf(f, basis));
    costed.set(f.client, (costed.get(f.client) ?? 0) + f.costedHours);
  }
  const revenue = new Map<number, number>();
  for (const [client, byMonth] of revenueByClientMonth) {
    if (!inScope(scope, clients[client])) continue;
    let sum = 0;
    for (const [month, amount] of byMonth) if (month >= from && month <= to) sum += amount;
    if (sum !== 0) revenue.set(client, sum);
  }

  const rows: ProfitRow[] = [];
  const ids = new Set<number>([...hours.keys(), ...revenue.keys()]);
  for (const id of ids) {
    const c = clients[id];
    if (c.internal) continue;
    const h = hours.get(id) ?? 0;
    const k = cost.get(id) ?? 0;
    const r = revenue.get(id);
    const hasHours = h !== 0 || k !== 0;
    const status: ProfitStatus = r === undefined ? "no-revenue" : hasHours ? "matched" : "no-hours";
    // Margin % and revenue/hour need positive revenue (credit notes can net a period to ≤ 0).
    const margin = status === "matched" ? r! - k : null;
    const positive = status === "matched" && r! > 0;
    rows.push({
      client: c,
      status,
      revenue: r ?? null,
      cost: hasHours ? k : null,
      hours: h,
      people: headcount([id], from, to),
      margin,
      marginPct: positive ? ratio(margin!, r!) : null,
      revenuePerHour: positive ? ratio(r!, h) : null,
      costPerHour: hasHours ? ratio(k, h) : null,
      costPctRevenue: positive ? ratio(k, r!) : null,
      costCoverage: h > 0 ? (costed.get(id) ?? 0) / h : null,
      flag: null,
    });
  }

  const matched = rows.filter((r) => r.status === "matched");
  const matchedRevenue = matched.reduce((a, r) => a + r.revenue!, 0);
  const matchedCost = matched.reduce((a, r) => a + r.cost!, 0);
  const matchedHours = matched.reduce((a, r) => a + r.hours, 0);
  const portfolioRevPerHour = ratio(matchedRevenue, matchedHours);

  for (const r of matched) {
    if (r.revenue! <= 0) {
      r.flag = "credit";
      continue;
    }
    if (r.hours < FLAG_MIN_HOURS) continue;
    if (r.margin! < 0) r.flag = "loss";
    else if (portfolioRevPerHour !== null && r.revenuePerHour !== null && r.revenuePerHour < portfolioRevPerHour * OVER_SERVICED_RATIO) {
      r.flag = "over-serviced";
    }
  }

  const statusOrder: Record<ProfitStatus, number> = { matched: 0, "no-hours": 1, "no-revenue": 2 };
  rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (b.revenue ?? 0) - (a.revenue ?? 0) || b.hours - a.hours);

  const revenueOnlyRows = rows.filter((r) => r.status === "no-hours");
  const unmatchedRows = rows.filter((r) => r.status === "no-revenue");
  const margin = matchedRevenue - matchedCost;
  return {
    rows,
    totals: {
      revenue: [...revenue.values()].reduce((a, v) => a + v, 0),
      houseRevenue: [...revenue.entries()].filter(([id]) => clients[id].internal).reduce((a, [, v]) => a + v, 0),
      matchedRevenue,
      matchedCost,
      matchedHours,
      margin,
      marginPct: ratio(margin, matchedRevenue),
      revenuePerHour: portfolioRevPerHour,
      costPerHour: ratio(matchedCost, matchedHours),
      costPctRevenue: ratio(matchedCost, matchedRevenue),
      people: headcount(matched.map((r) => r.client.index), from, to),
      revenueOnly: revenueOnlyRows.reduce((a, r) => a + r.revenue!, 0),
      revenueOnlyAccounts: revenueOnlyRows.length,
      unmatchedHours: unmatchedRows.reduce((a, r) => a + r.hours, 0),
      unmatchedCost: unmatchedRows.reduce((a, r) => a + (r.cost ?? 0), 0),
      unmatchedAccounts: unmatchedRows.filter((r) => r.hours > 0).length,
      overheadHours,
      overheadCost,
      flagged: matched.filter((r) => r.flag === "loss" || r.flag === "over-serviced").length,
      lossMaking: matched.filter((r) => r.flag === "loss").length,
      costCoverage: ratio(
        matched.reduce((a, r) => a + (costed.get(r.client.index) ?? 0), 0),
        matchedHours
      ),
    },
  };
}

export interface ClientDetail {
  monthly: { month: number; revenue: number | null; cost: number; hours: number; people: number }[];
  roles: { role: number; label: string; hours: number; cost: number; share: number }[];
}

/** Monthly trend + role mix for one account over [from, to]. */
export function clientDetail(clientIndex: number, from: number, to: number, basis: CostBasis): ClientDetail {
  const months = new Map<number, { revenue: number | null; cost: number; hours: number }>();
  const revMonths = new Set(MODEL.revenueMonthIndices);
  for (let m = from; m <= to; m++) months.set(m, { revenue: revMonths.has(m) ? 0 : null, cost: 0, hours: 0 });
  const roles = new Map<number, { hours: number; cost: number }>();
  let total = 0;
  for (const f of facts) {
    if (f.client !== clientIndex || f.time !== "client" || f.month < from || f.month > to) continue;
    const k = costOf(f, basis);
    const m = months.get(f.month)!;
    m.cost += k;
    m.hours += f.hours;
    const r = roles.get(f.role) ?? { hours: 0, cost: 0 };
    r.hours += f.hours;
    r.cost += k;
    roles.set(f.role, r);
    total += f.hours;
  }
  for (const [month, amount] of revenueByClientMonth.get(clientIndex) ?? []) {
    const m = months.get(month);
    if (m) m.revenue = (m.revenue ?? 0) + amount;
  }
  const staff = staffByClientMonth.get(clientIndex);
  return {
    monthly: [...months.entries()].map(([month, v]) => ({ month, ...v, people: staff?.get(month)?.length ?? 0 })),
    roles: [...roles.entries()]
      .map(([role, v]) => ({ role, label: MODEL.roles[role], ...v, share: total === 0 ? 0 : v.hours / total }))
      .sort((a, b) => b.hours - a.hours),
  };
}

// ─── Tab 3 · New Business Targets Calculator ─────────────────────────────────

/** The revenue window, as fact month indices. */
const REV_FROM = Math.min(...MODEL.revenueMonthIndices);
const REV_TO = Math.max(...MODEL.revenueMonthIndices);
const REV_MONTHS = REV_TO - REV_FROM + 1;
/** Trailing 12 months of hours, for role cost rates. */
const RATE_FROM = Math.max(0, MODEL.months.length - 12);
const RATE_TO = MODEL.months.length - 1;

export interface Comparable {
  client: FtClient;
  /** Gross revenue over the revenue window. */
  revenue: number;
  /** revenue × 12 ÷ months in the window. */
  annualizedRevenue: number;
  hours: number;
  cost: number;
  /** Client-work hours per $1,000 of revenue. */
  hoursPerThousand: number;
  marginPct: number | null;
  activeMonths: number;
}

/** Accounts that can serve as comparables: real clients of the agency with
 *  revenue and client hours in the revenue window, active ≥ 4 months. */
export function comparableCandidates(agencyId: string, basis: CostBasis): Comparable[] {
  const scope: Scope = { id: agencyId, label: agencyId, agencyIds: [agencyId], currency: "CAD" };
  const { rows } = profitability(scope, REV_FROM, REV_TO, basis);
  return rows
    .filter((r) => r.status === "matched" && r.revenue! > 0 && r.hours > 0)
    .map((r) => {
      const active = new Set<number>();
      for (const f of facts) {
        if (f.client === r.client.index && f.time === "client" && f.month >= REV_FROM && f.month <= REV_TO && f.hours > 0) active.add(f.month);
      }
      return {
        client: r.client,
        revenue: r.revenue!,
        annualizedRevenue: (r.revenue! * 12) / REV_MONTHS,
        hours: r.hours,
        cost: r.cost!,
        hoursPerThousand: (r.hours / r.revenue!) * 1000,
        marginPct: r.marginPct,
        activeMonths: active.size,
      };
    })
    .filter((c) => c.activeMonths >= 4)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue);
}

/** The n candidates closest to the target revenue (on a log scale, so $200K
 *  is as far from $400K as $2M is from $4M). */
export function suggestComparables(candidates: Comparable[], annualRevenue: number, n = 3): Comparable[] {
  const target = Math.log(Math.max(1, annualRevenue));
  return [...candidates]
    .sort((a, b) => Math.abs(Math.log(a.annualizedRevenue) - target) - Math.abs(Math.log(b.annualizedRevenue) - target))
    .slice(0, n);
}

export interface RampCurve {
  /** Hours in month m ÷ steady-state hours, m = 1…12 (months 1–6 smoothed to
   *  never step back; months 7–12 = 1 by definition). */
  factors: number[];
  /** Raw medians for months 1–6, before smoothing (empty when flat). */
  observed: number[];
  /** New clients the curve was measured on. */
  clients: number;
  basis: "agency" | "all agencies" | "flat";
}

/** Onboarding ramp observed on clients that started inside the data window. */
export function rampCurve(agencyId: string): RampCurve {
  const measure = (filter: (c: FtClient) => boolean) => {
    const series: number[][] = [];
    for (const c of clients) {
      if (c.internal || !filter(c) || c.firstMonth < AGENCY_DATA_START[c.agencyId] + RAMP_START_BUFFER) continue;
      if (MODEL.months.length - c.firstMonth < RAMP_MIN_HISTORY) continue;
      const h = new Array(12).fill(0);
      for (const f of facts) {
        if (f.client !== c.index || f.time !== "client") continue;
        const m = f.month - c.firstMonth;
        if (m >= 0 && m < 12) h[m] += f.hours;
      }
      const observed = Math.min(12, MODEL.months.length - c.firstMonth);
      const steadyMonths = h.slice(6, observed);
      const steady = steadyMonths.reduce((a, b) => a + b, 0) / steadyMonths.length;
      if (!(steady >= RAMP_MIN_STEADY_HOURS)) continue;
      series.push(h.slice(0, 6).map((v) => v / steady));
    }
    return series;
  };
  let series = measure((c) => c.agencyId === agencyId);
  let basis: RampCurve["basis"] = "agency";
  if (series.length < RAMP_MIN_CLIENTS) {
    series = measure(() => true);
    basis = "all agencies";
  }
  if (series.length < RAMP_MIN_CLIENTS) {
    return { factors: new Array(12).fill(1), observed: [], clients: series.length, basis: "flat" };
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const observed = [0, 1, 2, 3, 4, 5].map((m) => median(series.map((s) => s[m])));
  return { factors: [...monotone(observed), 1, 1, 1, 1, 1, 1], observed, clients: series.length, basis };
}

/**
 * Pool-adjacent-violators (isotonic regression): the closest non-decreasing
 * sequence to `xs`. Medians over a dozen clients are noisy; a staffing plan
 * should not step back mid-onboarding.
 */
function monotone(xs: number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const x of xs) {
    blocks.push({ sum: x, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => new Array(b.n).fill(b.sum / b.n));
}

export interface PlanRole {
  key: string;
  label: string;
  /** Share of the comparables' client hours. */
  share: number;
  /** Agency cost per hour for this role, trailing 12 months. */
  rate: number;
  monthlyHours: number[];
  yearHours: number;
  yearCost: number;
  runRateFte: number;
  peakFte: number;
  /** Roles merged into "Other roles". */
  members?: string[];
}

export interface StaffingPlan {
  annualRevenue: number;
  comparables: Comparable[];
  /** Σ comparables' hours ÷ Σ comparables' revenue. */
  hoursPerDollar: number;
  steadyMonthlyHours: number;
  ramp: RampCurve;
  roles: PlanRole[];
  monthlyHours: number[];
  monthlyCost: number[];
  yearHours: number;
  yearCost: number;
  yearMargin: number;
  yearMarginPct: number;
  runRateCost: number;
  runRateMargin: number;
  runRateMarginPct: number;
  runRateFte: number;
  peakFte: number;
  /** Comparables' own portfolio margin %, for the cross-check. */
  comparablesMarginPct: number | null;
  ratesWindow: string;
  /** Agency average cost per costed hour (fallback rate). */
  agencyRate: number;
  /** Roles with no cost on file in the agency, priced at the agency average. */
  fallbackRoles: string[];
}

export function staffingPlan(
  agencyId: string,
  annualRevenue: number,
  comparables: Comparable[],
  basis: CostBasis
): StaffingPlan | null {
  if (comparables.length === 0 || annualRevenue <= 0) return null;
  const compIds = new Set(comparables.map((c) => c.client.index));
  const compRevenue = comparables.reduce((a, c) => a + c.revenue, 0);
  const compHours = comparables.reduce((a, c) => a + c.hours, 0);
  const compCost = comparables.reduce((a, c) => a + c.cost, 0);
  const hoursPerDollar = compHours / compRevenue;
  const steadyMonthlyHours = (annualRevenue * hoursPerDollar) / 12;

  // Role mix of the comparables over the revenue window.
  const roleHours = new Map<number, number>();
  // Agency-wide cost per hour by role, trailing 12 months.
  // Rates divide by the hours that carry a cost, so employees with no cost rate
  // on file don't drag a role's rate toward zero.
  const rateAcc = new Map<number, { hours: number; cost: number }>();
  for (const f of facts) {
    if (f.time !== "client") continue;
    if (compIds.has(f.client) && f.month >= REV_FROM && f.month <= REV_TO) {
      roleHours.set(f.role, (roleHours.get(f.role) ?? 0) + f.hours);
    }
    if (clients[f.client].agencyId === agencyId && f.month >= RATE_FROM && f.month <= RATE_TO) {
      const r = rateAcc.get(f.role) ?? { hours: 0, cost: 0 };
      r.hours += f.costedHours;
      r.cost += costOf(f, basis);
      rateAcc.set(f.role, r);
    }
  }
  const totalRoleHours = [...roleHours.values()].reduce((a, b) => a + b, 0);
  const ramp = rampCurve(agencyId);
  let agencyCost = 0;
  let agencyCostedHours = 0;
  for (const r of rateAcc.values()) {
    agencyCost += r.cost;
    agencyCostedHours += r.hours;
  }
  const agencyRate = agencyCostedHours > 0 ? agencyCost / agencyCostedHours : 0;
  const fallbackRoles: string[] = [];
  const rateOf = (role: number) => {
    const r = rateAcc.get(role);
    if (r && r.hours > 0 && r.cost > 0) return r.cost / r.hours;
    fallbackRoles.push(MODEL.roles[role]);
    return agencyRate;
  };

  const major: { key: string; label: string; share: number; rate: number; members?: string[] }[] = [];
  let otherShare = 0;
  let otherCostWeight = 0;
  const otherMembers: string[] = [];
  for (const [role, h] of [...roleHours.entries()].sort((a, b) => b[1] - a[1])) {
    if (h <= 0) continue;
    const share = h / totalRoleHours;
    if (share >= ROLE_MIN_SHARE) {
      major.push({ key: String(role), label: MODEL.roles[role], share, rate: rateOf(role) });
    } else {
      otherShare += share;
      otherCostWeight += share * rateOf(role);
      otherMembers.push(MODEL.roles[role]);
    }
  }
  if (otherShare > 0) {
    major.push({ key: "other", label: "Other roles", share: otherShare, rate: otherCostWeight / otherShare, members: otherMembers });
  }

  const roles: PlanRole[] = major.map((r) => {
    const monthlyHours = ramp.factors.map((f) => steadyMonthlyHours * r.share * f);
    const yearHours = monthlyHours.reduce((a, b) => a + b, 0);
    return {
      ...r,
      monthlyHours,
      yearHours,
      yearCost: yearHours * r.rate,
      runRateFte: (steadyMonthlyHours * r.share) / FTE_HOURS_PER_MONTH,
      peakFte: Math.max(...monthlyHours) / FTE_HOURS_PER_MONTH,
    };
  });

  const monthlyHours = ramp.factors.map((_, m) => roles.reduce((a, r) => a + r.monthlyHours[m], 0));
  const monthlyCost = ramp.factors.map((_, m) => roles.reduce((a, r) => a + r.monthlyHours[m] * r.rate, 0));
  const yearHours = monthlyHours.reduce((a, b) => a + b, 0);
  const yearCost = monthlyCost.reduce((a, b) => a + b, 0);
  const runRateCost = roles.reduce((a, r) => a + steadyMonthlyHours * r.share * r.rate, 0) * 12;

  return {
    annualRevenue,
    comparables,
    hoursPerDollar,
    steadyMonthlyHours,
    ramp,
    roles,
    monthlyHours,
    monthlyCost,
    yearHours,
    yearCost,
    yearMargin: annualRevenue - yearCost,
    yearMarginPct: (annualRevenue - yearCost) / annualRevenue,
    runRateCost,
    runRateMargin: annualRevenue - runRateCost,
    runRateMarginPct: (annualRevenue - runRateCost) / annualRevenue,
    runRateFte: steadyMonthlyHours / FTE_HOURS_PER_MONTH,
    peakFte: Math.max(...monthlyHours) / FTE_HOURS_PER_MONTH,
    comparablesMarginPct: ratio(compRevenue - compCost, compRevenue),
    ratesWindow: periodLabel(RATE_FROM, RATE_TO),
    agencyRate,
    fallbackRoles: [...new Set(fallbackRoles)],
  };
}

export const REVENUE_WINDOW = { from: REV_FROM, to: REV_TO, months: REV_MONTHS, label: periodLabel(REV_FROM, REV_TO) };
