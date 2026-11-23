// filepath: lib/finance-toolkit/staffing.ts

/**
 * Finance Toolkit · Staffing — how much media each person manages, by client
 * and by GM pod. Pure compute (no React, no Firebase).
 *
 *   spend        MediaOcean net ordered CAD over the window (build-staffing-data.mjs)
 *   hours        Maconomy client-work hours over the same months, on the
 *                accounts whose number is one of the client's GAIA numbers
 *   FTE-years    hours ÷ FTE_YEAR_HOURS (12 × FTE_HOURS_PER_MONTH)
 *   spend / FTE  spend ÷ FTE-years. Both sides cover the same months, so a
 *                client that started mid-window is not penalised.
 *   team size    hours ÷ (FTE_HOURS_PER_MONTH × months with hours): the average
 *                team while the account was active
 *
 * Hours are never money here, so CAD spend and USD-costed MEK US hours can be
 * compared directly. A client counts its whole team, whichever agency the
 * hours were logged in; the agency filter uses the client’s MediaOcean agency.
 * Role groups and levels are provisional (roles.ts).
 */

import { getFinanceToolkitData } from "./data-holder";
import { FTE_HOURS_PER_MONTH, MODEL, clientWorkIndex, peopleOn, ratio } from "./model";
import { ROLE_GROUPS, SENIORITY, roleGroup, seniority, type RoleGroup, type Seniority } from "./roles";
import type { FtStaffingClient, FtStaffingData } from "./finance-toolkit.types";

const DATA = getFinanceToolkitData();

export const STAFFING: FtStaffingData | null = DATA.staffing ?? null;

/** One full-time person's client hours in a year. */
export const FTE_YEAR_HOURS = 12 * FTE_HOURS_PER_MONTH;

/** Clients under either threshold are listed but left out of averages and pods. */
export const MIN_HOURS = 100;
export const MIN_SPEND = 50_000;

/** A pod is flagged when its spend per FTE is this far from the average. */
export const POD_HIGH = 1.5;
export const POD_LOW = 1 / 1.5;

/** Hours per campaign and tactics per $1M are shown only when at least this
 *  share of the client's spend is linked to MediaBox. */
export const MIN_MEDIABOX_SHARE = 0.5;

const monthIndex = (m: string) => MODEL.months.indexOf(m);

/** Window as fact month indices, or null when the staffing data is missing. */
export const STAFFING_WINDOW = STAFFING ? { from: monthIndex(STAFFING.from), to: monthIndex(STAFFING.to) } : null;

const GROUP_OF: RoleGroup[] = MODEL.roles.map(roleGroup);
const LEVEL_OF: Seniority[] = MODEL.roles.map(seniority);

/** Maconomy client number → non-internal account indices (any agency). */
const accountsByNumber = new Map<string, number[]>();
for (const c of MODEL.clients) {
  if (c.internal) continue;
  const list = accountsByNumber.get(c.number) ?? [];
  list.push(c.index);
  accountsByNumber.set(c.number, list);
}

/** Forecaster client → its linked Maconomy accounts (any agency). */
const accountsOfClient = new Map<string, number[]>(
  (STAFFING?.clients ?? []).map((c) => [c.id, [...new Set(c.gaia.flatMap((n) => accountsByNumber.get(n) ?? []))]]),
);

/** How many Forecaster clients share each account (a GAIA number listed on
 *  two clients). A shared account's hours are split evenly between them, so
 *  totals never count an hour twice. */
const sharers = new Map<number, number>();
for (const list of accountsOfClient.values()) for (const i of list) sharers.set(i, (sharers.get(i) ?? 0) + 1);
const shareOf = (account: number) => 1 / (sharers.get(account) ?? 1);

const emptyGroups = () => Object.fromEntries(ROLE_GROUPS.map((g) => [g, 0])) as Record<RoleGroup, number>;
const emptyLevels = () => Object.fromEntries(SENIORITY.map((l) => [l, 0])) as Record<Seniority, number>;

