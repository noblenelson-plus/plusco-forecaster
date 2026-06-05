// lib/services/commission-service.ts

import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CommissionsConfig } from "../types/client.types";
import {
  MediaType,
  MonthlyMap,
  MONTHS,
} from "../types/common.types";

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