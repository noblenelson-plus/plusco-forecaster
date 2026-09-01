// lib/format/client.ts
//
// Pure, Firebase-free helpers for reading the newer client attributes
// (per-year status, hidden flag, LABS eligibility). Keeping the fallback /
// "absent = default" rules here means callers never re-derive them.

import type { ClientStatus } from "../constants/client.constants";
import type {
  Client,
  ClientSummary,
  ForecastingType,
} from "../types/client.types";

/** Default per-axis forecasting toggles — everything enabled. */
export const DEFAULT_FORECASTING_TYPE: ForecastingType = {
  mediaSpend: true,
  labs: true,
  revenues: true,
};

/**
 * Test-client detection. A client counts as a test client when the word "TEST"
 * appears in its name as a standalone token — catching "1_TEST CLIENT" and
 * "TEST CLIENT" while leaving real names like "Contest" or "Latest" untouched.
 *
 * Test clients are excluded from the dashboard AND the QA reconciliation (so the
 * two share one definition and can't drift), but remain available in the
 * Forecast editing grid. Adjust the pattern here if the naming convention changes.
 */
export const TEST_CLIENT_PATTERN = /(^|[^a-z])test([^a-z]|$)/i;

export function isTestClient(name: string | undefined | null): boolean {
  return !!name && TEST_CLIENT_PATTERN.test(name);
}

type StatusCarrier = Pick<Client, "Client_Status_By_Year" | "Client_Status_2026">;

/**
 * Effective status for a given year.
 *
 * Resolution order: per-year map → legacy `Client_Status_2026` (only for 2026,
 * so pre-migration docs still render) → "ACTIVE" as a safe default.
 */
export function resolveClientStatus(
  client: StatusCarrier | ClientSummary,
  year: number
): ClientStatus {
  const fromMap = client.Client_Status_By_Year?.[year];
  if (fromMap) return fromMap;
  if (year === 2026 && "Client_Status_2026" in client && client.Client_Status_2026) {
    return client.Client_Status_2026;
  }
  return "ACTIVE";
}

/** A client is hidden only when the flag is explicitly true. */
export function isClientHidden(client: Pick<Client, "CL_Hidden">): boolean {
  return client.CL_Hidden === true;
}

/** Clients are eligible for a partner by default — only a stored `false` opts out. */
export function isEligibleForPartner(
  client: Pick<Client, "Labs_Eligibility">,
  partnerId: string
): boolean {
  return client.Labs_Eligibility?.[partnerId] !== false;
}