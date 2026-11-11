// lib/format/local-media.ts
/**
 * Local Media (Exec KPI Dashboard → Local Media) — pure math, no Firebase.
 *
 * Replicates Adriana's "Local Media" sheet: MIR booked net (NET_ORDERED_CAD)
 * by media channel × local-media tag (FOREIGN / HYBRID / LOCAL), US-focused
 * clients excluded. HYBRID dollars are then split into local and foreign with a
 * per-year, per-channel proxy (share that is local), giving:
 *   Total Media LMI   = local / total, every channel
 *   Digital Media LMI = local / total, digital channels only
 * Every ratio is sum / sum, never an average of per-row ratios.
 */

export type LocalMediaTag = "FOREIGN" | "HYBRID" | "LOCAL";

/** One `local_media_mix` doc (scripts/sync-local-media-mix.mjs). */
export interface LocalMediaRow {
  PLUSCO_YEAR: string;
  MONTH: string; // "YYYY-MM"
  AGENCY: string | null;
  PLUSCO_CLIENT_NAME: string | null;
  PLUSCO_MEDIA_CHANNEL: string;
  PLUSCO_LOCAL_MEDIA: LocalMediaTag;
  US_FOCUSED: boolean;
  SOURCE: string | null;
  NET_ORDERED_CAD: number;
  /** Same grain in the previous monthly MIR pull (0 when absent). */
  NET_ORDERED_CAD_PREV?: number;
  PREV_SOURCE?: string | null;
  /** Forecaster client id; absent for MIR clients that aren't Forecaster clients. */
  _clientId?: string;
}

/** Which MIR pull to roll up: the current one or the previous month's. */
export type LocalMediaAmount = "NET_ORDERED_CAD" | "NET_ORDERED_CAD_PREV";

/** How a channel's HYBRID dollars split. `local` is a 0–1 share; foreign = 1 − local. */
export interface LocalMediaProxy {
  local: number;
  source: string;
  note?: string;
}

/** Proxies per year (string key) per channel name. */
export type LocalMediaProxies = Record<string, Record<string, LocalMediaProxy>>;

/** Channels whose HYBRID dollars get a proxy (the only hybrid channels in MIR). */
export const PROXY_CHANNELS = ["OOH", "Print", "Programmatic"] as const;

/**
 * Adriana's proxies (PLUSCO EXEC KPIS sheet, Local Media tab, 2026-11-11). Used
 * until an admin saves config/local_media_proxies; a saved year replaces these.
 */
export const DEFAULT_LOCAL_MEDIA_PROXIES: LocalMediaProxies = {
  "2026": {
    OOH: { local: 0.9, source: "Billups report", note: "AN_PlusCo x billups Spend Report (as of August 4, 2026)" },
    Print: { local: 1, source: "Billups report", note: "AN_PlusCo x billups Spend Report (as of August 4, 2026)" },
    Programmatic: { local: 0.53, source: "DV360 report", note: "Without BRP & YouTube, Jan–May 2026" },
  },
  "2025": {
    OOH: { local: 0.84, source: "Billups report" },
    Print: { local: 1, source: "Billups report" },
    Programmatic: { local: 0.68, source: "DV360 report", note: "Without BRP & YouTube, Jan–Dec 2025" },
  },
};

/** Digital channels for Digital Media LMI (same set as Media Investments). */
const DIGITAL = new Set(["DIGITAL DIRECT", "PROGRAMMATIC", "SEM", "SOCIAL"]);
export const isDigitalChannel = (channel: string) => DIGITAL.has(channel.trim().toUpperCase());

export interface TagRow {
  channel: string;
  foreign: number;
  hybrid: number;
  local: number;
  total: number;
}

export interface HybridSplitRow {
  channel: string;
  hybrid: number;
  proxy: LocalMediaProxy | null;
  toLocal: number;
  toForeign: number;
}

export interface SplitRow {
  channel: string;
  foreign: number;
  local: number;
  /** HYBRID dollars left unsplit (channel with no proxy for the year). */
  unsplit: number;
  total: number;
  shareOfTotal: number | null;
}

