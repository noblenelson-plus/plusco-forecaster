// filepath: components/forecaster/sections/mediaocean-investment-section.tsx
"use client";

/**
 * TOTAL MEDIA INVESTMENT section (MediaOcean tab) -- sits directly below the
 * Investment KPIs section. Reads the `mediaocean_investment_mix` collection via
 * useMediaoceanInvestmentMix and rolls the (filtered) grain rows up to: two hero
 * scorecards (Grand Total, Digital Share), then a single row holding the channel
 * table, the Media Mix pie (all channels) and the Digital Media Mix pie (digital
 * channels only) -- the Looker three-across layout. No business logic is
 * recomputed here; the aggregate already ran in BigQuery, this only filters/sums.
 *
 * Design: mirrors the shipped Media Spend sections. The channel table copies the
 * shared VarianceTable styling verbatim (uppercase muted headers, border-b row
 * rhythm, border-t-2 bold grand-total) so it is visually identical to every other
 * dashboard table. StatCard heroes, ChartCard + ForecasterPieChart, icon+title
 * header. Driven by the global dashboard filter + Time & Context (year +
 * months); no local filters. No variance (no comparison dimension).
 */

import { useMemo } from "react";
import { Loader2, TrendingUp, PieChart, Percent, Table } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import {
  useMediaoceanInvestmentMix,
  computeTotalMediaInvestment,
  type ChannelSlice,
  type MediaInvestmentRow,
} from "../../../lib/dashboard/data/use-mediaocean-investment-mix";
import type { Client } from "../../../lib/types/client.types";

// --- Formatting helpers -------------------------------------------------------

/** 398950534 -> "$398 950 534" (en-CA, matching the app's money style). */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

/** 0.63 -> "63%" ; null -> "—". */
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

// Month name -> number, to match the global Months selection against the row's
// MONTH / MONTH_DATE (which may be a name, a number, or a date string).
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
function monthOf(r: MediaInvestmentRow): number | null {
  if (r.MONTH_DATE) {
    const d = new Date(r.MONTH_DATE);
    if (!Number.isNaN(d.getTime())) return d.getUTCMonth() + 1;
  }
  const n = Number(r.MONTH);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const idx = MONTH_NAMES.indexOf(String(r.MONTH ?? "").trim().toLowerCase());
  return idx >= 0 ? idx + 1 : null;
}

// Fixed channel -> color map so a channel is the SAME color in both pies (and
// stable across filter changes). Keyed case-insensitively via colorFor().
const CHANNEL_COLORS: Record<string, string> = {
  PROGRAMMATIC: "#4f46e5", // indigo
  SEM: "#f59e0b", // amber
  "DIGITAL DIRECT": "#06b6d4", // cyan
  SOCIAL: "#22c55e", // green
  TV: "#3b82f6", // blue
  RADIO: "#eab308", // yellow
  OOH: "#ec4899", // pink
  PRINT: "#a855f7", // purple
};
const FALLBACK_COLOR = "#9ca3af"; // gray-400

function colorFor(channel: string): string {
  return CHANNEL_COLORS[channel.trim().toUpperCase()] ?? FALLBACK_COLOR;
}

/** ChannelSlice[] -> PieSegment[] with a stable per-channel color. */
function toSegments(slices: ChannelSlice[]): PieSegment[] {
  return slices.map((s) => ({
    label: s.channel,
    value: s.net,
    color: colorFor(s.channel),
  }));
}

