// components/forecaster/tabs/exec-summary-tab.tsx
"use client";

/**
 * Executive Summary — the headline of the dashboard: a KPI band (total media,
 * total revenue, revenue/media, total Labs, Labs share), the Investment
 * Strategy KPIs, and the mix donuts (channel mix, revenue mix, Labs spend,
 * product revenue). Everything follows the client focus. Revenue uses the BL
 * Submission basis (the standard headline figure).
 */

import { useMemo } from "react";
import { Loader2, TrendingUp, DollarSign, Percent, FlaskConical, Layers, Box } from "lucide-react";
import StrategyKpisSection from "../sections/strategy-kpis-section";
import StatCard, { type StatVariance } from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import DonutChart from "../../dashboard/charts/donut-chart";
import { MEDIA_TYPE_COLORS } from "../../dashboard/charts/colors";
import { useScopeProductRevenue } from "../../../lib/dashboard/data/use-scope-product-revenue";
import { computeProductRevenue } from "../sections/product-revenue-data";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useProducts } from "../../../lib/hooks/use-products";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { formatCompactMoney, formatPct } from "../../dashboard/charts/format";
import { sumMonthlyMap } from "../../../lib/types/common.types";
import { computeVariance, MEDIA_TYPE_LABELS } from "../../../lib/types/forecaster.types";
import type { Currency } from "../../../lib/types/client.types";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { ScopeMediaboxData } from "../../../lib/dashboard/data/use-scope-mediabox-totals";

/** Compute and format a StatCard variance, mirroring the other tabs. */
function getVariance(
  current: number,
  reference: number | null | undefined,
  favorableUp = true,
  isPct = false
): StatVariance | null {
  if (reference == null || reference === 0) return null;

  const v = computeVariance(current, reference);
  if (v.absolute === 0) return { pillLabel: "0%", isFavorable: true, absoluteLabel: "0" };

  const up = v.absolute > 0;
  const isFavorable = up === favorableUp;
  const rel = v.relative !== null ? Math.round(v.relative) : 0;
  const pillLabel = rel > 0 ? `+${rel}%` : `${rel}%`;
  const absFormatted = isPct ? formatPct(v.absolute) : formatCompactMoney(v.absolute);
  const absoluteLabel = up ? `+${absFormatted}` : absFormatted.replace("-", "−");

  return { pillLabel, isFavorable, absoluteLabel };
}

