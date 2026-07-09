// lib/services/mediabox-totals-service.ts

/**
 * Firestore service — read-only `mediabox_totals` collection (one doc per
 * {client, year}), plus the trigger that asks the MediaBox project to refresh
 * a client's totals.
 *
 * The forecaster never writes these docs directly: the MediaBox Cloud Function
 * (running in the other project) owns the writes. Here we only subscribe to the
 * doc and, when it is stale or missing, POST to our own `/api/mediabox-refresh`
 * server route, which forwards to MediaBox. The subsequent write lands back in
 * this collection and the live `onSnapshot` below picks it up — a clean
 * stale-while-revalidate loop with no polling.
 */

import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { MediaboxTotals, MediaboxTypeRow } from "../types/mediabox.types";
import type { MonthlyMap } from "../types/common.types";

const COLLECTION = "mediabox_totals";

/** Totals are considered stale once the last sync is older than this. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function buildMediaboxTotalsId(clientId: string, year: number): string {
  return `${clientId}_${year}`;
}

/**
 * Subscribe in real time to a client/year's MediaBox totals. `onData` receives
 * null until the doc exists. Returns the unsubscribe function.
 */
export function subscribeToMediaboxTotals(
  clientId: string,
  year: number,
  onData: (totals: MediaboxTotals | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION, buildMediaboxTotalsId(clientId, year));
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? (snap.data() as MediaboxTotals) : null),
    (err) => onError?.(err)
  );
}

/** True when totals are missing or older than the staleness window. */
export function isMediaboxTotalsStale(totals: MediaboxTotals | null): boolean {
  if (!totals?.syncedAt) return true;
  const synced = Date.parse(totals.syncedAt);
  if (isNaN(synced)) return true;
  return Date.now() - synced > STALE_AFTER_MS;
}

/**
 * Ask MediaBox to recompute this client/year. Fire-and-forget from the UI's
 * perspective — the fresh doc arrives via the `onSnapshot` subscription. Set
 * `force` to bypass the 24h freshness check (the manual "Refresh" button).
 */
export async function triggerMediaboxRefresh(
  clientId: string,
  year: number,
  force = false
): Promise<void> {
  const res = await fetch("/api/mediabox-refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forecasterClientId: clientId, year, force }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MediaBox refresh failed (${res.status}): ${detail}`);
  }
}

// ─── Conversion (USD → CAD, at read time) ─────────────────────────────────────

/** One axis converted to CAD: a 1..12 MonthlyMap and its yearly total. */
export interface MediaboxCadAxis {
  byMonth: MonthlyMap;
  total: number;
}

/**
 * Convert a per-currency monthly split to a single CAD MonthlyMap using the
 * year's USD→CAD rate. When the rate is missing, USD amounts are dropped (and
 * reported via `usdConverted: false`) rather than silently counted at parity.
 */
function splitToCad(
  byMonth: Record<number, { CAD: number; USD: number }>,
  usdToCad: number | undefined
): MediaboxCadAxis {
  const result: MonthlyMap = {};
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const cell = byMonth?.[m] ?? { CAD: 0, USD: 0 };
    const usd = usdToCad ? cell.USD * usdToCad : 0;
    const value = cell.CAD + usd;
    result[m] = value;
    total += value;
  }
  return { byMonth: result, total };
}

/** A campaign row converted to CAD. */
export interface MediaboxCadCampaign extends MediaboxCadAxis {
  name: string;
}

/** A breakdown group converted to CAD, with its campaigns. */
export interface MediaboxCadType extends MediaboxCadAxis {
  label: string;
  campaigns: MediaboxCadCampaign[];
}

function typeRowsToCad(
  rows: MediaboxTypeRow[] | undefined,
  usdToCad: number | undefined
): MediaboxCadType[] {
  if (!rows) return [];
  return rows.map((r) => {
    const axis = splitToCad(r.byMonth, usdToCad);
    return {
      label: r.label,
      byMonth: axis.byMonth,
      total: axis.total,
      campaigns: r.campaigns.map((c) => {
        const cAxis = splitToCad(c.byMonth, usdToCad);
        return { name: c.name, byMonth: cAxis.byMonth, total: cAxis.total };
      }),
    };
  });
}

/** One media type / partner as it appears nested under a campaign. */
export interface MediaboxCadTypeUnderCampaign extends MediaboxCadAxis {
  label: string;
}

/** A campaign group with the media types / partners that spent on it. */
export interface MediaboxCadCampaignGroup extends MediaboxCadAxis {
  name: string;
  types: MediaboxCadTypeUnderCampaign[];
}

/** Fallback group name for type rows that carry no campaign breakdown. */
const NO_CAMPAIGN_LABEL = "(No campaign)";

/**
 * Invert the type→campaign hierarchy into campaign→type: one group per campaign
 * name, listing the media types / partners that spent on it, with the campaign's
 * monthly totals summed across those types. Type rows without campaigns are
 * collected under a single "(No campaign)" group so no spend is dropped.
 */
export function groupByCampaign(
  types: MediaboxCadType[]
): MediaboxCadCampaignGroup[] {
  const groups = new Map<string, MediaboxCadCampaignGroup>();

  const add = (
    name: string,
    typeLabel: string,
    axis: MediaboxCadAxis
  ): void => {
    let g = groups.get(name);
    if (!g) {
      g = { name, byMonth: {}, total: 0, types: [] };
      groups.set(name, g);
    }
    g.types.push({ label: typeLabel, byMonth: axis.byMonth, total: axis.total });
    for (let m = 1; m <= 12; m++) {
      g.byMonth[m] = (g.byMonth[m] ?? 0) + (axis.byMonth[m] ?? 0);
    }
    g.total += axis.total;
  };

  for (const t of types) {
    if (t.campaigns.length === 0) {
      add(NO_CAMPAIGN_LABEL, t.label, t);
      continue;
    }
    for (const c of t.campaigns) {
      add(c.name, t.label, c);
    }
  }

  return [...groups.values()];
}

export interface MediaboxTotalsCad {
  media: MediaboxCadAxis;
  labs: MediaboxCadAxis;
  /** Media spend grouped by media type. */
  mediaByType: MediaboxCadType[];
  /** LABS spend grouped by LABS partner. */
  labsByPartner: MediaboxCadType[];
  /** False when the totals hold USD spend but no rate was available to convert it. */
  usdConverted: boolean;
  hasUsd: boolean;
}

/**
 * Convert a whole totals doc to CAD for display. `usdToCad` comes from the
 * forecaster's `currency_rates` for the year.
 */
export function mediaboxTotalsToCad(
  totals: MediaboxTotals,
  usdToCad: number | undefined
): MediaboxTotalsCad {
  const hasUsd =
    (totals.mediaSpend?.USD ?? 0) !== 0 || (totals.labs?.USD ?? 0) !== 0;
  return {
    media: splitToCad(totals.byMonth, usdToCad),
    labs: splitToCad(totals.labs?.byMonth, usdToCad),
    mediaByType: typeRowsToCad(totals.mediaByType, usdToCad),
    labsByPartner: typeRowsToCad(totals.labsByPartner, usdToCad),
    usdConverted: !hasUsd || !!usdToCad,
    hasUsd,
  };
}
