// components/forecaster/sections/client-table-totals.ts

/**
 * Grand-total aggregation for the client detail table.
 *
 * Lifted out of the table component unchanged so the column descriptors have a
 * concrete `Totals` shape to bind to. Pure: rows in, summary out.
 *
 * Ratios are deliberately NOT summed or averaged here — only their numerators
 * and denominators are accumulated, so the footer can compute a scope-weighted
 * ratio (Billups OOH spend ÷ OOH media across every client) rather than the
 * mean of the per-client percentages, which would be a different number.
 */

import {
  CHANNEL_ORDER,
  PARTNER_COLS,
  type ClientTableRow,
} from "./client-table-data";

export interface PartnerTotal {
  primary: number;
  variance: number;
}

export interface ClientTableTotals {
  // Media
  totalMedia: number;
  totalMediaVar: number;
  digitalMedia: number;
  digitalMediaVar: number;
  traditionalMedia: number;
  traditionalMediaVar: number;
  /** Per-channel spend, keyed by the CHANNEL_ORDER label. */
  channels: Record<string, number>;
  // Labs
  totalLabs: number;
  labsVar: number;
  /** Per-partner spend and variance, keyed by the PARTNER_COLS label. */
  partners: Record<string, PartnerTotal>;
  // Ratio denominators / numerators, kept raw for weighted footer ratios.
  oohMedia: number;
  printMedia: number;
  billupsOoh: number;
  billupsPrint: number;
}

/** Ratio guarded against a zero or absent denominator. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeClientTableTotals(
  rows: ClientTableRow[]
): ClientTableTotals {
  const totals: ClientTableTotals = {
    totalMedia: 0,
    totalMediaVar: 0,
    digitalMedia: 0,
    digitalMediaVar: 0,
    traditionalMedia: 0,
    traditionalMediaVar: 0,
    channels: Object.fromEntries(CHANNEL_ORDER.map((label) => [label, 0])),
    totalLabs: 0,
    labsVar: 0,
    partners: Object.fromEntries(
      PARTNER_COLS.map((p) => [p.label, { primary: 0, variance: 0 }])
    ),
    oohMedia: 0,
    printMedia: 0,
    billupsOoh: 0,
    billupsPrint: 0,
  };

  for (const row of rows) {
    totals.totalMedia += row.totalMedia;
    totals.totalMediaVar += row.totalMediaVar;
    totals.digitalMedia += row.digitalMedia;
    totals.digitalMediaVar += row.digitalMediaVar;
    totals.traditionalMedia += row.traditionalMedia;
    totals.traditionalMediaVar += row.traditionalMediaVar;

    totals.oohMedia += row.oohMedia;
    totals.printMedia += row.printMedia;
    totals.billupsOoh += row.billupsOohSpend;
    totals.billupsPrint += row.billupsPrintSpend;

    for (const channel of row.channels) {
      // Guard against a label the column order does not know about.
      if (channel.label in totals.channels) {
        totals.channels[channel.label] += channel.value;
      }
    }

    totals.totalLabs += row.totalLabs;
    totals.labsVar += row.labsVar;

    for (const partner of row.partners) {
      const bucket = totals.partners[partner.label];
      if (bucket) {
        bucket.primary += partner.primary;
        bucket.variance += partner.variance;
      }
    }
  }

  return totals;
}