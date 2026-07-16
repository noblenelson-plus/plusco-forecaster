// lib/services/commission-service.ts

import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { Client, CommissionsConfig } from "../types/client.types";
import {
  MediaType,
  MonthlyMap,
  MONTHS,
} from "../types/common.types";
import { propagateCommissionForYear } from "./data-entry-service";

/**
 * Client commission management service.
 *
 * Stored format (see client.types.ts): always monthly.
 *   commissionsConfig[year][mediaType] = { 1: %, 2: %, ..., 12: % }
 *
 * Accessible to all users with access to the client (admins + assigned
 * BLs) — the Firestore rule only allows BLs to modify commissionsConfig
 * / updatedAt on the client doc, nothing else.
 */

// ─── Construction helpers ─────────────────────────────────────────────────────

/** 12 months at the same rate — the common ("uniform") case. */
export function uniformRate(rate: number): MonthlyMap {
  return Object.fromEntries(MONTHS.map((m) => [m, rate]));
}

/**
 * Detects whether a MonthlyMap is uniform (12 identical values).
 * Returns the rate if uniform, null otherwise — handy for initializing
 * the UI in single-field mode vs expanded monthly mode.
 */
export function detectUniformRate(map: MonthlyMap | undefined): number | null {
  if (!map) return null;
  const values = MONTHS.map((m) => map[m] ?? 0);
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

/** Effective rate for a type/year/month — 0 if not configured. */
export function getRate(
  config: CommissionsConfig,
  year: number,
  mediaType: MediaType,
  month: number
): number {
  return config?.[year]?.[mediaType]?.[month] ?? 0;
}

/** Does the year have at least one configured type? */
export function hasYearConfig(config: CommissionsConfig, year: number): boolean {
  return Object.keys(config?.[year] ?? {}).length > 0;
}

/** Configured years, sorted descending (for the year selector). */
export function configuredYears(config: CommissionsConfig): number[] {
  return Object.keys(config ?? {})
    .map(Number)
    .filter((y) => !Number.isNaN(y))
    .sort((a, b) => b - a);
}

/**
 * Copies the config from one year to another, carrying ONLY December's
 * value of each media type and applying it uniformly across the 12
 * months of the target year.
 *
 * Rationale: rates often shift at year-end, so December is the most
 * representative starting point for the following year.
 *
 * Returns a NEW CommissionsConfig — does not mutate the original.
 * If the source year is empty, the target is created empty.
 * If December is missing for a given media type, falls back to 0
 * (consistent with getRate's `?? 0` convention).
 */
export function copyYearConfig(
  config: CommissionsConfig,
  fromYear: number,
  toYear: number
): CommissionsConfig {
  const source = config?.[fromYear] ?? {};
  const copied: Partial<Record<MediaType, MonthlyMap>> = {};
  (Object.keys(source) as MediaType[]).forEach((type) => {
    const decemberRate = source[type]?.[12] ?? 0;
    copied[type] = uniformRate(decemberRate);
  });
  return { ...config, [toYear]: copied };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface CommissionValidationError {
  mediaType: MediaType;
  month: number;
  value: number;
  reason: string;
}

/**
 * Validates a year's config: numeric rates between 0 and 100.
 * Returns the list of violations (empty = OK).
 */
export function validateYearConfig(
  yearConfig: Partial<Record<MediaType, MonthlyMap>>
): CommissionValidationError[] {
  const errors: CommissionValidationError[] = [];
  (Object.keys(yearConfig) as MediaType[]).forEach((type) => {
    const map = yearConfig[type]!;
    MONTHS.forEach((m) => {
      const v = map[m] ?? 0;
      if (typeof v !== "number" || Number.isNaN(v)) {
        errors.push({ mediaType: type, month: m, value: v, reason: "Not a number" });
      } else if (v < 0 || v > 100) {
        errors.push({
          mediaType: type,
          month: m,
          value: v,
          reason: "Rate must be between 0 and 100",
        });
      }
    });
  });
  return errors;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Replaces ONE year's config on the client doc without touching the
 * other years (Firestore dot-path: "commissionsConfig.2026").
 *
 * Write compatible with the BL rule: only commissionsConfig + updatedAt
 * keys are affected.
 */
export async function saveYearCommissions(
  clId: string,
  year: number,
  yearConfig: Partial<Record<MediaType, MonthlyMap>>
): Promise<void> {
  const errors = validateYearConfig(yearConfig);
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `Invalid rate for ${first.mediaType} (month ${first.month}): ${first.reason}`
    );
  }

  await updateDoc(doc(db, "clients", clId), {
    [`commissionsConfig.${year}`]: yearConfig,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Fully removes a year's config.
 * (We write an empty object rather than deleteField() to stay simple
 * and compatible with hasYearConfig.)
 */
export async function clearYearCommissions(
  clId: string,
  year: number
): Promise<void> {
  await updateDoc(doc(db, "clients", clId), {
    [`commissionsConfig.${year}`]: {},
    updatedAt: new Date().toISOString(),
  });
}

// ─── Bulk year-to-year copy (admin) ───────────────────────────────────────────

/** One client's planned copy. Produced by computeCommissionCopy (a dry run). */
export interface CommissionCopyItem {
  cl_id: string;
  name: string;
  /** Media types configured in the source year (what gets copied). */
  mediaTypes: MediaType[];
  /** True when the target year already had at least one configured type. */
  hadTargetConfig: boolean;
  /** Target-year config to write (December rate applied uniformly). */
  yearConfig: Partial<Record<MediaType, MonthlyMap>>;
}

export interface CommissionCopyReport {
  fromYear: number;
  toYear: number;
  /** Clients whose rates will be written on apply. */
  copies: CommissionCopyItem[];
  /** Target year already configured and overwrite is off — left untouched. */
  skippedExisting: { cl_id: string; name: string }[];
  /** No source-year config — nothing to copy. */
  skippedNoSource: { cl_id: string; name: string }[];
}

/**
 * Dry run: plans the bulk copy of commission rates from one year to another
 * across every given client, following copyYearConfig's semantics (each
 * type's December rate applied uniformly to the target year). Pure — no
 * reads or writes; call applyCommissionCopy with the report after the admin
 * confirms.
 */
export function computeCommissionCopy(
  clients: Client[],
  fromYear: number,
  toYear: number,
  overwrite: boolean
): CommissionCopyReport {
  const copies: CommissionCopyItem[] = [];
  const skippedExisting: { cl_id: string; name: string }[] = [];
  const skippedNoSource: { cl_id: string; name: string }[] = [];

  for (const client of clients) {
    const config = client.commissionsConfig ?? {};
    const sourceTypes = Object.keys(config[fromYear] ?? {}) as MediaType[];
    if (sourceTypes.length === 0) {
      skippedNoSource.push({ cl_id: client.cl_id, name: client.CL_Name });
      continue;
    }
    const hadTargetConfig = hasYearConfig(config, toYear);
    if (hadTargetConfig && !overwrite) {
      skippedExisting.push({ cl_id: client.cl_id, name: client.CL_Name });
      continue;
    }
    copies.push({
      cl_id: client.cl_id,
      name: client.CL_Name,
      mediaTypes: sourceTypes,
      hadTargetConfig,
      yearConfig: copyYearConfig(config, fromYear, toYear)[toYear] ?? {},
    });
  }

  return { fromYear, toYear, copies, skippedExisting, skippedNoSource };
}

/**
 * Writes a dry-run report's copies (batches of 500), then re-syncs the
 * derived Revenue commission of the target year for each copied client —
 * only existing unlocked submissions are touched, usually none for a fresh
 * year. Propagation failures are collected rather than thrown: the rates
 * themselves are already saved at that point, and re-applying the copy (or
 * re-saving a client's rates) retries the sync.
 */
export async function applyCommissionCopy(
  report: CommissionCopyReport,
  onSyncProgress?: (done: number, total: number) => void
): Promise<{ written: number; syncFailures: string[] }> {
  const BATCH_SIZE = 500;
  const now = new Date().toISOString();

  for (let start = 0; start < report.copies.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    report.copies.slice(start, start + BATCH_SIZE).forEach((c) => {
      batch.update(doc(db, "clients", c.cl_id), {
        [`commissionsConfig.${report.toYear}`]: c.yearConfig,
        updatedAt: now,
      });
    });
    await batch.commit();
  }

  // Chunked to bound concurrent Firestore traffic.
  const CONCURRENCY = 10;
  const syncFailures: string[] = [];
  let done = 0;
  for (let start = 0; start < report.copies.length; start += CONCURRENCY) {
    await Promise.all(
      report.copies.slice(start, start + CONCURRENCY).map(async (c) => {
        try {
          await propagateCommissionForYear(c.cl_id, report.toYear, c.yearConfig);
        } catch (err) {
          console.error(`Commission sync failed for ${c.name}:`, err);
          syncFailures.push(c.name);
        }
        done++;
        onSyncProgress?.(done, report.copies.length);
      })
    );
  }

  return { written: report.copies.length, syncFailures };
}