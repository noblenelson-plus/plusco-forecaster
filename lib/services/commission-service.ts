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
 * Service de gestion des commissions client.
 *
 * Format stocké (voir client.types.ts) : toujours mensuel.
 *   commissionsConfig[year][mediaType] = { 1: %, 2: %, ..., 12: % }
 *
 * Accessible à tous les users ayant accès au client (admins + BLs
 * assignés) — la rule Firestore n'autorise les BLs qu'à modifier
 * commissionsConfig / updatedAt sur le doc client, rien d'autre.
 */

// ─── Helpers de construction ──────────────────────────────────────────────────

/** 12 mois au même taux — le cas courant ("uniforme"). */
export function uniformRate(rate: number): MonthlyMap {
  return Object.fromEntries(MONTHS.map((m) => [m, rate]));
}

/**
 * Détecte si une MonthlyMap est uniforme (12 valeurs identiques).
 * Retourne le taux si uniforme, null sinon — pratique pour initialiser
 * l'UI en mode champ unique vs mode mensuel déplié.
 */
export function detectUniformRate(map: MonthlyMap | undefined): number | null {
  if (!map) return null;
  const values = MONTHS.map((m) => map[m] ?? 0);
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

/** Taux effectif pour un type/année/mois — 0 si non configuré. */
export function getRate(
  config: CommissionsConfig,
  year: number,
  mediaType: MediaType,
  month: number
): number {
  return config?.[year]?.[mediaType]?.[month] ?? 0;
}

/** L'année a-t-elle au moins un type configuré ? */
export function hasYearConfig(config: CommissionsConfig, year: number): boolean {
  return Object.keys(config?.[year] ?? {}).length > 0;
}

/** Années configurées, triées décroissant (pour le sélecteur d'année). */
export function configuredYears(config: CommissionsConfig): number[] {
  return Object.keys(config ?? {})
    .map(Number)
    .filter((y) => !Number.isNaN(y))
    .sort((a, b) => b - a);
}

/**
 * Copie la config d'une année vers une autre (deep copy).
 * Retourne une NOUVELLE CommissionsConfig — ne mute pas l'originale.
 * Si l'année source est vide, la cible est créée vide.
 */
export function copyYearConfig(
  config: CommissionsConfig,
  fromYear: number,
  toYear: number
): CommissionsConfig {
  const source = config?.[fromYear] ?? {};
  const copied: Partial<Record<MediaType, MonthlyMap>> = {};
  (Object.keys(source) as MediaType[]).forEach((type) => {
    copied[type] = { ...source[type]! };
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
 * Valide la config d'une année : taux numériques, entre 0 et 100.
 * Retourne la liste des violations (vide = OK).
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

// ─── Persistance ──────────────────────────────────────────────────────────────

/**
 * Remplace la config d'UNE année sur le doc client, sans toucher aux
 * autres années (dot-path Firestore : "commissionsConfig.2026").
 *
 * Écriture compatible avec la rule BL : seules les clés
 * commissionsConfig + updatedAt sont affectées.
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
 * Supprime entièrement la config d'une année.
 * (On écrit un objet vide plutôt que deleteField() pour rester simple
 * et compatible avec hasYearConfig.)
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