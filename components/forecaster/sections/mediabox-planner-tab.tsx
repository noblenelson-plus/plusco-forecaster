// components/forecaster/sections/mediabox-planner-tab.tsx
"use client";

/**
 * MediaBox Planner view (Media Investments → Data: MediaBox Planner, see
 * mediaocean-tabs.tsx) — the Media Investments page's charts over MediaBox
 * PLANNED budgets (finance_master_mapping, via useMediaboxPlannerMix) instead of
 * MediaOcean booked spend:
 *   - Total Planned Investment: total + digital share, by media type (channel),
 *     media mix and digital mix;
 *   - Client Cost: Planned Net + Commission (+ Taxes), by media type;
 *   - Top Publishers: deal vs non-deal, top 20;
 *   - Social Media: 2025 vs 2026 by publisher.
 * Dimensions are MediaBox's own media type ("Media Type (Channel)") and
 * publisher; every campaign status counts.
 *
 * Driven by the global client filter (scopedClientIds, matched on the
 * Forecaster client id — MediaBox clients not linked to a Forecaster client
 * only appear in the Reports raw data) and the From → To period bar. Local
 * control: CAD / USD (amounts converted at Bank of Canada rates by the sync,
 * listed under the header).
 */

import { useMemo, useState } from "react";
import {
  BarChart3,
  Info,
  Loader2,
  Percent,
  PieChart,
  Receipt,
  Share2,
  Table,
  TrendingUp,
  Users,
} from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import SheetExportButton from "../../dashboard/sheet-export-button";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import HorizontalStackedBar, { type StackRow, type StackSeries } from "../../dashboard/charts/horizontal-stacked-bar";
import MultiSelectDropdown, { type Option } from "../../_shared/multi-select-dropdown";
import {
  applyPartnerFilters,
  computeTopPartners,
  EMPTY_PARTNER_FILTERS,
  partnerFilterOptions,
  type ChannelSlice,
  type PartnerFilters,
  type PartnerSlice,
} from "../../../lib/dashboard/data/use-mediaocean-investment-mix";
import { computeSocialSummary } from "../../../lib/dashboard/data/use-social-partner-mix";
import {
  clientCostTotals,
  computePlannerMediaMix,
  isHiddenMediaType,
  mediaTypeOf,
  plannedAmount,
  NO_PUBLISHER,
  plannerMonth,
  toInvestmentRows,
  toSocialRows,
  useMediaboxPlannerMix,
  type PlannerCurrency,
  type PlannerMeta,
  type PlannerRow,
} from "../../../lib/dashboard/data/use-mediabox-planner-mix";
import { describePeriod, inPeriod, monthsWithinOneYear, type MonthPeriod } from "../../../lib/format/period";

const TOP_N = 20;
// Spend with no publisher picked in MediaBox. Counted in the Deal / Non-Deal
// totals, but not ranked. "(No partner mapped)": rows synced before the switch
// to publishers.
const isNoPublisher = (p: string) => p === NO_PUBLISHER || p === "(No partner mapped)";
// Left out of the Social Publishers table and shares entirely (media team's
// call: no publisher, plus publishers too small to track).
const SOCIAL_EXCLUDED = new Set([NO_PUBLISHER, "(No partner mapped)", "X", "FOURSQUARE"].map((p) => p.toUpperCase()));
const LABEL = "Media Type (Channel)";
const BAR_COLOR = "#3b82f6";
const COLOR_2025 = "#3b82f6";
const COLOR_2026 = "#f59e0b";

// Same channel colors as the Media Investments pies, so both tabs read alike
// (MediaBox's "Paid Search" = SEM; "Digital" is MediaBox's generic type).
const CHANNEL_COLORS: Record<string, string> = {
  PROGRAMMATIC: "#4f46e5",
  SEM: "#f59e0b",
  SEARCH: "#f59e0b",
  "PAID SEARCH": "#f59e0b",
  DIGITAL: "#14b8a6",
  "DIGITAL DIRECT": "#06b6d4",
  SOCIAL: "#22c55e",
  TV: "#3b82f6",
  RADIO: "#eab308",
  OOH: "#ec4899",
  PRINT: "#a855f7",
};
const FALLBACK_COLOR = "#9ca3af";

