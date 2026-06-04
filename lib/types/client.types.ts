// lib/types/client.types.ts

export type FeeStructure = "RETAINER" | "COMMISSION";
export type ClientStatus = "ACTIVE" | "INACTIVE";
export type ClientTier = "TIER_1" | "TIER_2" | "TIER_3";
export type Currency = "CAD" | "USD" | "EUR" | "GBP";

// Commission rates per media type per year
export interface CommissionsConfig {
  [year: number]: {
    social?: number;
    programmatic?: number;
    ooh?: number;
    print?: number;
    tv?: number;
    radio?: number;
    sem?: number;
    digitalDirect?: number;
  };
}

export interface Client {
  cl_id: string;
  CL_Name: string;
  CL_Logo?: string;
  CL_Agency: string;
  CL_Business_Unit_Region: string;
  CL_Office: string;
  CL_Business_Lead: string;   // User UID
  CL_Digital_Lead?: string;   // User UID
  Client_Fee_Structure: FeeStructure;
  GM_Pod: string;
  CL_Currency: Currency;
  CL_GAIA_Number: string[];   // Can be multiple
  CL_Tier: ClientTier;
  Client_Status_2026: ClientStatus;
  Client_Notes?: string;
  commissionsConfig: CommissionsConfig;
  createdAt?: string;
  updatedAt?: string;
}

// Used in admin client creation / edit forms
export interface ClientFormData {
  CL_Name: string;
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
  Client_Status_2026: ClientStatus;
  Client_Notes?: string;
  commissionsConfig: CommissionsConfig;
}

// Lightweight version for lists / dropdowns
export interface ClientSummary {
  cl_id: string;
  CL_Name: string;
  CL_Logo?: string;
  CL_Agency: string;
  CL_Business_Lead: string;
  Client_Status_2026: ClientStatus;
  CL_Currency: Currency;
}