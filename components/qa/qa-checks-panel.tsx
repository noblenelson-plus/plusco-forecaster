// components/qa/qa-checks-panel.tsx
"use client";

/**
 * QA checks panel — data-consistency checks run against the in-scope forecast
 * data. Each rule is a card that passes or fails, listing the offending
 * client × month combinations. Rendered by the standalone Admin → QA page;
 * the caller owns the scope (clients, Year + RFQ) via the data it passes in.
 */

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import QaTestCard from "./qa-test-card";
import { LoadingTab, NoContextNotice } from "../dashboard/tabs/tab-states";
import {
  checkActualsWithinForecast,
  checkCommissionMatchesMedia,
  checkForecastWithinActuals,
  checkLabsWithinChannelForecast,
  checkRevenueActualsMatchOfficial,
  DEFAULT_QA_TOLERANCE,
  labsForecastMonthlyByClient,
  mediaForecastMonthlyByClient,
  type YearCommissionRates,
} from "../../lib/dashboard/data/qa-checks";
import type { ScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";

/**
 * One slider per check — session-only state, deliberately not persisted.
 * The GAIA vs Official Revenue check is absent: it must always run strict
 * (an equality, no acceptable gap), so its card has no slider.
 */
type CheckId =
  | "commissionVsMedia"
  | "labsVsMedia"
  | "mediaOceanMedia"
  | "mediaOceanLabs"
  | "mediaForecastAbove"
  | "labsForecastAbove";

const CHECK_IDS: CheckId[] = [
  "commissionVsMedia",
  "labsVsMedia",
  "mediaOceanMedia",
  "mediaOceanLabs",
  "mediaForecastAbove",
  "labsForecastAbove",
];

export default function QaChecksPanel({
  data,
  clientNameById,
  commissionRatesByClient,
  rfqLocked,
}: {
  data: ScopeForecastData;
  clientNameById: Record<string, string>;
  /** Per-client `commissionsConfig[year]` slice for the selected year. */
  commissionRatesByClient: Record<string, YearCommissionRates | undefined>;
  /** Selected RFQ is locked — its stored commission is a frozen snapshot, so
   *  gaps against the current rates can be by design. Surfaced on the card. */
  rfqLocked?: boolean;
}) {
  // Acceptable relative gap per check (0..1), adjusted by each card's slider.
  const [tolerances, setTolerances] = useState<Record<CheckId, number>>(
    () =>
      Object.fromEntries(
        CHECK_IDS.map((id) => [id, DEFAULT_QA_TOLERANCE])
      ) as Record<CheckId, number>
  );
  const setTolerance = (id: CheckId) => (t: number) =>
    setTolerances((prev) => ({ ...prev, [id]: t }));

  if (!data.hasContext) return <NoContextNotice />;
  if (data.loading) return <LoadingTab />;

  const commissionVsMedia = checkCommissionMatchesMedia(
    data.mediaByClient,
    data.revenueByClient,
    data.commissionOverwriteMonthsByClient,
    commissionRatesByClient,
    tolerances.commissionVsMedia
  );
  const labsVsMedia = checkLabsWithinChannelForecast(
    data.mediaByClient,
    data.labsDetail,
    tolerances.labsVsMedia
  );
  // Always strict — the GAIA lines must exactly equal the Official Revenue
  // (only the sub-dollar float-noise floor applies).
  const revenueVsOfficial = checkRevenueActualsMatchOfficial(
    data.revenueActualsByClient,
    0
  );
  // Media / Labs forecast vs MediaOcean, both directions: the forecast totals
  // are derived once and shared by the "within" and "above" checks.
  const mediaForecastByClient = mediaForecastMonthlyByClient(data.mediaByClient);
  const labsForecastByClient = labsForecastMonthlyByClient(data.labsDetail);
  const mediaOceanMedia = checkActualsWithinForecast(
    mediaForecastByClient,
    data.mediaActualsByClient,
    tolerances.mediaOceanMedia
  );
  const mediaOceanLabs = checkActualsWithinForecast(
    labsForecastByClient,
    data.labsActualsByClient,
    tolerances.mediaOceanLabs
  );
  const mediaForecastAbove = checkForecastWithinActuals(
    mediaForecastByClient,
    data.mediaActualsByClient,
    tolerances.mediaForecastAbove
  );
  const labsForecastAbove = checkForecastWithinActuals(
    labsForecastByClient,
    data.labsActualsByClient,
    tolerances.labsForecastAbove
  );

  const results = [
    commissionVsMedia,
    labsVsMedia,
    revenueVsOfficial,
    mediaOceanMedia,
    mediaOceanLabs,
    mediaForecastAbove,
    labsForecastAbove,
  ];
  const failing = results.filter((r) => r.status === "fail").length;
  const allPass = failing === 0;

  return (
    <div className="space-y-6">
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          allPass
            ? "border-green-500 bg-green-500 text-white"
            : "border-red-500 bg-red-500 text-white"
        }`}
      >
        {allPass ? (
          <CheckCircle2 size={18} className="flex-shrink-0" />
        ) : (
          <XCircle size={18} className="flex-shrink-0" />
        )}
        <span className="font-medium">
          {allPass
            ? "All QA checks pass for this scope."
            : `${failing} of ${results.length} QA checks failing for this scope.`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <QaTestCard
          title="Commission matches media forecast"
          description={
            "The Commission stored on each Revenue submission must match the commission " +
            "recomputed from the media spend forecast and the client's current commission " +
            "rates (overwritten months excluded). A gap means a commission sync was missed " +
            "or failed — re-saving the client's rates repairs it." +
            (rfqLocked
              ? " Note: this RFQ is locked, so gaps may simply reflect rate changes made " +
                "after the lock (locked submissions are frozen by design)."
              : "")
          }
          result={commissionVsMedia}
          tolerance={tolerances.commissionVsMedia}
          onToleranceChange={setTolerance("commissionVsMedia")}
          valueHeaders={["Stored commission", "Recomputed"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="Labs within media forecast"
          description="Labs spend on a media channel must not exceed the forecasted media spend for the same client, channel and month."
          result={labsVsMedia}
          tolerance={tolerances.labsVsMedia}
          onToleranceChange={setTolerance("labsVsMedia")}
          labelHeader="Channel"
          valueHeaders={["Labs", "Media forecast"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="GAIA lines match Official Revenue"
          description="For each month where both are entered, the sum of the GAIA admin lines must equal the Official Revenue."
          result={revenueVsOfficial}
          valueHeaders={["GAIA lines sum", "Official Revenue"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="MediaOcean within media forecast"
          description="MediaOcean media actuals must not exceed the total forecasted media spend for the same client and month."
          result={mediaOceanMedia}
          tolerance={tolerances.mediaOceanMedia}
          onToleranceChange={setTolerance("mediaOceanMedia")}
          valueHeaders={["MediaOcean", "Media forecast"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="MediaOcean within Labs forecast"
          description="MediaOcean Labs actuals must not exceed the total forecasted Labs spend for the same client and month."
          result={mediaOceanLabs}
          tolerance={tolerances.mediaOceanLabs}
          onToleranceChange={setTolerance("mediaOceanLabs")}
          valueHeaders={["MediaOcean", "Labs forecast"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="Media forecast above MediaOcean"
          description="For months with MediaOcean media actuals, the total forecasted media spend must not exceed them."
          result={mediaForecastAbove}
          tolerance={tolerances.mediaForecastAbove}
          onToleranceChange={setTolerance("mediaForecastAbove")}
          valueHeaders={["Media forecast", "MediaOcean"]}
          clientNameById={clientNameById}
        />
        <QaTestCard
          title="Labs forecast above MediaOcean"
          description="For months with MediaOcean Labs actuals, the total forecasted Labs spend must not exceed them."
          result={labsForecastAbove}
          tolerance={tolerances.labsForecastAbove}
          onToleranceChange={setTolerance("labsForecastAbove")}
          valueHeaders={["Labs forecast", "MediaOcean"]}
          clientNameById={clientNameById}
        />
      </div>
    </div>
  );
}
