// lib/types/client.types.ts

import type {
  ClientStatus,
  ClientTier,
  FeeStructure,
  ClientAgency,
  ClientRegion,
  ClientOffice,
  ClientGMPod,
  AdvertiserVertical,
} from "../constants/client.constants";
import type { MediaType, MonthlyMap } from "./common.types";

export type { ClientStatus, ClientTier, FeeStructure, AdvertiserVertical };

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
 * Commission rates (%) per media type, per year, at monthly granularity.
 *
 * Stored format: ALWAYS monthly (12 values per type). The common "same rate
 * all year" case is stored as 12 identical values — the UI detects it and
 * shows a single field (uniform mode), but the Revenue engine only has one
 * format to handle:
 *
 *   commission(month) = mediaSpend(type, month) × rate(type, month) / 100
 *
 * Example:
 * {
 *   2026: {
 *     social:       { 1: 12, 2: 12, ..., 12: 12 },   // uniform 12%
 *     programmatic: { 1: 10, 2: 10, ..., 12: 15 },   // adjusted in Dec.
 *   }
 * }
 *
 * A missing media type = no commission on that type for the year.
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
  CL_Business_Lead: string;                 // Email (older docs may hold a uid)
  CL_Digital_Lead?: string;                 // Email (older docs may hold a uid)
  /** Extra team members (lowercase emails); same edit access as the BL / DL. */
  CL_Collaborators?: string[];
  /**
   * Derived, never edited by hand: BL + DL + GM Pod emails + collaborators,
   * normalized (`computeTeamEmails`). Security rules and the "my clients"
   * query (`array-contains`) read it. Absent on pre-migration docs.
   */
  CL_Team_Emails?: string[];
  Client_Fee_Structure: FeeStructure;
  GM_Pod: ClientGMPod;
  CL_Currency: Currency;
  CL_GAIA_Number: string[];
  CL_Tier: ClientTier;
  /** Industry vertical of the advertiser. Optional — absent on older docs. */
  CL_Advertiser_Vertical?: AdvertiserVertical;
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
  /**
   * MediaBox client document IDs this forecaster client maps to. One
   * forecaster client may span several MediaBox clients, so their actuals are
   * summed together. Empty/absent → no MediaBox actuals for this client.
   */
  CL_MediaBox_IDs?: string[];
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
  CL_Collaborators?: string[];
  Client_Fee_Structure: FeeStructure;
  GM_Pod: string;
  CL_Currency: Currency;
  CL_GAIA_Number: string[];
  CL_Tier: ClientTier;
  /** "" while unselected in the form; validated dropdowns allow empty. */
  CL_Advertiser_Vertical?: string;
  Client_Status_By_Year: Record<number, ClientStatus>;
  CL_Hidden?: boolean;
  Forecasting_Type: ForecastingType;
  Labs_Eligibility?: LabsEligibility;
  CL_MediaBox_IDs?: string[];
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