export interface LocalMediaSummary {
  byTag: TagRow[];
  tagTotal: TagRow;
  hybridSplit: HybridSplitRow[];
  split: SplitRow[];
  splitTotal: SplitRow;
  digital: SplitRow;
  totalLmi: number | null;
  digitalLmi: number | null;
  /** Channels with HYBRID dollars but no proxy for the year. */
  missingProxies: string[];
}

const ratio = (a: number, b: number) => (b ? a / b : null);

/** Rolls the in-scope rows (US-focused already removed) up to the two tables. */
export function summarizeLocalMedia(
  rows: readonly LocalMediaRow[],
  proxies: Record<string, LocalMediaProxy> | undefined,
  amount: LocalMediaAmount = "NET_ORDERED_CAD"
): LocalMediaSummary {
  const byChannel = new Map<string, TagRow>();
  for (const r of rows) {
    const channel = r.PLUSCO_MEDIA_CHANNEL.trim();
    let t = byChannel.get(channel);
    if (!t) byChannel.set(channel, (t = { channel, foreign: 0, hybrid: 0, local: 0, total: 0 }));
    const v = Number(r[amount]) || 0;
    if (r.PLUSCO_LOCAL_MEDIA === "FOREIGN") t.foreign += v;
    else if (r.PLUSCO_LOCAL_MEDIA === "HYBRID") t.hybrid += v;
    else if (r.PLUSCO_LOCAL_MEDIA === "LOCAL") t.local += v;
    else continue;
    t.total += v;
  }
  const byTag = [...byChannel.values()].sort((a, b) => a.channel.localeCompare(b.channel));
  const sumTag = (label: string, list: TagRow[]): TagRow =>
    list.reduce(
      (acc, t) => ({ ...acc, foreign: acc.foreign + t.foreign, hybrid: acc.hybrid + t.hybrid, local: acc.local + t.local, total: acc.total + t.total }),
      { channel: label, foreign: 0, hybrid: 0, local: 0, total: 0 }
    );
  const tagTotal = sumTag("Grand Total", byTag);

  const proxyFor = (channel: string): LocalMediaProxy | null => {
    if (!proxies) return null;
    const key = Object.keys(proxies).find((k) => k.toUpperCase() === channel.toUpperCase());
    return key ? proxies[key] : null;
  };

  const hybridSplit: HybridSplitRow[] = [];
  const missingProxies: string[] = [];
  const splitBase = byTag.map((t) => {
    const proxy = t.hybrid ? proxyFor(t.channel) : null;
    let toLocal = 0;
    let toForeign = 0;
    let unsplit = 0;
    if (t.hybrid) {
      if (proxy) {
        toLocal = t.hybrid * proxy.local;
        toForeign = t.hybrid - toLocal;
      } else {
        unsplit = t.hybrid;
        missingProxies.push(t.channel);
      }
      hybridSplit.push({ channel: t.channel, hybrid: t.hybrid, proxy, toLocal, toForeign });
    }
    return { channel: t.channel, foreign: t.foreign + toForeign, local: t.local + toLocal, unsplit, total: t.total };
  });

  const total = splitBase.reduce((s, r) => s + r.total, 0);
  const split: SplitRow[] = splitBase.map((r) => ({ ...r, shareOfTotal: ratio(r.total, total) }));
  const sumSplit = (label: string, list: SplitRow[]): SplitRow => {
    const s = list.reduce(
      (acc, r) => ({ foreign: acc.foreign + r.foreign, local: acc.local + r.local, unsplit: acc.unsplit + r.unsplit, total: acc.total + r.total }),
      { foreign: 0, local: 0, unsplit: 0, total: 0 }
    );
    return { channel: label, ...s, shareOfTotal: null };
  };
  const splitTotal = sumSplit("Grand Total", split);
  const digital = sumSplit("Digital Media", split.filter((r) => isDigitalChannel(r.channel)));

  return {
    byTag,
    tagTotal,
    hybridSplit,
    split,
    splitTotal,
    digital,
    totalLmi: ratio(splitTotal.local, splitTotal.total),
    digitalLmi: ratio(digital.local, digital.total),
    missingProxies,
  };
}

/** Month number (1–12) of a "YYYY-MM" MONTH value, or null. */
export function localMediaMonth(r: Pick<LocalMediaRow, "MONTH">): number | null {
  const m = /^\d{4}-(\d{2})/.exec(r.MONTH ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}
