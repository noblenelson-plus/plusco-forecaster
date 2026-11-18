// lib/programmatic/aggregate.ts

/**
 * Pure roll-ups for the Programmatic (preview) page. No Firebase.
 */

import type { LocalCategory, MirRow, ProgDsp, ProgRow } from "./programmatic.types";

export const ALL_DSPS: ProgDsp[] = ["DV360", "Amazon", "TTD", "Yahoo", "Quantcast", "StackAdapt"];
export const LOCAL_ORDER: LocalCategory[] = ["LOCAL", "HYBRID", "FOREIGN", "UNKNOWN", "UNMAPPED"];
/** Plain-language names, for readers who don't know the naming tab's codes. */
export const LOCAL_LABELS: Record<LocalCategory, string> = {
  LOCAL: "Canadian",
  HYBRID: "Mixed (Canadian + global)",
  FOREIGN: "Foreign",
  UNKNOWN: "Known partner, no category",
  UNMAPPED: "Not identified yet",
};

/** One-line definitions, shown in the "What do these terms mean?" box. */
export const LOCAL_DEFINITIONS: Record<LocalCategory, string> = {
  LOCAL: "Canadian-owned media (e.g. Bell Media, Postmedia, CBC, Toronto Star, Village Media).",
  HYBRID: "Sellers with both Canadian and global inventory, such as Google/YouTube, Amazon/Prime Video and ad exchanges like Magnite or Index.",
  FOREIGN: "Media owned outside Canada (e.g. Netflix, Spotify, The Weather Company).",
  UNKNOWN: "A Plus media partner that has no Canadian/foreign category in the naming list yet.",
  UNMAPPED: "The DSP report doesn't name the publisher clearly enough to match it to a Plus media partner (yet).",
};

/** Plain status per DSP for the "How complete is this?" panel. */
export const DSP_STATUS_TEXT: Record<ProgDsp, string> = {
  DV360: "Most accounts. OLG, Globe and Mail, Novo Nordisk, Gov. of Canada and Pursuit are not in the feed yet.",
  Amazon: "All accounts, January to November 17.",
  TTD: "OLG and BCLC, January to November 17.",
  Yahoo: "BRP accounts only. Publisher detail for part of the year only.",
  Quantcast: "Not connected yet. Only the amount booked in MediaOcean is shown.",
  StackAdapt: "Not connected yet. Only the amount booked in MediaOcean is shown.",
};

/** What each DSP's numbers are built from and what is known to be missing (technical detail). */
export const DSP_SOURCE_NOTES: Record<ProgDsp, string> = {
  DV360:
    "BigQuery (Jan–Jun manual upload, then the plus-collect pipeline). Deals mapped through Harshal's SDF file. The feed covers 8 partners: OLG (Monks), Globe and Mail, Novo Nordisk, Gov. of Canada and Pursuit are missing.",
  Amazon: "Harshal's Amazon YTD export (Jan 1 – Nov 17): deals, site/app and supply source. Complete.",
  TTD: "Harshal's TTD YTD export, OLG + BCLC seats (Jan 1 – Nov 17). Publisher from the deal name; open market has no site in the export.",
  Yahoo:
    "BRP seats only. The YTD exports stopped at Yahoo's 1M-row limit, so missing months come from the template's Yahoo tab (deal level, no publisher), which uses a different spend metric.",
  Quantcast: "No DSP data yet. MIR booked spend only.",
  StackAdapt: "No DSP data yet. MIR booked spend only.",
};

export interface ProgFilters {
  dsps: Set<ProgDsp>;
  /** null = every client */
  client: string | null;
  /** Inclusive "YYYY-MM" bounds. */
  from: string;
  to: string;
}

export function filterRows<T extends { dsp: ProgDsp; month: string; client: string }>(rows: T[], f: ProgFilters): T[] {
  return rows.filter(
    (r) => f.dsps.has(r.dsp) && r.month >= f.from && r.month <= f.to && (f.client === null || r.client === f.client)
  );
}

export const sumSpend = (rows: ProgRow[]) => rows.reduce((s, r) => s + r.spendCad, 0);

export function byLocal(rows: ProgRow[]): Record<LocalCategory, number> {
  const out = Object.fromEntries(LOCAL_ORDER.map((l) => [l, 0])) as Record<LocalCategory, number>;
  for (const r of rows) out[r.local] = (out[r.local] ?? 0) + r.spendCad;
  return out;
}