export interface StaffingRow {
  client: FtStaffingClient;
  /** Maconomy accounts (any agency) tied to the client by GAIA number. */
  accounts: number[];
  hours: number;
  monthsWithHours: number;
  /** Average team size while active (FTE). */
  teamFte: number | null;
  fteYears: number;
  people: number;
  spendPerFte: number | null;
  hoursPerMillion: number | null;
  /** Client hours ÷ unique MediaBox campaigns (finance_master_mapping), when it has any. */
  hoursPerCampaign: number | null;
  /** Unique MediaBox campaigns per $1M of media: the complexity measure that explains hours. */
  campaignsPerMillion: number | null;
  byGroup: Record<RoleGroup, number>;
  byLevel: Record<Seniority, number>;
  /** Big enough to count in averages and pods. */
  comparable: boolean;
}

export interface PodRow {
  pod: string;
  clients: number;
  spend: number;
  hours: number;
  fteYears: number;
  spendPerFte: number | null;
  /** Pod spend per FTE ÷ overall spend per FTE. */
  vsAverage: number | null;
  /** MediaBox campaigns per $1M of media, over the pod's clients with campaigns. */
  campaignsPerMillion: number | null;
  digitalShare: number | null;
}

export interface StaffingResult {
  rows: StaffingRow[];
  /** Clients with spend but no client hours (no GAIA number, or none of its accounts logged time). */
  noHours: FtStaffingClient[];
  pods: PodRow[];
  totals: {
    spend: number;
    hours: number;
    fteYears: number;
    spendPerFte: number | null;
    medianClientSpendPerFte: number | null;
    comparableClients: number;
    people: number;
    byGroup: Record<RoleGroup, number>;
    byLevel: Record<Seniority, number>;
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Which clients to include: the client and its linked Maconomy accounts. */
export type StaffingFilter = (client: FtStaffingClient, accounts: number[]) => boolean;

/** MediaOcean agencies present in the staffing data, largest spend first. */
export const STAFFING_AGENCIES: string[] = STAFFING
  ? [...new Set(STAFFING.clients.map((c) => c.agency).filter((a) => a && a !== "#N/A"))].sort(
      (a, b) =>
        STAFFING!.clients.filter((c) => c.agency === b).reduce((t, c) => t + c.spend, 0) -
        STAFFING!.clients.filter((c) => c.agency === a).reduce((t, c) => t + c.spend, 0),
    )
  : [];

export function staffing(include: StaffingFilter): StaffingResult | null {
  if (!STAFFING || !STAFFING_WINDOW || STAFFING_WINDOW.from < 0 || STAFFING_WINDOW.to < 0) return null;
  const { from, to } = STAFFING_WINDOW;
  const work = clientWorkIndex(from, to);

  const rows: StaffingRow[] = [];
  const noHours: FtStaffingClient[] = [];
  for (const client of STAFFING.clients) {
    const accounts = accountsOfClient.get(client.id) ?? [];
    if (!include(client, accounts)) continue;

    const byGroup = emptyGroups();
    const byLevel = emptyLevels();
    const months = new Set<number>();
    let hours = 0;
    for (const i of accounts) {
      const w = work.get(i);
      if (!w) continue;
      const share = shareOf(i);
      hours += w.hours * share;
      for (const m of w.byMonth.keys()) months.add(m);
      w.byRole.forEach((h, role) => {
        if (!h) return;
        byGroup[GROUP_OF[role]] += h * share;
        byLevel[LEVEL_OF[role]] += h * share;
      });
    }
    if (hours === 0) {
      noHours.push(client);
      continue;
    }

    const fteYears = hours / FTE_YEAR_HOURS;
    // A new client's team is often in place before its spend ramps up; its
    // spend per FTE counts only the hours from its first month of spend.
    let hoursForRatio = hours;
    if (client.isNew && client.firstMonth) {
      const first = monthIndex(client.firstMonth);
      hoursForRatio = 0;
      for (const i of accounts) {
        for (const [m, h] of work.get(i)?.byMonth ?? []) if (m >= first) hoursForRatio += h * shareOf(i);
      }
    }
    const campaigns = client.campaignComplexity?.campaigns ?? 0;
    rows.push({
      client,
      accounts,
      hours,
      monthsWithHours: months.size,
      teamFte: months.size ? hours / (FTE_HOURS_PER_MONTH * months.size) : null,
      fteYears,
      people: peopleOn(accounts, from, to),
      spendPerFte: ratio(client.spend, hoursForRatio / FTE_YEAR_HOURS),
      hoursPerMillion: client.spend > 0 ? hours / (client.spend / 1e6) : null,
      hoursPerCampaign: campaigns > 0 ? hours / campaigns : null,
      campaignsPerMillion: campaigns > 0 && client.spend > 0 ? campaigns / (client.spend / 1e6) : null,
      byGroup,
      byLevel,
      comparable: hours >= MIN_HOURS && client.spend >= MIN_SPEND,
    });
  }

  const comparable = rows.filter((r) => r.comparable);
  const spend = comparable.reduce((a, r) => a + r.client.spend, 0);
  const hours = comparable.reduce((a, r) => a + r.hours, 0);
  const overall = ratio(spend, hours / FTE_YEAR_HOURS);
  const byGroup = emptyGroups();
  const byLevel = emptyLevels();
  for (const r of comparable) {
    for (const g of ROLE_GROUPS) byGroup[g] += r.byGroup[g];
    for (const l of SENIORITY) byLevel[l] += r.byLevel[l];
  }

  const podMap = new Map<string, StaffingRow[]>();
  for (const r of comparable) {
    const pod = r.client.gmPod || "No GM pod";
    podMap.set(pod, [...(podMap.get(pod) ?? []), r]);
  }
  const pods: PodRow[] = [...podMap.entries()].map(([pod, rs]) => {
    const pSpend = rs.reduce((a, r) => a + r.client.spend, 0);
    const pHours = rs.reduce((a, r) => a + r.hours, 0);
    const spf = ratio(pSpend, pHours / FTE_YEAR_HOURS);
    const withCampaigns = rs.filter((r) => r.campaignsPerMillion !== null);
    const cmpSpend = withCampaigns.reduce((a, r) => a + r.client.spend, 0);
    const cmpCount = withCampaigns.reduce((a, r) => a + r.client.campaignComplexity!.campaigns, 0);
    return {
      pod,
      clients: rs.length,
      spend: pSpend,
      hours: pHours,
      fteYears: pHours / FTE_YEAR_HOURS,
      spendPerFte: spf,
      vsAverage: spf !== null && overall ? spf / overall : null,
      campaignsPerMillion: cmpSpend > 0 ? cmpCount / (cmpSpend / 1e6) : null,
      digitalShare: ratio(
        rs.reduce((a, r) => a + r.client.digitalSpend, 0),
        pSpend,
      ),
    };
  });
  pods.sort((a, b) => (b.spendPerFte ?? 0) - (a.spendPerFte ?? 0));

  return {
    rows,
    noHours,
    pods,
    totals: {
      spend,
      hours,
      fteYears: hours / FTE_YEAR_HOURS,
      spendPerFte: overall,
      medianClientSpendPerFte: median(comparable.map((r) => r.spendPerFte!).filter((v) => v !== null)),
      comparableClients: comparable.length,
      people: peopleOn(
        comparable.flatMap((r) => r.accounts),
        from,
        to,
      ),
      byGroup,
      byLevel,
    },
  };
}

// ─── Media spend for Account Profitability ───────────────────────────────────

const SPEND_MONTH_INDEX = (STAFFING?.spendMonths ?? []).map(monthIndex);

/** The Forecaster client(s) whose GAIA numbers include this Maconomy account. */
export function forecasterClientsOf(account: number): FtStaffingClient[] {
  if (!STAFFING) return [];
  return STAFFING.clients.filter((c) => (accountsOfClient.get(c.id) ?? []).includes(account));
}

/** A client's linked Maconomy accounts (any agency). */
export const accountsOf = (client: FtStaffingClient): number[] => accountsOfClient.get(client.id) ?? [];

/** MediaOcean spend (CAD) of a client over fact months [from, to]. */
export function spendBetween(client: FtStaffingClient, from: number, to: number): number {
  let total = 0;
  client.monthlySpend.forEach((v, i) => {
    const m = SPEND_MONTH_INDEX[i];
    if (m >= from && m <= to) total += v;
  });
  return total;
}
