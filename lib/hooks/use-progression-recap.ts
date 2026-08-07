// lib/hooks/use-progression-recap.ts

/**
 * Fetches, for every in-scope client, the validation status of each milestone
 * step for the selected year. A step's status mirrors the live forecast control
 * (deriveStepStatus): not validated / validated / failed.
 *
 * The status is now just the stored outcome, so we only read the {client, year}
 * step-validation record per client — a validated step is kept current by the
 * auto-recheck on save and the batch milestone check, so there is no staleness
 * to recompute here (the old per-RFQ data_entries + MediaOcean reads are gone).
 * A stale request (scope/year changed mid-flight) is discarded via a
 * cancellation flag.
 */

"use client";

import { useEffect, useState } from "react";
import { fetchStepValidations } from "../services/forecast-validation-service";
import { CONFIRMATION_STEPS } from "../constants/confirmation-steps";
import { deriveStepStatus } from "../flags/status";
import type { RfqValidationStatus } from "../types/forecast-flags.types";

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
        const validations = await fetchStepValidations(clientId, year);
        const statusByStep: Record<string, RfqValidationStatus> = {};
        for (const step of CONFIRMATION_STEPS) {
          statusByStep[step.id] = deriveStepStatus({
            validation: validations[step.id],
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
