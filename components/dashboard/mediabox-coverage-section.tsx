// components/dashboard/mediabox-coverage-section.tsx
"use client";

/**
 * MediaBox coverage — how much of the forecasted (BL) media spend is actually
 * entered in MediaBox, and where the two disagree the most.
 *
 * Only clients with a MediaBox mapping (CL_MediaBox_IDs) enter the coverage
 * math — an unmapped client can't have MediaBox spend, so it would only
 * deflate the ratio. Unmapped in-scope clients are listed on the left card
 * instead, as a "these still need mapping" call-out.
 *
 * Left card: coverage headline (% = MediaBox spend ÷ BL forecast, both CAD,
 * mapped clients only, restricted to the selected months) with a progress bar,
 * client counts and the list of unmapped clients.
 * Right card: the mapped in-scope clients ranked by absolute $ gap between
 * their MediaBox spend and their BL forecast — red when MediaBox is missing
 * spend (below forecast), indigo when MediaBox holds more than was forecasted.
 *
 * MediaBox data comes from `useScopeMediaboxTotals` (one totals doc per
 * in-scope client, written nightly by the MediaBox project's full refresh).
 */

import { Box, Scale, Loader2 } from "lucide-react";
import ChartCard from "./charts/chart-card";
import BarList from "./charts/bar-list";
import { NEGATIVE_COLOR, DIGITAL_COLOR } from "./charts/colors";
import { formatCompactMoney, formatPct } from "./charts/format";
import { sumMonthlyMap } from "../../lib/types/common.types";
import type { ScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";
import type { ScopeMediaboxData } from "../../lib/dashboard/data/use-scope-mediabox-totals";

/** Cap the gaps list so the card stays scannable. */
const MAX_GAP_ROWS = 12;

/** Gaps under this are rounding noise, not a real MediaBox/forecast mismatch. */
const MIN_GAP_DOLLARS = 1;

export default function MediaboxCoverageSection({
  data,
  mediabox,
  clientNameById,
}: {
  data: ScopeForecastData;
  mediabox: ScopeMediaboxData;
  clientNameById: Record<string, string>;
}) {
  const mediaboxClients = Object.values(mediabox.byClient);
  const mappedIds = new Set(
    mediaboxClients.filter((c) => c.mapped).map((c) => c.clientId)
  );
  const unmapped = mediaboxClients
    .filter((c) => !c.mapped)
    .map((c) => ({
      clientId: c.clientId,
      name: clientNameById[c.clientId] ?? c.clientId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Per-client BL forecast totals (already CAD + month-masked upstream),
  // restricted to mapped clients so both sides of the ratio cover the same
  // client set.
  const forecastByClient = data.mediaByClient
    .filter((cb) => mappedIds.has(cb.clientId))
    .map((cb) => ({
      clientId: cb.clientId,
      total: Object.values(cb.byType).reduce(
        (acc, m) => acc + sumMonthlyMap(m),
        0
      ),
    }));
  const forecastTotal = forecastByClient.reduce((acc, c) => acc + c.total, 0);
  const mediaboxTotal = mediaboxClients
    .filter((c) => c.mapped)
    .reduce((acc, c) => acc + c.total, 0);

  const withForecast = forecastByClient.filter((c) => c.total > 0);
  const covered = withForecast.filter(
    (c) => (mediabox.byClient[c.clientId]?.total ?? 0) > 0
  );

  // Per-client $ gap (MediaBox − forecast) across the mapped clients, ranked
  // by absolute size.
  const forecastById = new Map(forecastByClient.map((c) => [c.clientId, c.total]));
  const gaps = [...mappedIds]
    .map((clientId) => {
      const forecast = forecastById.get(clientId) ?? 0;
      const mb = mediabox.byClient[clientId]?.total ?? 0;
      return { clientId, forecast, mb, gap: mb - forecast };
    })
    .filter((g) => Math.abs(g.gap) >= MIN_GAP_DOLLARS)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const coverage = forecastTotal > 0 ? mediaboxTotal / forecastTotal : null;
  const syncedLabel = mediabox.syncedAt
    ? new Date(mediabox.syncedAt).toLocaleDateString("en-CA")
    : null;

  const body = mediabox.loading ? (
    <div className="flex h-40 items-center justify-center text-gray-400">
      <Loader2 size={18} className="animate-spin" />
    </div>
  ) : mediabox.error ? (
    <p className="py-8 text-center text-xs text-red-600">{mediabox.error}</p>
  ) : (
    <>
      <div className="flex items-end gap-2">
        <div className="text-3xl font-bold tabular-nums text-foreground">
          {formatPct(coverage)}
        </div>
        <div className="mb-1 text-xs text-muted-foreground">
          of the BL forecast is in MediaBox (mapped clients only)
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden bg-muted">
        <div
          className="h-full bg-primary transition-[width]"
          style={{
            width: `${Math.min(100, Math.max(0, (coverage ?? 0) * 100))}%`,
          }}
        />
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">In MediaBox</dt>
          <dd className="tabular-nums font-medium text-foreground">
            {formatCompactMoney(mediaboxTotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">BL forecast</dt>
          <dd className="tabular-nums font-medium text-foreground">
            {formatCompactMoney(forecastTotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Clients with MediaBox spend</dt>
          <dd className="tabular-nums font-medium text-foreground">
            {covered.length} of {withForecast.length}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Mapped to MediaBox</dt>
          <dd className="tabular-nums font-medium text-foreground">
            {mappedIds.size} of {mediaboxClients.length}
          </dd>
        </div>
      </dl>

      {unmapped.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            Not mapped to MediaBox ({unmapped.length}) — excluded from coverage
          </p>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto text-xs text-foreground">
            {unmapped.map((c) => (
              <li key={c.clientId}>{c.name}</li>
            ))}
          </ul>
        </div>
      )}

      {(syncedLabel || mediabox.missingRate) && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          {syncedLabel && <>MediaBox data synced {syncedLabel}.</>}
          {mediabox.missingRate && (
            <> USD spend not converted — no rate set for this year.</>
          )}
        </p>
      )}
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <ChartCard
        title="MediaBox coverage"
        subtitle="Share of forecasted spend entered in MediaBox"
        icon={Box}
        className="lg:col-span-2"
      >
        {body}
      </ChartCard>

      <ChartCard
        title="Largest gaps vs MediaBox"
        subtitle="Biggest $ differences between MediaBox spend and the BL forecast"
        icon={Scale}
        className="lg:col-span-3"
      >
        {mediabox.loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : gaps.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No gaps — MediaBox matches the forecast for every mapped client.
          </p>
        ) : (
          <>
            <div className="mb-3 flex gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2"
                  style={{ backgroundColor: NEGATIVE_COLOR }}
                />
                MediaBox below forecast
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2"
                  style={{ backgroundColor: DIGITAL_COLOR }}
                />
                MediaBox above forecast
              </span>
            </div>
            <BarList
              items={gaps.slice(0, MAX_GAP_ROWS).map((g) => ({
                label: clientNameById[g.clientId] ?? g.clientId,
                value: Math.abs(g.gap),
                color: g.gap < 0 ? NEGATIVE_COLOR : DIGITAL_COLOR,
                hint: `MB ${formatCompactMoney(g.mb)} · Fcst ${formatCompactMoney(g.forecast)}`,
              }))}
              valueFormat={formatCompactMoney}
            />
            {gaps.length > MAX_GAP_ROWS && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                +{gaps.length - MAX_GAP_ROWS} more clients with a gap.
              </p>
            )}
          </>
        )}
      </ChartCard>
    </div>
  );
}
