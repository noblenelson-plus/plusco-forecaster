// lib/format/partner-target-split.ts

/**
 * Client-level partner targets ("who has to spend how much with each Labs
 * partner"), pure and Firebase-free. Each Deal Targets partner target
 * (partner_targets/{year}) is split across clients:
 *
 *   - Partners in the Labs Forecaster 2.0 (Amazon, Billups-OOH / -Print,
 *     MIQ-Prog / -Social, Quantcast, Reddit, StackAdapt, Yahoo, AIM): by each
 *     client's share of that partner in the year's latest submitted RFQ Labs
 *     forecast (`splitRound`).
 *   - Other partners (Corus, Quebecor, Netflix, Magnite, Media Pulse, SiriusXM,
 *     iHeart, Trader Interactive, Index): by each client's share of that
 *     partner's MIR booked spend this year, else last year.
 *   - Admin overrides (a fixed % for a client) win; the rest of the target is
 *     split over the other clients in the same proportions.
 *
 * Client target = partner target × share. Booked = MIR booked net (CAD) for the
 * same partner (Billups split OOH / Print by channel, MIQ Social vs the rest,
 * AIM-KPI G = AIM). Roll-ups by agency × BU region, GM pod, business lead or
 * client are plain sums.
 */

import type { PartnerTarget } from "../types/partner-targets.types";
import type { RFQ, RFQType } from "../types/rfq.types";
import { RFQ_TYPE_ORDER } from "../types/rfq.types";

/** Partner key used everywhere: lowercase letters and digits only ("Billups-OOH" → "billupsooh"). */
export const partnerKey = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // "Télé-Quebec" → "telequebec" (= MIR "TELE QUEBEC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** MIR partner names booked under a different Deal Targets name (MIR key → Deal Targets key). */
const MIR_PARTNER_ALIASES: Record<string, string> = {
  googleads: "google",
  googledv360: "google",
  canadianbroadcastsales: "cbs",
  cogecomedia: "cogeco",
};

/**
 * The round client shares follow: the one just before the year's open
 * (earliest UNLOCKED) round — the latest submitted forecast. 2027 with RFQ1 open
 * → RFQ0; 2026 with FINAL open → RFQ3. When the year's first round is the open
 * one, that round. When no round is open, the last round.
 */
export function splitRound(rfqs: readonly RFQ[], year: number): RFQType | null {
  const ofYear = rfqs.filter((r) => r.year === year).sort((a, b) => RFQ_TYPE_ORDER[a.type] - RFQ_TYPE_ORDER[b.type]);
  if (ofYear.length === 0) return null;
  const open = ofYear.findIndex((r) => r.status === "UNLOCKED");
  if (open < 0) return ofYear[ofYear.length - 1].type;
  return ofYear[Math.max(0, open - 1)].type;
}

/**
 * Deal Targets partner a Labs forecaster partner (by name) counts toward:
 * same name, or the AIM family (AIM-Prog / -Social / -SEM → "AIM"). Null when
 * no target partner matches (e.g. MIQ-SEM).
 */
export function targetForLabsPartner(labsName: string, targetKeys: ReadonlySet<string>): string | null {
  const k = partnerKey(labsName);
  if (targetKeys.has(k)) return k;
  if (k.startsWith("aim") && targetKeys.has("aim")) return "aim";
  return null;
}

/**
 * Deal Targets partner a MIR row (PLUSCO_MEDIA_PARTNER + channel) counts toward,
 * or null. Billups → OOH / Print by channel; MIQ → Social / SEM / Prog by
 * channel; AIM-KPI G and other AIM lines → AIM; otherwise same name.
 */
export function targetForMirRow(partner: string | null, channel: string | null, targetKeys: ReadonlySet<string>): string | null {
  const p = partnerKey(partner);
  const ch = partnerKey(channel);
  let k = p;
  if (p === "billups") k = ch === "print" ? "billupsprint" : "billupsooh";
  else if (p === "miq") k = ch === "social" ? "miqsocial" : ch === "sem" ? "miqsem" : "miqprog";
  else if (p.startsWith("aim")) k = "aim";
  if (!targetKeys.has(k) && MIR_PARTNER_ALIASES[p] && targetKeys.has(MIR_PARTNER_ALIASES[p])) k = MIR_PARTNER_ALIASES[p];
  return targetKeys.has(k) ? k : null;
}

/**
 * "ssp": SSP deals (Labs - SSP: Magnite, Index) aren't split — their spend flows
 * through the DSPs, so their few direct MIR lines (e.g. Magnite 2026 = one
 * client) would put the whole target on one client.
 */
export type SplitBasis = "forecast" | "mir" | "mir-previous" | "ssp" | "none";

export interface SplitInputs {
  year: number;
  /** Labs partners with a target this year (Labs deal types, target > 0). */
  targets: PartnerTarget[];
  /** Forecast (CAD) by client × target partner key, from the split round. */
  forecast: Map<string, Map<string, number>>;
  /** MIR booked (CAD) by year → target partner key → client id. */
  mir: Map<string, Map<string, Map<string, number>>>;
  /** Admin overrides: target partner key → client id → share (0..1). */
  overrides: Record<string, Record<string, number>>;
  /**
   * Where client shares come from:
   *  - "forecast": the Labs forecast only (Forecaster tab; no MIR fallback);
   *  - "mir": MIR booked share only, from last year's full-year MIR (MIR tab — every partner, SSPs and Volume deals included);
   *  - "auto" (default): forecast for Labs Forecaster partners, MIR for the rest, SSPs not split.
   */
  mode?: "auto" | "forecast" | "mir";
}

