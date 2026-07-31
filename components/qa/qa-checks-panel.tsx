// components/qa/qa-checks-panel.tsx
"use client";

/**
 * QA checks panel — admin data-consistency checks over the in-scope forecast
 * data. Since the flags refonte, only two checks live here (the MediaOcean and
 * Labs-vs-media checks moved to the per-BL cat-2 alerts on the forecast/Flags
 * pages): Commission-matches-media and GAIA-lines-match-Official-Revenue. Each
 * is a card that passes or fails, listing the offending client × month combos.
 */

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import QaTestCard from "./qa-test-card";
import { LoadingTab, NoContextNotice } from "../dashboard/tabs/tab-states";
import {
  checkCommissionMatchesMedia,
  checkRevenueActualsMatchOfficial,
  DEFAULT_QA_TOLERANCE,
  type YearCommissionRates,
} from "../../lib/dashboard/data/qa-checks";
import type { ScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";

/** One slider per check — session-only state, deliberately not persisted. */
type CheckId = "commissionVsMedia" | "revenueVsOfficial";

const CHECK_IDS: CheckId[] = ["commissionVsMedia", "revenueVsOfficial"];

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
  const revenueVsOfficial = checkRevenueActualsMatchOfficial(
    data.revenueActualsByClient,
    tolerances.revenueVsOfficial
  );

  const results = [commissionVsMedia, revenueVsOfficial];
  const failing = results.filter((r) => r.status === "fail").length;
  const allPass = failing === 0;

  return (
    <div className="space-y-6">
      <div
        className={`flex items-center gap-3 border px-4 py-3 text-sm ${
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
          title="GAIA lines match Official Revenue"
          description="For each month where both are entered, the sum of the GAIA admin lines must equal the Official Revenue."
          result={revenueVsOfficial}
          tolerance={tolerances.revenueVsOfficial}
          onToleranceChange={setTolerance("revenueVsOfficial")}
          valueHeaders={["GAIA lines sum", "Official Revenue"]}
          clientNameById={clientNameById}
        />
      </div>
    </div>
  );
}