/** 12 monthly points per local category (index 0 = January). */
export function monthlyByLocal(rows: ProgRow[]): Record<LocalCategory, number[]> {
  const out = Object.fromEntries(LOCAL_ORDER.map((l) => [l, Array(12).fill(0)])) as Record<LocalCategory, number[]>;
  for (const r of rows) {
    const m = Number(r.month.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) out[r.local][m] += r.spendCad;
  }
  return out;
}

export interface DspCoverage {
  dsp: ProgDsp;
  dataCad: number;
  mirCad: number;
  mappedCad: number;
  localCad: number;
  months: string[];
  sources: string[];
}

export function coverageByDsp(rows: ProgRow[], mir: MirRow[], dsps: ProgDsp[]): DspCoverage[] {
  return dsps.map((dsp) => {
    const rs = rows.filter((r) => r.dsp === dsp);
    return {
      dsp,
      dataCad: sumSpend(rs),
      mirCad: mir.filter((m) => m.dsp === dsp).reduce((s, m) => s + m.mirCad, 0),
      mappedCad: sumSpend(rs.filter((r) => r.local !== "UNMAPPED")),
      localCad: sumSpend(rs.filter((r) => r.local === "LOCAL")),
      months: [...new Set(rs.map((r) => r.month))].sort(),
      sources: [...new Set(rs.map((r) => r.source))].sort(),
    };
  });
}

export interface PublisherLine {
  publisher: string;
  partner: string;
  local: LocalCategory;
  spendCad: number;
  impressions: number;
  dsps: ProgDsp[];
  clients: number;
}

/** Spend per publisher (the Plus partner when mapped), biggest first. */
export function publishers(rows: ProgRow[]): PublisherLine[] {
  const m = new Map<string, PublisherLine & { _d: Set<ProgDsp>; _c: Set<string> }>();
  for (const r of rows) {
    const key = `${r.partner}\u0001${r.publisher}`;
    let p = m.get(key);
    if (!p) {
      p = { publisher: r.publisher, partner: r.partner, local: r.local, spendCad: 0, impressions: 0, dsps: [], clients: 0, _d: new Set(), _c: new Set() };
      m.set(key, p);
    }
    p.spendCad += r.spendCad;
    p.impressions += r.impressions;
    p._d.add(r.dsp);
    p._c.add(r.client);
  }
  return [...m.values()]
    .map(({ _d, _c, ...p }) => ({ ...p, dsps: ALL_DSPS.filter((d) => _d.has(d)), clients: _c.size }))
    .sort((a, b) => b.spendCad - a.spendCad);
}

export interface ClientLine {
  client: string;
  spendCad: number;
  mirCad: number;
  local: Record<LocalCategory, number>;
  dsps: ProgDsp[];
}

/** Per client: DSP data spend, its local split and MIR booked spend (same filters). */
export function clients(rows: ProgRow[], mir: MirRow[]): ClientLine[] {
  const m = new Map<string, ClientLine & { _d: Set<ProgDsp> }>();
  const get = (client: string) => {
    let c = m.get(client);
    if (!c) {
      c = { client, spendCad: 0, mirCad: 0, local: byLocal([]), dsps: [], _d: new Set() };
      m.set(client, c);
    }
    return c;
  };
  for (const r of rows) {
    const c = get(r.client);
    c.spendCad += r.spendCad;
    c.local[r.local] += r.spendCad;
    c._d.add(r.dsp);
  }
  for (const r of mir) {
    const c = get(r.client);
    c.mirCad += r.mirCad;
    c._d.add(r.dsp);
  }
  return [...m.values()]
    .map(({ _d, ...c }) => ({ ...c, dsps: ALL_DSPS.filter((d) => _d.has(d)) }))
    .sort((a, b) => Math.max(b.spendCad, b.mirCad) - Math.max(a.spendCad, a.mirCad));
}

/** Spend per deal type, biggest first. */
export function dealTypes(rows: ProgRow[]): { dealType: string; spendCad: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.dealType, (m.get(r.dealType) ?? 0) + r.spendCad);
  return [...m].map(([dealType, spendCad]) => ({ dealType, spendCad })).sort((a, b) => b.spendCad - a.spendCad);
}