export interface ClientAllocation {
  partner: string;
  key: string;
  clientId: string;
  /** Amount the share was taken from (forecast or MIR, CAD). */
  basisAmount: number;
  share: number;
  target: number;
  booked: number;
  overridden: boolean;
}

export interface PartnerSplit {
  partner: string;
  key: string;
  dealType: string;
  target: number;
  basis: SplitBasis;
  /** Target left unallocated (no basis, or overrides below 100% with nobody else). */
  unallocated: number;
  overrideTotal: number;
  booked: number;
  /** Booked on MIR rows without a Forecaster client. */
  bookedUnlinked: number;
  clients: ClientAllocation[];
}

const positive = (m: Map<string, number> | undefined) => {
  const out = new Map<string, number>();
  for (const [k, v] of m ?? []) if (v > 0) out.set(k, v);
  return out;
};

export function computePartnerSplits(i: SplitInputs): PartnerSplit[] {
  const y = String(i.year);
  const prev = String(i.year - 1);
  return i.targets.map((t) => {
    const key = partnerKey(t.partner);
    const target = t.mediaSpendTarget ?? 0;

    // Basis: forecast for Labs Forecaster partners, else MIR this year, else last year
    // ("forecast" mode: forecast only; "mir" mode: MIR only, SSPs included).
    const mode = i.mode ?? "auto";
    const isSsp = t.dealType === "Labs - SSP" && mode === "auto";
    let basis: SplitBasis = isSsp ? "ssp" : "none";
    let amounts = new Map<string, number>();
    if (mode !== "mir" && t.inLabsForecaster2 && !isSsp) {
      for (const [clientId, byPartner] of i.forecast) {
        const v = byPartner.get(key) ?? 0;
        if (v > 0) amounts.set(clientId, v);
      }
      if (amounts.size) basis = "forecast";
    }
    // MIR tab: last year's full-year MIR only (Adriana: the latest 2026 MIR stays
    // the source going into 2027, even once partial 2027 bookings arrive).
    if (basis === "none" && mode === "auto") {
      amounts = positive(i.mir.get(y)?.get(key));
      amounts.delete("");
      if (amounts.size) basis = "mir";
    }
    if (basis === "none" && mode !== "forecast") {
      amounts = positive(i.mir.get(prev)?.get(key));
      amounts.delete("");
      if (amounts.size) basis = "mir-previous";
    }

    const ov = i.overrides[key] ?? {};
    const overrideTotal = Object.values(ov).reduce((s, v) => s + v, 0);
    const remaining = Math.max(0, 1 - overrideTotal);
    let free = 0;
    for (const [c, v] of amounts) if (!(c in ov)) free += v;

    const bookedByClient = i.mir.get(y)?.get(key) ?? new Map<string, number>();
    const clientIds = new Set<string>([...amounts.keys(), ...Object.keys(ov), ...bookedByClient.keys()]);
    clientIds.delete("");
    const clients: ClientAllocation[] = [];
    let allocated = 0;
    for (const clientId of clientIds) {
      const overridden = clientId in ov;
      const basisAmount = amounts.get(clientId) ?? 0;
      const share = overridden ? ov[clientId] : free > 0 ? (remaining * basisAmount) / free : 0;
      allocated += share;
      clients.push({
        partner: t.partner, key, clientId, basisAmount, share, target: target * share,
        booked: bookedByClient.get(clientId) ?? 0, overridden,
      });
    }
    clients.sort((a, b) => b.target - a.target || b.booked - a.booked);
    const booked = [...bookedByClient.values()].reduce((s, v) => s + v, 0);
    return {
      partner: t.partner, key, dealType: t.dealType, target, basis,
      unallocated: target * Math.max(0, 1 - allocated), overrideTotal,
      booked, bookedUnlinked: bookedByClient.get("") ?? 0, clients,
    };
  });
}

export interface RollupRow {
  label: string;
  target: number;
  booked: number;
  /** booked / target, null when no target. */
  pace: number | null;
  clients: number;
}

/** Sum client allocations by a client → label function (labels for unknown clients: "—"). */
export function rollupSplits(
  splits: readonly PartnerSplit[],
  labelOf: (clientId: string) => string,
  keepClient: (clientId: string) => boolean = () => true
): RollupRow[] {
  const by = new Map<string, RollupRow & { ids: Set<string> }>();
  for (const s of splits) {
    for (const c of s.clients) {
      if (!keepClient(c.clientId)) continue;
      const label = labelOf(c.clientId) || "—";
      let r = by.get(label);
      if (!r) by.set(label, (r = { label, target: 0, booked: 0, pace: null, clients: 0, ids: new Set() }));
      r.target += c.target;
      r.booked += c.booked;
      r.ids.add(c.clientId);
    }
  }
  return [...by.values()]
    .map(({ ids, ...r }) => ({ ...r, clients: ids.size, pace: r.target > 0 ? r.booked / r.target : null }))
    .filter((r) => Math.round(r.target) !== 0 || Math.round(r.booked) !== 0)
    .sort((a, b) => b.target - a.target || b.booked - a.booked);
}
