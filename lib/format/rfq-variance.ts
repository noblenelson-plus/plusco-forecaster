// lib/format/rfq-variance.ts

/**
 * Milestones page — "RFQ total variance": for the checkpoint's RFQ vs the
 * previous RFQ, the total change in Revenue / Media / Labs over the filtered
 * clients, and how much of it the Business Leads justified (Adriana: only a
 * portion of the total variance needs — and gets — a justification).
 *
 * Built on the same compared lines as the swing flags (computeSwingLines:
 * annual revenue per client, media per media type, Labs per partner). Each
 * line's |change| lands in one bucket:
 *   justified      — its swing flag at the checkpoint is justified;
 *   notJustified   — it crosses the swing threshold, no justification (yet);
 *   noFlag         — under the threshold, or no baseline (new line).
 * The % justified = justified / (all three), i.e. of every movement, up and
 * down. Amounts in CAD. Pure and Firebase-free.
 */

import { isSwingFlagged, type SwingLine } from "../flags/swing-rules";
import type { StoredFlag } from "../types/forecast-flags.types";

export type VarianceAxis = "revenue" | "media" | "labs";

export interface AxisVariance {
  axis: VarianceAxis;
  current: number;
  previous: number;
  /** current − previous. */
  net: number;
  /** Sum of |change| over every line — the base of the shares below. */
  moved: number;
  justified: number;
  notJustified: number;
  noFlag: number;
}

export interface ClientVarianceInput {
  /** Multiplier to CAD. */
  toCad: number;
  lines: SwingLine[];
  /** The client's flags saved at the checkpoint (any rule). */
  flags: StoredFlag[];
}

const empty = (axis: VarianceAxis): AxisVariance => ({
  axis,
  current: 0,
  previous: 0,
  net: 0,
  moved: 0,
  justified: 0,
  notJustified: 0,
  noFlag: 0,
});

export function computeRfqVariance(clients: ClientVarianceInput[]): Record<VarianceAxis, AxisVariance> {
  const out: Record<VarianceAxis, AxisVariance> = {
    revenue: empty("revenue"),
    media: empty("media"),
    labs: empty("labs"),
  };
  for (const c of clients) {
    const flagByKey = new Map(c.flags.map((f) => [f.key, f]));
    for (const l of c.lines) {
      if (l.axis !== "revenue" && l.axis !== "media" && l.axis !== "labs") continue;
      const v = out[l.axis];
      const abs = Math.abs(l.delta) * c.toCad;
      v.current += l.current * c.toCad;
      v.previous += l.reference * c.toCad;
      v.moved += abs;
      if (flagByKey.get(l.key)?.justified) v.justified += abs;
      else if (isSwingFlagged(l)) v.notJustified += abs;
      else v.noFlag += abs;
    }
  }
  for (const v of Object.values(out)) v.net = v.current - v.previous;
  return out;
}
