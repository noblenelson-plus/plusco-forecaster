// lib/hooks/use-milestone-batch-check.ts

/**
 * Runs one milestone step's check across many clients at once — the engine
 * behind "Run a check for every client I can edit" on the Milestones page.
 *
 * Resolves the shared inputs a check needs (all RFQs, the Labs partner → name
 * map, the admin month windows, the acting user) once, then fans out
 * runClientStepCheck over the given clients with a bounded concurrency so a
 * large agency doesn't open hundreds of Firestore reads at once. Progress and a
 * per-status summary are exposed for the UI; a client whose write is rejected
 * (e.g. not actually writable) is captured as an error, never aborting the rest.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth-context";
import type { ConfirmationStep } from "../constants/confirmation-steps";
import type { RFQ } from "../types/rfq.types";
import type { LabsPartner } from "../types/labs.types";
import { subscribeToRFQs } from "../services/rfq-service";
import { subscribeToLabsPartners } from "../services/labs-partner-service";
import { fetchStepWindows } from "../services/flag-config-service";
import {
  runClientStepCheck,
  type ClientStepCheckResult,
} from "../services/milestone-check-service";

/** How many clients are checked in parallel — keeps Firestore load bounded. */
const CONCURRENCY = 6;

export interface BatchProgress {
  done: number;
  total: number;
}

export interface BatchError {
  clientId: string;
  message: string;
}

export interface BatchSummary {
  validated: number;
  failed: number;
  skipped: number;
  errored: number;
  results: ClientStepCheckResult[];
  errors: BatchError[];
}

export interface UseMilestoneBatchCheckResult {
  /** True once the shared deps (RFQs + partners) have loaded. */
  ready: boolean;
  running: boolean;
  progress: BatchProgress | null;
  summary: BatchSummary | null;
  /**
   * Run the step's check for the given clients + year. Only already-validated
   * steps are refreshed — never-validated ones are skipped (see
   * runClientStepCheck). Resolves when all finish.
   */
  run: (step: ConfirmationStep, clientIds: string[], year: number) => Promise<void>;
  /** Clear the last run's progress + summary. */
  reset: () => void;
}

/** Bounded-concurrency fan-out — at most `limit` workers active at a time. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

export function useMilestoneBatchCheck(): UseMilestoneBatchCheckResult {
  const { user } = useAuth();

  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => subscribeToRFQs(setRFQs), []);

  const [partners, setPartners] = useState<LabsPartner[]>([]);
  useEffect(() => subscribeToLabsPartners(setPartners), []);

  const partnerLabel = useMemo(() => {
    const byId = new Map(partners.map((p) => [p.partnerId, p.name]));
    return (partnerId: string) => byId.get(partnerId) ?? partnerId;
  }, [partners]);

  const allRfqs = useMemo(
    () => rfqs.map((r) => ({ year: r.year, type: r.type })),
    [rfqs]
  );

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  // Keep the latest deps + a re-entrancy guard reachable from the async run
  // without re-creating it (so `run` keeps a stable identity).
  const depsRef = useRef({ allRfqs, partnerLabel });
  depsRef.current = { allRfqs, partnerLabel };
  const runningRef = useRef(false);
  const uid = user?.uid;

  const reset = useCallback(() => {
    setProgress(null);
    setSummary(null);
  }, []);

  const run = useCallback(
    async (step: ConfirmationStep, clientIds: string[], year: number): Promise<void> => {
      if (runningRef.current || clientIds.length === 0) return;
      runningRef.current = true;

      setRunning(true);
      setSummary(null);
      setProgress({ done: 0, total: clientIds.length });

      // Windows are admin config that changes rarely — read the current value
      // once, at run start, so a mid-session admin edit is honored.
      let windows: Awaited<ReturnType<typeof fetchStepWindows>> = {};
      try {
        windows = await fetchStepWindows();
      } catch (err) {
        console.error("Failed to load step windows for the batch check:", err);
      }

      const deps = {
        allRfqs: depsRef.current.allRfqs,
        partnerLabel: depsRef.current.partnerLabel,
        windows,
        ...(uid ? { userUid: uid } : {}),
      };

      const results: ClientStepCheckResult[] = [];
      const errors: BatchError[] = [];
      let done = 0;

      await runPool(clientIds, CONCURRENCY, async (clientId) => {
        try {
          results.push(await runClientStepCheck(clientId, year, step, deps));
        } catch (err) {
          errors.push({
            clientId,
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          done += 1;
          setProgress({ done, total: clientIds.length });
        }
      });

      setSummary({
        validated: results.filter((r) => r.status === "validated").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errored: errors.length,
        results,
        errors,
      });
      setRunning(false);
      runningRef.current = false;
    },
    [uid]
  );

  return {
    ready: rfqs.length > 0,
    running,
    progress,
    summary,
    run,
    reset,
  };
}
