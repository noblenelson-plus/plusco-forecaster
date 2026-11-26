// lib/format/investment-deals.ts

/**
 * Pure roll-ups for the Exec KPI investments pages (Media YOY, PCC Deals,
 * Broadcast), over `investment_deals_mix` rows (MIR booked net, synced by
 * scripts/sync-investment-deals-mix.mjs from PCC_Dashboard_NATIVE). Firebase-free.
 *
 * Every figure is a plain sum of NET_ORDERED_CAD over the rows kept by
 * `scopeInvestmentRows` — no averaging of shares, no recomputed business logic:
 * the deal type / category / channel and vendor market / language come from the
 * MIR as tagged (Vendor DB 2.0 + the 2026 deals key).
 */

export interface InvestmentDealsRow {
  PLUSCO_YEAR: string;
  /** "YYYY-MM". */
  MONTH: string;
  AGENCY: string | null;
  OFFICE: string | null;
  PLUSCO_CLIENT_NAME: string | null;
  PLUSCO_MEDIA_CHANNEL: string | null;
  PLUSCO_MEDIA_PARTNER: string | null;
  PLUSCO_PROGRAMMATIC: string | null;
  PLUSCO_2026_DEALS: string | null;
  PLUSCO_DEALS_Type: string | null;
  PLUSCO_DEALS_Category: string | null;
  PLUSCO_DEALS_Channel: string | null;
  PLUSCO_VENDOR_MARKET: string | null;
  PLUSCO_VENDOR_LANGUAGE: string | null;
  NET_ORDERED_CAD: number;
  SOURCE?: string | null;
  _clientId?: string | null;
}

/** Shown for a blank / "#N/A" / null tag. */
export const UNTAGGED = "Not tagged";

/** Trimmed tag, or UNTAGGED for blank / "#N/A" / "null". */
export function tag(v: string | null | undefined): string {
  const s = (v ?? "").toString().trim();
  return s === "" || s === "#N/A" || s.toLowerCase() === "null" ? UNTAGGED : s;
}

export const net = (r: InvestmentDealsRow) => Number(r.NET_ORDERED_CAD) || 0;

/** 1–12 from "YYYY-MM", else null. */
export function rowMonth(r: InvestmentDealsRow): number | null {
  const m = Number(String(r.MONTH ?? "").slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}

/** "Q1".."Q4" from the row month. */
export function rowQuarter(r: InvestmentDealsRow): string | null {
  const m = rowMonth(r);
  return m === null ? null : `Q${Math.ceil(m / 3)}`;
}

export interface InvestmentScope {
  /** Lowercased Forecaster client names in the dashboard filter scope. */
  clientNames: ReadonlySet<string>;
  /** Also keep MIR rows of clients that aren't Forecaster clients (no `_clientId`). */
  includeUnlinked: boolean;
  /** Months kept (1–12); empty = full year. */
  months: readonly number[];
}

/**
 * Rows of the given years kept by the dashboard scope (client filter, months).
 * Same client rule as Local Media: Forecaster clients by name; non-Forecaster
 * MIR clients only while no dashboard filter is active, so totals match Looker.
 */
export function scopeInvestmentRows(
  rows: readonly InvestmentDealsRow[],
  years: readonly number[],
  scope: InvestmentScope
): InvestmentDealsRow[] {
  const yearSet = new Set(years.map(String));
  const monthSet = scope.months.length ? new Set(scope.months) : null;
  return rows.filter((r) => {
    if (!yearSet.has(String(r.PLUSCO_YEAR))) return false;
    const inClients = scope.clientNames.has(String(r.PLUSCO_CLIENT_NAME ?? "").trim().toLowerCase());
    if (!inClients && !(scope.includeUnlinked && !r._clientId)) return false;
    if (monthSet) {
      const m = rowMonth(r);
      if (m === null || !monthSet.has(m)) return false;
    }
    return true;
  });
}

/** Unlinked (non-Forecaster) client names kept in `rows`, by spend desc. */
export function unlinkedClients(rows: readonly InvestmentDealsRow[]): { names: string[]; total: number } {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r._clientId) continue;
    const n = r.PLUSCO_CLIENT_NAME?.trim() || "No client name";
    by.set(n, (by.get(n) ?? 0) + net(r));
  }
  const kept = [...by.entries()].filter(([, v]) => Math.round(v) !== 0).sort((a, b) => b[1] - a[1]);
  return { names: kept.map(([n]) => n), total: kept.reduce((t, [, v]) => t + v, 0) };
}

/** Sum by a key; returns entries sorted by value desc. */
export function sumBy(
  rows: readonly InvestmentDealsRow[],
  key: (r: InvestmentDealsRow) => string
): { key: string; net: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + net(r));
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, net: v })).sort((a, b) => b.net - a.net);
}

export const total = (rows: readonly InvestmentDealsRow[]) => rows.reduce((t, r) => t + net(r), 0);

// ─── Media YOY ───────────────────────────────────────────────────────────────

export interface YoyLine {
  key: string;
  prev: number;
  cur: number;
  /** Extra label columns (e.g. deal + deal type for a partner). */
  extra?: string[];
}

