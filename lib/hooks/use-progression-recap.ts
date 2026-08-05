// lib/hooks/use-progression-recap.ts

/**
 * Fetches, for every in-scope client, the validation status of each milestone
 * step for the selected year. A step's status mirrors the live forecast control
 * (deriveStepStatus): not validated / validated / failed / BL data changed /
 * MediaOcean changed.
 *
 * Per client we read in parallel: the {client, year} step-validation records,
 * one data_entries doc per distinct target RFQ (for `forecastEditedAt` and the
 * stored flags), and the annual MediaOcean actuals (to detect MO drift) — the
 * same inputs the live status uses. A stale request (scope/year changed
 * mid-flight) is discarded via a cancellation flag.
 */

"use client";

import { useEffect, useState } from "react";
import { fetchStepValidations } from "../services/forecast-validation-service";
import { fetchDataEntry } from "../services/data-entry-service";
import { fetchAnnualActualsEntry } from "../services/annual-actuals-service";
import { CONFIRMATION_STEPS } from "../constants/confirmation-steps";
import { deriveStepStatus, flagsMoDrift } from "../flags/status";
import { emptyMonthly, type ForecastRow } from "../types/forecaster.types";
import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { RFQType } from "../types/rfq.types";
import type { RfqValidationStatus, StoredFlagMap } from "../types/forecast-flags.types";

export interface RecapRow {
  clientId: string;
  /** Status of each confirmation step, keyed by step id. */
  statusByStep: Record<string, RfqValidationStatus>;
}

export interface UseProgressionRecapParams {
  clientIds: string[];
  year: number | null;
  /**
   * Bump to force a re-fetch without changing the client set or year — used
   * after a batch milestone check writes new validations so the table reflects
   * them (the reads are one-shot, not live subscriptions).
   */
  refreshKey?: number;
}

export interface UseProgressionRecapResult {
  rows: RecapRow[];
  loading: boolean;
  error: string | null;
}

/** Distinct target RFQs across all milestone steps (RFQ0…RFQ3). */
const TARGET_RFQS: RFQType[] = [
  ...new Set(CONFIRMATION_STEPS.map((s) => s.targetRfq)),
];

/**
 * Group actuals rows into per-subject (rowType) monthly totals — media type for
 * Media, partner id for Labs — matching the per-subject under-target flags.
 */
function rowsToMonthlyByType(
  rows: ForecastRow[] | undefined
): Record<string, MonthlyMap> {
  const out: Record<string, MonthlyMap> = {};
  for (const r of rows ?? []) {
    const acc = (out[r.rowType] ??= emptyMonthly());
    for (const m of MONTHS) acc[m] += r.months[m] ?? 0;
  }
  return out;
}

export function useProgressionRecap({
  clientIds,
  year,
  refreshKey = 0,
}: UseProgressionRecapParams): UseProgressionRecapResult {
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientKey = clientIds.join(",");

  useEffect(() => {
    if (!year || clientIds.length === 0) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      clientIds.map(async (clientId): Promise<RecapRow> => {
        const [validations, annual, ...entries] = await Promise.all([
          fetchStepValidations(clientId, year),
          fetchAnnualActualsEntry(clientId, year),
          ...TARGET_RFQS.map((rfq) => fetchDataEntry(clientId, year, rfq)),
        ]);

        // Per-target-RFQ: forecastEditedAt + stored flags.
        const byRfq = new Map<RFQType, { forecastEditedAt?: string; flags: StoredFlagMap }>();
        TARGET_RFQS.forEach((rfq, i) => {
          const entry = entries[i];
          byRfq.set(rfq, {
            forecastEditedAt: entry?.forecastEditedAt,
            flags: (entry?.flags as StoredFlagMap | undefined) ?? {},
          });
        });

        const currentMo = {
          media: rowsToMonthlyByType(annual.media),
          labs: rowsToMonthlyByType(annual.labs),
        };

        const statusByStep: Record<string, RfqValidationStatus> = {};
        for (const step of CONFIRMATION_STEPS) {
          const rfqData = byRfq.get(step.targetRfq);
          const flags = rfqData ? Object.values(rfqData.flags) : [];
          statusByStep[step.id] = deriveStepStatus({
            validation: validations[step.id],
            forecastEditedAt: rfqData?.forecastEditedAt,
            moDrift: flagsMoDrift(flags, currentMo),
          });
        }
        return { clientId, statusByStep };
      })
    )
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Milestones recap fetch failed:", err);
        setError("Failed to load the milestones recap.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, year, refreshKey]);

  return { rows, loading, error };
}
