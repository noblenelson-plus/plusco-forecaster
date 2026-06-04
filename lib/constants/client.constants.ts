// lib/constants/client.constants.ts

import type { Currency } from "../types/client.types";

// ─── Status ───────────────────────────────────────────────────────────────────

export const CLIENT_STATUSES = [
  { value: "ACTIVE",      label: "Active" },
  { value: "INACTIVE",    label: "Inactive" },
  { value: "LOSS",        label: "Loss" },
  { value: "NEW_CLIENT",  label: "New client" },
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number]["value"];

// ─── Tier ─────────────────────────────────────────────────────────────────────

export const CLIENT_TIERS = [
  { value: "FULL",    label: "Full" },
  { value: "GROW",    label: "Grow" },
  { value: "PARTNER", label: "Partner" },
] as const;

export type ClientTier = (typeof CLIENT_TIERS)[number]["value"];

// ─── Agency ───────────────────────────────────────────────────────────────────

export const CLIENT_AGENCIES = [
  { value: "Mekanism",       label: "Mekanism" },
  { value: "Cossette Media", label: "Cossette Media" },
  { value: "Jungle",         label: "Jungle" },
  { value: "Showroom",       label: "Showroom" },
] as const;

export type ClientAgency = (typeof CLIENT_AGENCIES)[number]["value"];

// ─── Business Unit / Region ───────────────────────────────────────────────────

export const CLIENT_REGIONS = [
  { value: "Ontario",  label: "Ontario" },
  { value: "USA",      label: "USA" },
  { value: "West",     label: "West" },
  { value: "QC/East",  label: "QC/East" },
] as const;

export type ClientRegion = (typeof CLIENT_REGIONS)[number]["value"];

// ─── Office ───────────────────────────────────────────────────────────────────

export const CLIENT_OFFICES = [
  { value: "Toronto",       label: "Toronto" },
  { value: "West Coast",    label: "West Coast" },
  { value: "Vancouver",     label: "Vancouver" },
  { value: "Montreal",      label: "Montreal" },
  { value: "Quebec City",   label: "Quebec City" },
  { value: "East Coast",    label: "East Coast" },
] as const;

export type ClientOffice = (typeof CLIENT_OFFICES)[number]["value"];

// ─── GM Pod ───────────────────────────────────────────────────────────────────

export const CLIENT_GM_PODS = [
  { value: "Brooke Leland",         label: "Brooke Leland" },
  { value: "Andrew Butts",          label: "Andrew Butts" },
  { value: "Danick Archambault",    label: "Danick Archambault" },
  { value: "Martin Soubeyran",      label: "Martin Soubeyran" },
  { value: "Marc-Antoine Grenier",  label: "Marc-Antoine Grenier" },
] as const;

export type ClientGMPod = (typeof CLIENT_GM_PODS)[number]["value"];

// ─── Currency ─────────────────────────────────────────────────────────────────

export const CLIENT_CURRENCIES: { value: Currency; label: string }[] = [
  { value: "CAD", label: "CAD" },
  { value: "USD", label: "USD" },
];

// ─── Fee Structure ────────────────────────────────────────────────────────────

export const CLIENT_FEE_STRUCTURES = [
  { value: "RETAINER",   label: "Retainer" },
  { value: "COMMISSION", label: "Commission" },
] as const;

export type FeeStructure = (typeof CLIENT_FEE_STRUCTURES)[number]["value"];

// ─── Status display helpers ───────────────────────────────────────────────────

export const STATUS_BADGE_COLORS: Record<ClientStatus, string> = {
  ACTIVE:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  INACTIVE:   "bg-gray-100 text-gray-500 border-gray-200",
  LOSS:       "bg-red-50 text-red-600 border-red-200",
  NEW_CLIENT: "bg-blue-50 text-blue-600 border-blue-200",
};

export const STATUS_DOT_COLORS: Record<ClientStatus, string> = {
  ACTIVE:     "bg-emerald-500",
  INACTIVE:   "bg-gray-400",
  LOSS:       "bg-red-500",
  NEW_CLIENT: "bg-blue-500",
};

// ─── Tier display helpers ─────────────────────────────────────────────────────

export const TIER_BADGE_COLORS: Record<ClientTier, string> = {
  FULL:    "bg-yellow-100 text-yellow-800",
  GROW:    "bg-blue-100 text-blue-800",
  PARTNER: "bg-gray-100 text-gray-600",
};