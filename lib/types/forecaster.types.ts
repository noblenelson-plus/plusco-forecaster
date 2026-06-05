// lib/types/forecaster.types.ts

/**
 * Modèle de données générique des 3 axes de saisie (Media, Revenue, Labs).
 *
 * Hiérarchie :
 *   Niveau 1 — Catégorie : BL_INPUT (saisie BL) vs ADMIN_INPUT (actuals admin)
 *   Niveau 2 — Bucket    : groupe de lignes (projet/campagne pour Media)
 *   Niveau 3 — Row       : ligne typée (media type / revenue stream / partenaire)
 *                          portant 12 valeurs mensuelles ($)
 *
 * Stockage Firestore — collection "data_entries" :
 *   Document ID : {cl_id}_{year}_{rfqType}   ex. "CL_ACME_123_2026_RFQ0"
 *   Les données de chaque axe vivent sous axes.{axisId}, ce qui permet
 *   au service de lire/écrire n'importe quel axe via un simple dot-path
 *   ("axes.media") sans toucher aux autres.
 *
 * Le verrouillage n'est PAS dupliqué ici : il est porté par le document
 * RFQ (collection "rfqs", temps réel) — un RFQ LOCKED rend toute saisie
 * read-only, quel que soit l'axe.
 */

import type { MonthlyMap } from "./common.types";
import type { RFQType } from "./rfq.types";

// ─── Identifiants d'axe et catégories ────────────────────────────────────────

export type AxisId = "media" | "revenue" | "labs";

/** Niveau 1 — qui a le droit d'éditer la donnée. */
export type InputCategory = "BL_INPUT" | "ADMIN_INPUT";

// ─── Niveau 3 — Row ──────────────────────────────────────────────────────────

/**
 * Ligne de saisie générique.
 * `rowType` est volontairement un string libre : MediaType pour Media,
 * stream pour Revenue, partnerId pour Labs. Chaque axe contraint les
 * valeurs permises via son AxisConfig (rowTypeOptions).
 */
export interface ForecastRow {
  rowId: string;
  rowType: string;
  /** Libellé affiché — dérivé du type ou saisi (ex. nom de partenaire). */
  label: string;
  months: MonthlyMap;
}

// ─── Niveau 2 — Bucket ───────────────────────────────────────────────────────

export interface ForecastBucket {
  bucketId: string;
  name: string;
  rows: ForecastRow[];
}

// ─── Données d'un axe (BL_INPUT + ADMIN_INPUT) ───────────────────────────────

export interface AxisData {
  /** BL_INPUT — saisie des Business Leads, groupée en buckets. */
  buckets: ForecastBucket[];
  /** ADMIN_INPUT — actuals mensuels injectés par les admins (read-only BL). */
  actuals: MonthlyMap;
}

// ─── Document Firestore "data_entries" ───────────────────────────────────────

export interface DataEntry {
  /** = ID du document : {cl_id}_{year}_{rfqType} */
  entry_id: string;
  clientId: string;
  year: number;
  rfq: RFQType;
  axes: Partial<Record<AxisId, AxisData>>;
  createdAt?: string;
  updatedAt?: string;
  lastModifiedBy?: string; // User UID
}

export function buildDataEntryId(
  clientId: string,
  year: number,
  rfq: RFQType
): string {
  return `${clientId}_${year}_${rfq}`;
}

// ─── Configuration d'axe (ce qui rend le grid réutilisable) ──────────────────

export interface RowTypeOption {
  value: string;
  label: string;
}

/**
 * Décrit le comportement d'un axe pour le grid générique.
 * Media : multi-buckets (projets), lignes typées par media type.
 * Revenue (à venir) : mono-bucket implicite, lignes = streams.
 * Labs (à venir) : mono-bucket, lignes = partenaires.
 */
export interface AxisConfig {
  axisId: AxisId;
  /** Titre de la page / du grid — ex. "Media Spend". */
  title: string;
  /** Libellé d'un bucket — ex. "Project". */
  bucketLabel: string;
  /** Libellé du type de ligne — ex. "Media type". */
  rowTypeLabel: string;
  /** Types de lignes permis (Niveau 3). */
  rowTypeOptions: RowTypeOption[];
  /** false → un seul bucket implicite, l'UI masque la notion de groupe. */
  allowMultipleBuckets: boolean;
  /** Une même valeur de rowType peut-elle apparaître 2× dans un bucket ? */
  allowDuplicateRowTypes: boolean;
  /** Libellé de la section actuals — ex. "Actuals (admin)". */
  actualsLabel: string;
}

// ─── Coordonnées de cellule + dirty tracking ─────────────────────────────────

/**
 * Coordonnée d'une cellule éditable.
 * Les actuals utilisent category ADMIN_INPUT et bucketId/rowId à null.
 */
export interface CellCoord {
  category: InputCategory;
  bucketId: string | null;
  rowId: string | null;
  month: number;
}

/** Clé sérialisée pour la dirty map — stable et lisible en debug. */
export function buildCellKey(coord: CellCoord): string {
  return `${coord.category}:${coord.bucketId ?? "-"}:${coord.rowId ?? "-"}:${coord.month}`;
}

/** Map cellule → nouvelle valeur, en attente de Save. */
export type DirtyMap = Map<string, number>;

// ─── Comparaison entre RFQs ──────────────────────────────────────────────────

export interface CellVariance {
  current: number;
  reference: number;
  absolute: number;        // current − reference
  /** En % de la référence — null si référence = 0 (division impossible). */
  relative: number | null;
}

export function computeVariance(
  current: number,
  reference: number
): CellVariance {
  const absolute = current - reference;
  return {
    current,
    reference,
    absolute,
    relative: reference !== 0 ? (absolute / reference) * 100 : null,
  };
}

// ─── Factories ───────────────────────────────────────────────────────────────

import { MONTHS } from "./common.types";

export function emptyMonthly(): MonthlyMap {
  return Object.fromEntries(MONTHS.map((m) => [m, 0]));
}

export function emptyAxisData(): AxisData {
  return { buckets: [], actuals: emptyMonthly() };
}

let idCounter = 0;
/** ID court unique côté client — suffisant pour des éléments imbriqués au doc. */
function localId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function newBucket(name: string): ForecastBucket {
  return { bucketId: localId("bk"), name, rows: [] };
}

export function newRow(rowType: string, label: string): ForecastRow {
  return { rowId: localId("rw"), rowType, label, months: emptyMonthly() };
}

export function newDataEntry(
  clientId: string,
  year: number,
  rfq: RFQType
): DataEntry {
  return {
    entry_id: buildDataEntryId(clientId, year, rfq),
    clientId,
    year,
    rfq,
    axes: {},
  };
}

// ─── Config de l'axe Media ───────────────────────────────────────────────────

import { MEDIA_TYPES, type MediaType } from "./common.types";

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  social: "Social",
  programmatic: "Programmatic",
  ooh: "OOH",
  print: "Print",
  tv: "TV",
  radio: "Radio",
  sem: "SEM",
  digitalDirect: "Digital Direct",
};

export const MEDIA_AXIS_CONFIG: AxisConfig = {
  axisId: "media",
  title: "Media Spend",
  bucketLabel: "Project",
  rowTypeLabel: "Media type",
  rowTypeOptions: MEDIA_TYPES.map((t) => ({
    value: t,
    label: MEDIA_TYPE_LABELS[t],
  })),
  allowMultipleBuckets: true,
  // Deux lignes "Social" dans un même projet n'ont pas de sens — interdit.
  allowDuplicateRowTypes: false,
  actualsLabel: "Actuals",
};