/** cur vs prev by a key, sorted by current spend desc. */
export function yoyBy(
  rows: readonly InvestmentDealsRow[],
  year: number,
  key: (r: InvestmentDealsRow) => string
): YoyLine[] {
  const m = new Map<string, YoyLine>();
  for (const r of rows) {
    const k = key(r);
    let l = m.get(k);
    if (!l) m.set(k, (l = { key: k, prev: 0, cur: 0 }));
    if (String(r.PLUSCO_YEAR) === String(year)) l.cur += net(r);
    else if (String(r.PLUSCO_YEAR) === String(year - 1)) l.prev += net(r);
  }
  return [...m.values()].sort((a, b) => b.cur - a.cur || b.prev - a.prev);
}

/**
 * Partner YoY lines with the partner's 2026 deal and deal type (the label that
 * carries the most current-year spend, else last year's), as in Looker's Top 20.
 */
export function partnerYoy(rows: readonly InvestmentDealsRow[], year: number): YoyLine[] {
  const lines = yoyBy(rows, year, (r) => tag(r.PLUSCO_MEDIA_PARTNER));
  const labels = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const p = tag(r.PLUSCO_MEDIA_PARTNER);
    const label = `${tag(r.PLUSCO_2026_DEALS)}\u0000${tag(r.PLUSCO_DEALS_Type)}`;
    const weight = (String(r.PLUSCO_YEAR) === String(year) ? 1e12 : 0) + Math.abs(net(r));
    let m = labels.get(p);
    if (!m) labels.set(p, (m = new Map()));
    m.set(label, (m.get(label) ?? 0) + weight);
  }
  for (const l of lines) {
    const best = [...(labels.get(l.key)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    l.extra = best.split("\u0000");
  }
  return lines;
}

// ─── PCC Deals ───────────────────────────────────────────────────────────────

/** Looker's "Labs Deals" table: Labs + Labs - BRP (BRP's own Labs premium pubs). */
export const LABS_DEAL_TYPES = ["Labs", "Labs - BRP"];
export const isLabsDeal = (r: InvestmentDealsRow) => LABS_DEAL_TYPES.includes(tag(r.PLUSCO_DEALS_Type));
export const isDealType = (type: string) => (r: InvestmentDealsRow) => tag(r.PLUSCO_DEALS_Type) === type;

export interface DealTreeLine {
  category: string;
  channel: string;
  partner: string;
  net: number;
}

/** Category → deals channel → partner lines (sorted by category, channel, then spend desc). */
export function dealTree(rows: readonly InvestmentDealsRow[]): DealTreeLine[] {
  const m = new Map<string, DealTreeLine>();
  for (const r of rows) {
    const line = {
      category: tag(r.PLUSCO_DEALS_Category),
      channel: tag(r.PLUSCO_DEALS_Channel),
      partner: tag(r.PLUSCO_MEDIA_PARTNER),
    };
    const k = `${line.category}\u0000${line.channel}\u0000${line.partner}`;
    const cur = m.get(k);
    if (cur) cur.net += net(r);
    else m.set(k, { ...line, net: net(r) });
  }
  return [...m.values()]
    .filter((l) => Math.round(l.net) !== 0)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.channel.localeCompare(b.channel) || b.net - a.net
    );
}

export interface Matrix {
  rows: { label: string[]; cells: Record<string, number>; total: number }[];
  columns: string[];
  columnTotals: Record<string, number>;
  total: number;
}

/**
 * Pivot: one line per `rowKey` tuple, one column per `colKey` value. Columns in
 * `columnOrder` first (in that order), then the rest by total desc.
 */
export function pivot(
  rows: readonly InvestmentDealsRow[],
  rowKey: (r: InvestmentDealsRow) => string[],
  colKey: (r: InvestmentDealsRow) => string,
  columnOrder: readonly string[] = []
): Matrix {
  const lines = new Map<string, { label: string[]; cells: Record<string, number>; total: number }>();
  const colTotals: Record<string, number> = {};
  let grand = 0;
  for (const r of rows) {
    const label = rowKey(r);
    const k = label.join("\u0000");
    let l = lines.get(k);
    if (!l) lines.set(k, (l = { label, cells: {}, total: 0 }));
    const c = colKey(r);
    const v = net(r);
    l.cells[c] = (l.cells[c] ?? 0) + v;
    l.total += v;
    colTotals[c] = (colTotals[c] ?? 0) + v;
    grand += v;
  }
  const rest = Object.keys(colTotals)
    .filter((c) => !columnOrder.includes(c))
    .sort((a, b) => colTotals[b] - colTotals[a]);
  const columns = [...columnOrder.filter((c) => c in colTotals), ...rest];
  return {
    rows: [...lines.values()]
      .filter((l) => Math.round(l.total) !== 0)
      .sort((a, b) => a.label.slice(0, -1).join().localeCompare(b.label.slice(0, -1).join()) || b.total - a.total),
    columns,
    columnTotals: colTotals,
    total: grand,
  };
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

export const BROADCAST_CHANNELS = ["TV", "Radio"];
export const isBroadcast = (r: InvestmentDealsRow) => BROADCAST_CHANNELS.includes(tag(r.PLUSCO_MEDIA_CHANNEL));