// --- Channel table ------------------------------------------------------------
// Styling copied verbatim from the shared VarianceTable so every table on the
// dashboard reads the same: uppercase muted headers over border-b, rows on
// border-b border-border/60, grand total on border-t-2 border-border font-semibold.
function ChannelTable({
  slices,
  grandTotal,
}: {
  slices: ChannelSlice[];
  grandTotal: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2 text-left font-medium">Channel</th>
          <th className="py-2 text-right font-medium">Net Ordered (CAD)</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr key={s.channel} className="border-b border-border/60">
            <td className="py-2 text-left text-foreground">{s.channel}</td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {money(s.net)}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-border font-semibold">
          <td className="py-2 text-left tabular-nums text-foreground">
            Grand total
          </td>
          <td className="py-2 text-right tabular-nums text-foreground">
            {money(grandTotal)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// --- Section ------------------------------------------------------------------

export default function MediaoceanInvestmentSection({
  scopedClientIds,
  clients,
  year,
  selMonths,
}: {
  scopedClientIds: string[];
  clients: Client[];
  year: number;
  selMonths: number[];
}) {
  const { rows, loading, error } = useMediaoceanInvestmentMix();

  // Driven by the global filter bar + Time & Context (no local filters). Client
  // scope arrives as ids; MediaOcean rows key on client NAME, so we map ids ->
  // names via the clients collection and match case-insensitively.
  const scopedNames = useMemo(() => {
    const nameById = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
    const names = new Set<string>();
    for (const id of scopedClientIds) {
      const n = nameById.get(id);
      if (n) names.add(n.trim().toLowerCase());
    }
    return names;
  }, [scopedClientIds, clients]);

  const yearStr = String(year);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (String(r.PLUSCO_YEAR) !== yearStr) return false;
        if (
          scopedNames.size > 0 &&
          !scopedNames.has(String(r.PLUSCO_CLIENT_NAME).trim().toLowerCase())
        )
          return false;
        if (selMonths.length > 0) {
          const m = monthOf(r);
          if (m === null || !selMonths.includes(m)) return false;
        }
        return true;
      }),
    [rows, yearStr, scopedNames, selMonths]
  );
  // Recomputes on every filter change -- same effective-rows pattern as the
  // Investment KPIs scorecards.
  const totals = useMemo(
    () => computeTotalMediaInvestment(filtered),
    [filtered]
  );

  const mediaSegments = useMemo(
    () => toSegments(totals.mediaMix),
    [totals.mediaMix]
  );
  const digitalSegments = useMemo(
    () => toSegments(totals.digitalMix),
    [totals.digitalMix]
  );

  // --- States (mirror the KPI section) --------------------------------------
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
          Couldn&apos;t load Total Media Investment: {error}
        </div>
        <p className="text-xs text-muted-foreground">
          This view reads the admin-only{" "}
          <code>mediaocean_investment_mix</code> collection. If this is a
          permissions error, the signed-in account needs admin access.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
        No Total Media Investment data yet — run the sync
        (scripts/sync-mediaocean-investment-mix.mjs).
      </div>
    );
  }

  return (
    <div
      data-scroll-section
      data-scroll-label="Total Media Investment"
      className="space-y-6"
    >
      {/* Header — matches the shipped sections (icon + title). */}
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          Total Media Investment
        </h2>
      </div>

      {/* Row 1 — two hero scorecards side by side (no duplicated totals). */}
      <div className="grid gap-6 sm:grid-cols-2">
        <StatCard
          icon={TrendingUp}
          label="Total Media Spend"
          value={money(totals.grandTotal)}
        />
        <StatCard
          icon={Percent}
          label="Digital Share of Total Media"
          value={pct(totals.digitalShareOfTotal)}
          sub={`${money(totals.digitalTotal)} of ${money(totals.grandTotal)}`}
        />
      </div>

      {/* Row 2 — Looker three-across: channel table + Media Mix + Digital Mix.
          On smaller widths they stack; at lg the table takes ~40% and each pie
          ~30%. In-slice % labels are omitted here (they overlap at this size);
          the legends carry the read. */}
      <div className="grid gap-6 lg:grid-cols-12">
        <ChartCard
          title="Investment by Channel"
          icon={Table}
          className="lg:col-span-5"
        >
          <div className="pt-4">
            <ChannelTable slices={totals.mediaMix} grandTotal={totals.grandTotal} />
          </div>
        </ChartCard>

        <ChartCard
          title="Media Mix"
          icon={PieChart}
          subtitle="Share of total media"
          className="lg:col-span-4"
        >
          <ForecasterPieChart segments={mediaSegments} valueFormat={money} />
        </ChartCard>

        <ChartCard
          title="Digital Media Mix"
          icon={PieChart}
          subtitle="Digital channels"
          className="lg:col-span-3"
        >
          <ForecasterPieChart segments={digitalSegments} valueFormat={money} />
        </ChartCard>
      </div>
    </div>
  );
}
