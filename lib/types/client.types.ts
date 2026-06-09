// lib/types/client.types.ts

import type {
  ClientStatus,
  ClientTier,
  FeeStructure,
  ClientAgency,
  ClientRegion,
  ClientOffice,
  ClientGMPod,
} from "../constants/client.constants";
import type { MediaType, MonthlyMap } from "./common.types";

export type { ClientStatus, ClientTier, FeeStructure };

export type Currency = "CAD" | "USD";

/**
 * Per-axis forecasting toggles. Stored on the client; currently a stored
 * attribute only (no tab/dashboard gating yet). Defaults to all `true`.
 */
export interface ForecastingType {
  mediaSpend: boolean;
  labs: boolean;
  revenues: boolean;
}

/**
 * LABS eligibility per partner. Partners are defined per year; a client is
 * eligible by default, so this map is sparse — only `false` entries are
 * stored. Read it through `isEligibleForPartner` (lib/format/client.ts),
 * never directly, so the "absent = eligible" rule stays in one place.
 */
export type LabsEligibility = Record<string, boolean>;

/**
 * Taux de commission (%) par type de média, par année, avec granularité
 * mensuelle.
 *
 * Format stocké : TOUJOURS mensuel (12 valeurs par type). Le cas courant
 * "même taux toute l'année" est représenté par 12 valeurs identiques —
 * l'UI détecte ce cas et affiche un champ unique (mode uniforme), mais le
 * moteur de calcul Revenue n'a qu'un seul format à gérer :
 *
 *   commission(month) = mediaSpend(type, month) × rate(type, month) / 100
 *
 * Exemple :
 * {
 *   2026: {
 *     social:       { 1: 12, 2: 12, ..., 12: 12 },   // uniforme 12%
 *     programmatic: { 1: 10, 2: 10, ..., 12: 15 },   // ajusté en déc.
 *   }
 * }
 *
 * Un type de média absent = pas de commission sur ce type pour l'année.
 */
export interface CommissionsConfig {
  [year: number]: Partial<Record<MediaType, MonthlyMap>>;
}

export interface Client {
  cl_id: string;
  CL_Name: string;
  CL_Logo?: string;                         // URL (Firebase Storage or external)
  CL_Agency: ClientAgency;
  CL_Business_Unit_Region: ClientRegion;
  CL_Office: ClientOffice;
  CL_Business_Lead: string;                 // User UID
  CL_Digital_Lead?: string;                 // User UID
  Client_Fee_Structure: FeeStructure;
  GM_Pod: ClientGMPod;
  CL_Currency: Currency;
  CL_GAIA_Number: string[];
  CL_Tier: ClientTier;
  /** Per-year status map (canonical). Resolve via `resolveClientStatus`. */
  Client_Status_By_Year: Record<number, ClientStatus>;
  /** Legacy single-year status — kept for read-time fallback only. */
  Client_Status_2026?: ClientStatus;
  /** Admin-only. When true, the client is hidden everywhere except the admin Clients page. */
  CL_Hidden?: boolean;
  /** Per-axis forecasting toggles (stored attribute, defaults to all true). */
  Forecasting_Type: ForecastingType;
  /** Sparse LABS eligibility map by partnerId (absent = eligible). */
  Labs_Eligibility?: LabsEligibility;
  Client_Notes?: string;
  commissionsConfig: CommissionsConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientFormData {
  CL_Name: string;
  CL_Logo?: string;
  CL_Agency: string;
  CL_Business_Unit_Region: string;
  CL_Office: string;
  CL_Business_Lead: string;
  CL_Digital_Lead?: string;
  Client_Fee_Structure: FeeStructure;
  GM_Pod: string;
  CL_Currency: Currency;
  CL_GAIA_Number: string[];
  CL_Tier: ClientTier;
  Client_Status_By_Year: Record<number, ClientStatus>;
  CL_Hidden?: boolean;
  Forecasting_Type: ForecastingType;
  Labs_Eligibility?: LabsEligibility;
  Client_Notes?: string;
  commissionsConfig: CommissionsConfig;
}

export interface ClientSummary {
  cl_id: string;
  CL_Name: string;
  CL_Logo?: string;
  CL_Agency: string;
  CL_Business_Lead: string;
  Client_Status_By_Year: Record<number, ClientStatus>;
  CL_Currency: Currency;
}