export default function ExecSummaryTab({
  data,
  comparisonData,
  focusData,
  focusComparisonData,
  focusedClientId,
  focusLoading,
  mediabox,
  scopedClientIds,
  currencyByClient,
  usdToCad,
  selMonths,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
  focusData: ScopeForecastData;
  focusComparisonData: ScopeForecastData;
  focusedClientId: string | null;
  focusLoading: boolean;
  /** MediaBox totals for the scope — feeds the adoption KPI (scope-wide). */
  mediabox: ScopeMediaboxData;
  scopedClientIds: string[];
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  selMonths: number[];
}) {
  const shown = focusedClientId ? focusData : data;
  const shownComparison = focusedClientId ? focusComparisonData : comparisonData;

  const media = shown.media;
  const labs = shown.labs;
  const revenue = shown.revenueByMode.blSubmission.breakdown;
  const ratio = media.totalAnnual > 0 ? revenue.totalAnnual / media.totalAnnual : null;

  // MediaBox adoption — MediaBox spend ÷ BL forecast, mapped clients only.
  // Always scope-wide (never the focused single client), matching the tab.
  const mappedIds = new Set(
    Object.values(mediabox.byClient).filter((c) => c.mapped).map((c) => c.clientId)
  );
  const mbForecastTotal = data.mediaByClient
    .filter((cb) => mappedIds.has(cb.clientId))
    .reduce(
      (acc, cb) => acc + Object.values(cb.byType).reduce((a, m) => a + sumMonthlyMap(m), 0),
      0
    );
  const mbTotal = Object.values(mediabox.byClient)
    .filter((c) => c.mapped)
    .reduce((acc, c) => acc + c.total, 0);
  const mbCoverage = mbForecastTotal > 0 ? mbTotal / mbForecastTotal : null;

  const compMedia = shownComparison.hasContext ? shownComparison.media : null;
  const compLabs = shownComparison.hasContext ? shownComparison.labs : null;
  const compRevenue = shownComparison.hasContext
    ? shownComparison.revenueByMode.blSubmission.breakdown
    : null;
  const compRatio =
    compMedia && compMedia.totalAnnual > 0 && compRevenue
      ? compRevenue.totalAnnual / compMedia.totalAnnual
      : null;

  const channels = media.byChannel.filter((c) => c.annual > 0);
  const streams = revenue.byStream.filter((s) => s.annual > 0);

  // Labs spend by media channel (mirrors Channel mix).
  const labsSegments = labs.byType
    .filter((t) => t.labsAnnual > 0)
    .map((t) => ({
      label: MEDIA_TYPE_LABELS[t.mediaType],
      value: t.labsAnnual,
      color: MEDIA_TYPE_COLORS[t.mediaType],
    }));

  // Product revenue by product (mirrors Revenue mix). Reads per-product BL
  // revenue for the scope; narrows to the focused client like the other charts.
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { clients } = useAccessibleClients();
  const { products } = useProducts();
  const usersMap = useUsersMap();
  const productNameById = useMemo(
    () => new Map(products.map((prod) => [prod.productId, prod.name])),
    [products]
  );
  const { entries: productEntries } = useScopeProductRevenue({
    scopedClientIds,
    primary: { year: selectedYear, rfq: selectedRFQ?.type ?? null },
    primaryMode: "blSubmission",
    comparison: { year: null, rfq: null },
    secondaryMode: "blSubmission",
    currencyByClient,
    usdToCad,
    comparisonUsdToCad: undefined,
    selMonths,
  });
  const viewProductEntries = useMemo(
    () =>
      focusedClientId
        ? productEntries.filter((e) => e.clientId === focusedClientId)
        : productEntries,
    [productEntries, focusedClientId]
  );
  const productResult = useMemo(
    () => computeProductRevenue(viewProductEntries, clients, usersMap, productNameById, null),
    [viewProductEntries, clients, usersMap, productNameById]
  );
  const productTotal = productResult.mix.reduce((acc, seg) => acc + seg.value, 0);

  return (
    <div className="space-y-8">
      <div className="relative space-y-8">
      <div data-scroll-section data-scroll-label="Key metrics" className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={TrendingUp}
          label="Total media spend"
          value={formatCompactMoney(media.totalAnnual)}
          accent="text-indigo-500"
          variance={getVariance(media.totalAnnual, compMedia?.totalAnnual)}
        />
        <StatCard
          icon={DollarSign}
          label="Total revenue"
          value={formatCompactMoney(revenue.totalAnnual)}
          sub="BL submission"
          variance={getVariance(revenue.totalAnnual, compRevenue?.totalAnnual)}
        />
        <StatCard
          icon={Percent}
          label="Revenue / Media"
          value={ratio !== null ? formatPct(ratio) : "—"}
          sub="revenue per $ of media"
          accent="text-emerald-500"
          variance={getVariance(ratio ?? 0, compRatio ?? 0, true, true)}
        />
        <StatCard
          icon={FlaskConical}
          label="Total Labs spend"
          value={formatCompactMoney(labs.totalLabs)}
          accent="text-violet-500"
          variance={getVariance(labs.totalLabs, compLabs?.totalLabs)}
        />
        <StatCard
          icon={Percent}
          label="Labs share"
          value={formatPct(labs.ratio)}
          sub={`Target ${formatPct(labs.targetRatio)}`}
          accent={labs.ratio !== null && labs.ratio >= labs.targetRatio ? "text-emerald-500" : "text-yellow-500"}
          variance={getVariance(labs.ratio ?? 0, compLabs?.ratio ?? 0, true, true)}
        />
        <StatCard
          icon={Box}
          label="MediaBox adoption"
          value={mediabox.loading ? "…" : formatPct(mbCoverage)}
          sub="of BL forecast in MediaBox"
          accent="text-indigo-500"
        />
      </div>

      <div data-scroll-section data-scroll-label="Strategy KPIs">
        <StrategyKpisSection data={shown} comparisonData={shownComparison} />
      </div>

      <div data-scroll-section data-scroll-label="Mix" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Channel mix" subtitle="Annual BL spend by media channel" icon={TrendingUp}>
          {channels.length > 0 ? (
            <DonutChart
              segments={channels.map((c) => ({ label: c.label, value: c.annual, color: c.color }))}
              centerValue={formatCompactMoney(media.totalAnnual)}
              centerLabel="Media"
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No media spend in scope.</p>
          )}
        </ChartCard>

        <ChartCard title="Revenue mix" subtitle="Annual BL revenue by stream" icon={Layers}>
          {streams.length > 0 ? (
            <DonutChart
              segments={streams.map((s) => ({ label: s.label, value: s.annual, color: s.color }))}
              centerValue={formatCompactMoney(revenue.totalAnnual)}
              centerLabel="Revenue"
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No revenue in scope.</p>
          )}
        </ChartCard>

        <ChartCard title="Labs spend" subtitle="Annual BL Labs spend by channel" icon={FlaskConical}>
          {labsSegments.length > 0 ? (
            <DonutChart
              segments={labsSegments}
              centerValue={formatCompactMoney(labs.totalLabs)}
              centerLabel="Labs"
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No Labs spend in scope.</p>
          )}
        </ChartCard>

        <ChartCard title="Product revenue" subtitle="Annual BL revenue by product" icon={Box}>
          {productResult.mix.length > 0 ? (
            <DonutChart
              segments={productResult.mix}
              centerValue={formatCompactMoney(productTotal)}
              centerLabel="Product"
              valueFormat={formatCompactMoney}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No product revenue in scope.</p>
          )}
        </ChartCard>
      </div>

        {focusLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}