// ─── Formatting ───────────────────────────────────────────────────────────────

function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function ppt(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}`;
}
const toOptions = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));
const toSegments = (slices: ChannelSlice[]): PieSegment[] =>
  slices.map((s) => ({
    label: s.channel,
    value: s.net,
    color: CHANNEL_COLORS[s.channel.trim().toUpperCase()] ?? FALLBACK_COLOR,
  }));

const TH = "py-2 font-medium";
const TD = "py-2 tabular-nums text-muted-foreground";

// ─── Header: currency, rates ──────────────────────────────────────────────────

function CurrencySwitch({ value, onChange }: { value: PlannerCurrency; onChange: (c: PlannerCurrency) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
      {(["CAD", "USD"] as PlannerCurrency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`px-3 py-1.5 transition-colors ${
            value === c ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** "2025: USD 1.3978 · EUR 1.5782 …" per year, with each rate's basis on hover. */
function RatesNote({ meta, currency }: { meta: PlannerMeta | null; currency: PlannerCurrency }) {
  if (!meta) return null;
  const years = Object.keys(meta.fx).sort();
  const synced = meta.synced_at
    ? new Date(meta.synced_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
    : null;
  return (
    <div className="flex items-start gap-2 border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
      <Info size={14} className="mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p>
          MediaBox planned net budgets (all campaign statuses), converted to {currency} at Bank of
          Canada yearly average rates{currency === "USD" ? " (CAD amounts ÷ that year's USD rate)" : ""}
          {synced ? ` · synced ${synced}` : ""}.
        </p>
        {years.map((y) => {
          const rates = Object.entries(meta.fx[y]).filter(([c]) => c !== "CAD");
          if (!rates.length) return null;
          return (
            <p key={y} className="tabular-nums">
              <span className="font-semibold text-foreground">{y}</span>{" "}
              {rates.map(([c, r], i) => (
                <span key={c} title={r.basis}>
                  {i > 0 ? " · " : ""}1 {c} = {r.rate} CAD
                </span>
              ))}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ─── Total Planned Investment ─────────────────────────────────────────────────

function TotalInvestmentSection({
  rows,
  currency,
  period,
}: {
  rows: PlannerRow[];
  currency: PlannerCurrency;
  period: MonthPeriod;
}) {
  const totals = useMemo(() => computePlannerMediaMix(rows, currency), [rows, currency]);
  const label = `Planned (${currency})`;
  return (
    <div data-scroll-section data-scroll-label="Total Planned Investment" className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Total Planned Investment</h2>
        <span className="text-xs font-medium text-muted-foreground">· {describePeriod(period)}</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <StatCard icon={TrendingUp} label="Total Planned Media" value={money(totals.grandTotal)} />
        <StatCard
          icon={Percent}
          label="Digital Share of Planned Media"
          value={pct(totals.digitalShareOfTotal)}
          sub={`${money(totals.digitalTotal)} of ${money(totals.grandTotal)}`}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <ChartCard
          title={`Planned Investment by ${LABEL}`}
          icon={Table}
          className="lg:col-span-5"
          action={
            <SheetExportButton
              title={`Planned Investment by ${LABEL}`}
              sheetTitle="Planned by Media Type"
              disabled={totals.mediaMix.length === 0}
              buildMatrix={() => [
                [LABEL, label],
                ...totals.mediaMix.map((s) => [s.channel, s.net]),
                ["Grand total", totals.grandTotal],
              ]}
            />
          }
        >
          <div className="pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className={`${TH} text-left`}>{LABEL}</th>
                  <th className={`${TH} text-right`}>{label}</th>
                </tr>
              </thead>
              <tbody>
                {totals.mediaMix.map((s) => (
                  <tr key={s.channel} className="border-b border-border/60">
                    <td className="py-2 text-left text-foreground">{s.channel}</td>
                    <td className={`${TD} text-right`}>{money(s.net)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 text-left text-foreground">Grand total</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(totals.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Media Mix" icon={PieChart} subtitle="Share of planned media" className="lg:col-span-4">
          <ForecasterPieChart segments={toSegments(totals.mediaMix)} valueFormat={money} />
        </ChartCard>
        <ChartCard title="Digital Media Mix" icon={PieChart} subtitle="Digital media types" className="lg:col-span-3">
          <ForecasterPieChart segments={toSegments(totals.digitalMix)} valueFormat={money} />
        </ChartCard>
      </div>
    </div>
  );
}

// ─── Client Cost ──────────────────────────────────────────────────────────────
// Client Cost = Planned Net + Commission (without taxes), + Taxes (with taxes).
// Other MediaBox fees (adserving, production, tech…) are shown, not included.
// Fees exist for MediaBox v2 plans only: v1 plans count in Planned Net with no fees.

function ClientCostSection({
  rows,
  currency,
  period,
}: {
  rows: PlannerRow[];
  currency: PlannerCurrency;
  period: MonthPeriod;
}) {
  const totals = useMemo(() => clientCostTotals(rows, currency), [rows, currency]);
  const byChannel = useMemo(() => {
    const groups = new Map<string, { label: string; rows: PlannerRow[] }>();
    for (const r of rows) {
      const label = mediaTypeOf(r);
      const key = label.toUpperCase();
      const g = groups.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      groups.set(key, g);
    }
    return [...groups.values()]
      .map((g) => ({ channel: g.label, ...clientCostTotals(g.rows, currency) }))
      .sort((a, b) => b.clientCostInclTaxes - a.clientCostInclTaxes);
  }, [rows, currency]);
  const cur = `(${currency})`;
  const commissionPct = totals.plannedNet ? totals.commission / totals.plannedNet : null;
  const COLS = ["Planned Net", "Commission", "Taxes", "Client Cost (without taxes)", "Client Cost (with taxes)", "Other fees"];
  const values = (t: typeof totals) => [
    t.plannedNet,
    t.commission,
    t.taxes,
    t.clientCostExclTaxes,
    t.clientCostInclTaxes,
    t.otherFees,
  ];

  return (
    <div data-scroll-section data-scroll-label="Client Cost" className="space-y-6">
      <div className="flex items-center gap-2">
        <Receipt size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Client Cost</h2>
        <span className="text-xs font-medium text-muted-foreground">· {describePeriod(period)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Client Cost = Planned Net + Commission, with or without Taxes. Other MediaBox fees (adserving, production,
        tech…) are listed separately and not included.
        {totals.noFeeData > 0 &&
          ` ${money(totals.noFeeData)} of Planned Net is from MediaBox v1 plans, which have no fee data.`}
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={TrendingUp} label="Planned Net" value={money(totals.plannedNet)} />
        <StatCard
          icon={Receipt}
          label="Commission"
          value={money(totals.commission)}
          sub={`${pct(commissionPct, 1)} of Planned Net`}
        />
        <StatCard icon={Receipt} label="Taxes" value={money(totals.taxes)} />
        <StatCard icon={Receipt} label="Client Cost (without taxes)" value={money(totals.clientCostExclTaxes)} />
        <StatCard icon={Receipt} label="Client Cost (with taxes)" value={money(totals.clientCostInclTaxes)} />
        <StatCard
          icon={Receipt}
          label="Other fees"
          value={money(totals.otherFees)}
          sub="Not included in Client Cost"
        />
      </div>
      <ChartCard
        title={`Client Cost by ${LABEL}`}
        icon={Table}
        action={
          <SheetExportButton
            title={`Client Cost by ${LABEL}`}
            sheetTitle="Client Cost by Media Type"
            disabled={byChannel.length === 0}
            buildMatrix={() => [
              [LABEL, ...COLS.map((c) => `${c} ${cur}`)],
              ...byChannel.map((c) => [c.channel, ...values(c)]),
              ["Grand total", ...values(totals)],
            ]}
          />
        }
      >
        <div className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className={`${TH} text-left`}>{LABEL}</th>
                {COLS.map((c) => (
                  <th key={c} className={`${TH} pl-4 text-right`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byChannel.map((c) => (
                <tr key={c.channel} className="border-b border-border/60">
                  <td className="py-2 text-left text-foreground">{c.channel}</td>
                  {values(c).map((v, i) => (
                    <td key={COLS[i]} className={`${TD} pl-4 text-right`}>
                      {money(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 text-left text-foreground">Grand total</td>
                {values(totals).map((v, i) => (
                  <td key={COLS[i]} className="py-2 pl-4 text-right tabular-nums text-foreground">
                    {money(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

// ─── Top Publishers ───────────────────────────────────────────────────────────
// The Media Investments partner roll-up, with MediaBox's publisher in the
// partner slot and its media type in the channel slot (toInvestmentRows).

function TopPartnersSection({
  rows,
  allRows,
  currency,
  period,
}: {
  rows: PlannerRow[];
  /** Every loaded row — the facet options stay stable as filters change. */
  allRows: PlannerRow[];
  currency: PlannerCurrency;
  period: MonthPeriod;
}) {
  const [facets, setFacets] = useState<PartnerFilters>(EMPTY_PARTNER_FILTERS);
  const options = useMemo(() => {
    const o = partnerFilterOptions(toInvestmentRows(allRows, currency));
    return { ...o, partner: o.partner.filter((p) => !isNoPublisher(p)) };
  }, [allRows, currency]);
  const top = useMemo(
    () => computeTopPartners(applyPartnerFilters(toInvestmentRows(rows, currency), facets)),
    [rows, currency, facets]
  );
  // The ranking skips spend with no publisher (still in the Deal / Non-Deal totals above).
  const unmapped = useMemo(
    () => top.partners.filter((p) => isNoPublisher(p.partner)).reduce((s, p) => s + p.net, 0),
    [top.partners]
  );
  const topPartners: PartnerSlice[] = useMemo(
    () => top.partners.filter((p) => !isNoPublisher(p.partner)).slice(0, TOP_N),
    [top.partners]
  );
  const label = `Planned (${currency})`;
  const barSeries: StackSeries[] = useMemo(() => [{ key: "net", label, color: BAR_COLOR }], [label]);
  const barRows: StackRow[] = topPartners.map((p) => ({ label: p.partner, values: { net: p.net } }));
  const anyFacet = facets.channel.length > 0 || facets.deals.length > 0 || facets.partner.length > 0;
  const setFacet = (patch: Partial<PartnerFilters>) => setFacets((prev) => ({ ...prev, ...patch }));

  return (
    <div data-scroll-section data-scroll-label="Top Publishers" className="space-y-6">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Top Publishers</h2>
        <span className="text-xs font-medium text-muted-foreground">· {describePeriod(period)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label={LABEL}
          options={toOptions(options.channel)}
          selectedValues={facets.channel}
          onChange={(v) => setFacet({ channel: v })}
          searchable
        />
        <MultiSelectDropdown
          label="2026 Deals"
          options={toOptions(options.deals)}
          selectedValues={facets.deals}
          onChange={(v) => setFacet({ deals: v })}
        />
        <MultiSelectDropdown
          label="Publisher"
          options={toOptions(options.partner)}
          selectedValues={facets.partner}
          onChange={(v) => setFacet({ partner: v })}
          searchable
        />
        {anyFacet && (
          <button
            type="button"
            onClick={() => setFacets(EMPTY_PARTNER_FILTERS)}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <StatCard
          icon={Users}
          label="Deal Publishers $"
          value={money(top.dealTotal)}
          sub={`${pct(top.dealPct)} of total`}
        />
        <StatCard
          icon={Users}
          label="Non-Deal Publishers $"
          value={money(top.nonDealTotal)}
          sub={`${pct(top.nonDealPct)} of total`}
        />
      </div>
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Top ${TOP_N} Publishers`}
          icon={Table}
          subtitle={unmapped ? `Excludes ${money(unmapped)} with no publisher in MediaBox` : undefined}
          action={
            <SheetExportButton
              title={`Top ${TOP_N} Publishers`}
              sheetTitle="Top Planned Publishers"
              disabled={topPartners.length === 0}
              buildMatrix={() => [
                ["#", "Publisher", "2026 Deals", label],
                ...topPartners.map((p, i) => [i + 1, p.partner, p.dealType ?? "", p.net]),
              ]}
            />
          }
        >
          <div className="pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className={`${TH} pr-2 text-left`}>#</th>
                  <th className={`${TH} text-left`}>Publisher</th>
                  <th className={`${TH} text-left`}>2026 Deals</th>
                  <th className={`${TH} text-right`}>{label}</th>
                </tr>
              </thead>
              <tbody>
                {topPartners.map((p, i) => (
                  <tr key={p.partner} className="border-b border-border/60">
                    <td className={`${TD} pr-2 text-left`}>{i + 1}</td>
                    <td className="py-2 text-left text-foreground">{p.partner}</td>
                    <td className="py-2 text-left text-muted-foreground">{p.dealType}</td>
                    <td className={`${TD} text-right`}>{money(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Planned by Publisher" icon={BarChart3}>
          <div className="pt-4">
            <HorizontalStackedBar series={barSeries} rows={barRows} valueFormat={money} />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ─── Social Media (2025 vs 2026) ──────────────────────────────────────────────

function SocialSection({
  rows,
  currency,
  selMonths,
}: {
  /** Client-filtered rows, every year (Social compares 2025 vs 2026). */
  rows: PlannerRow[];
  currency: PlannerCurrency;
  selMonths: number[];
}) {
  const summary = useMemo(() => {
    const social = toSocialRows(rows, currency).filter(
      (r) =>
        !SOCIAL_EXCLUDED.has(String(r.PLUSCO_MEDIA_PARTNER ?? "").trim().toUpperCase()) &&
        (selMonths.length === 0 || selMonths.includes(Number(r.MONTH)))
    );
    return computeSocialSummary(social);
  }, [rows, currency, selMonths]);
  const maxShare = summary.partners.reduce((m, p) => Math.max(m, p.share2025 ?? 0, p.share2026 ?? 0), 0);
  const w = (s: number | null) => (s === null || maxShare === 0 ? 0 : (s / maxShare) * 100);
  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const months =
    selMonths.length === 0
      ? "Full year (Jan–Dec), not period-filtered"
      : `${MONTH_ABBR[selMonths[0] - 1]}${selMonths.length > 1 ? `–${MONTH_ABBR[selMonths[selMonths.length - 1] - 1]}` : ""} of 2025 vs 2026`;

  return (
    <div data-scroll-section data-scroll-label="Social Media" className="space-y-6">
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Social Media</h2>
        <span className="text-xs font-medium text-muted-foreground">· {months}</span>
        <span className="ml-auto text-xs text-muted-foreground">{money(summary.total2026)} planned social (2026)</span>
      </div>
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <ChartCard
          title="Social Publishers"
          icon={Table}
          action={
            <SheetExportButton
              title="Social Publishers (planned)"
              sheetTitle="Planned Social Publishers"
              disabled={summary.partners.length === 0}
              buildMatrix={() => [
                ["Publisher", `Planned 2025 (${currency})`, `Planned 2026 (${currency})`, "Variance $", "Share ppt"],
                ...summary.partners.map((p) => [
                  p.partner,
                  p.spend2025,
                  p.spend2026,
                  p.variance,
                  p.sharePpt == null ? "" : Math.round(p.sharePpt * 10) / 10,
                ]),
                ["Grand total", summary.total2025, summary.total2026, summary.totalVariance, ""],
              ]}
            />
          }
        >
          <div className="pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className={`${TH} text-left`}>Publisher</th>
                  <th className={`${TH} text-right`}>Planned 2025</th>
                  <th className={`${TH} text-right`}>Planned 2026</th>
                  <th className={`${TH} text-right`}>Variance $</th>
                  <th className={`${TH} text-right`}>Share ppt</th>
                </tr>
              </thead>
              <tbody>
                {summary.partners.map((p) => (
                  <tr key={p.partner} className="border-b border-border/60">
                    <td className="py-2 text-left text-foreground">{p.partner}</td>
                    <td className={`${TD} text-right`}>{money(p.spend2025)}</td>
                    <td className={`${TD} text-right`}>{money(p.spend2026)}</td>
                    <td className={`${TD} text-right`}>{money(p.variance)}</td>
                    <td className={`${TD} text-right`}>{ppt(p.sharePpt)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 text-left text-foreground">Grand total</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(summary.total2025)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(summary.total2026)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(summary.totalVariance)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Social Share: 2025 vs 2026" icon={Share2} subtitle="Each publisher's share of planned social">
          {summary.partners.length === 0 ? (
            <p className="text-xs text-muted-foreground">No planned social spend in range.</p>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5" style={{ backgroundColor: COLOR_2025 }} />
                  Share 2025
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5" style={{ backgroundColor: COLOR_2026 }} />
                  Share 2026
                </span>
              </div>
              {summary.partners.map((p) => (
                <div key={p.partner} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{p.partner}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {pct(p.share2025)} → {pct(p.share2026)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden bg-muted">
                    <div className="h-2" style={{ width: `${w(p.share2025)}%`, backgroundColor: COLOR_2025 }} />
                  </div>
                  <div className="h-2 w-full overflow-hidden bg-muted">
                    <div className="h-2" style={{ width: `${w(p.share2026)}%`, backgroundColor: COLOR_2026 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export default function MediaboxPlannerTab({
  scopedClientIds,
  period,
}: {
  scopedClientIds: string[];
  /** From → To month period (the period bar above the filters). */
  period: MonthPeriod;
}) {
  const { rows, meta, loading, error } = useMediaboxPlannerMix();
  const [currency, setCurrency] = useState<PlannerCurrency>("CAD");
  // Client scope (global filter bar). Strict: an empty scope shows nothing,
  // never everything.
  // "Other" / no media type are left out of every section and total (media team);
  // the amount left out in the period is noted under the header.
  const scopedAll = useMemo(() => {
    const ids = new Set(scopedClientIds);
    return rows.filter((r) => !!r.PLUSCO_CLIENT_ID && ids.has(r.PLUSCO_CLIENT_ID));
  }, [rows, scopedClientIds]);
  const scoped = useMemo(() => scopedAll.filter((r) => !isHiddenMediaType(r)), [scopedAll]);
  const inRange = useMemo(
    () => scoped.filter((r) => inPeriod(period, Number(r.PLUSCO_YEAR), plannerMonth(r))),
    [scoped, period]
  );
  const hiddenInRange = useMemo(
    () =>
      scopedAll
        .filter((r) => isHiddenMediaType(r) && inPeriod(period, Number(r.PLUSCO_YEAR), plannerMonth(r)))
        .reduce((s, r) => s + plannedAmount(r, currency), 0),
    [scopedAll, period, currency]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        Couldn&apos;t load MediaBox Planner data: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
        No MediaBox Planner data yet — run the sync (scripts/sync-mediabox-planner.mjs).
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <CurrencySwitch value={currency} onChange={setCurrency} />
        </div>
        <RatesNote meta={meta} currency={currency} />
        {hiddenInRange > 0 && (
          <p className="text-xs text-muted-foreground">
            Not shown: {money(hiddenInRange)} of Planned Net with media type &quot;Other&quot; or no media type in
            MediaBox ({describePeriod(period)}).
          </p>
        )}
      </div>

      <TotalInvestmentSection rows={inRange} currency={currency} period={period} />
      <ClientCostSection rows={inRange} currency={currency} period={period} />
      <TopPartnersSection rows={inRange} allRows={scoped} currency={currency} period={period} />
      <SocialSection rows={scoped} currency={currency} selMonths={monthsWithinOneYear(period)} />
    </div>
  );
}
