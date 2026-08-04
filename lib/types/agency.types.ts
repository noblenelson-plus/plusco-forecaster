// lib/types/agency.types.ts

import type { ClientAgency } from "../constants/client.constants";

/**
 * An agency and the email domains that map to it.
 *
 * The document id and `name` mirror a `ClientAgency` value (the same string
 * stored on `clients.CL_Agency`), so agency-scoped access can reuse the
 * existing `assignedAgencies` / `CL_Agency` matching without a second lookup.
 *
 * When a user signs in, the domain of their email is matched (case-insensitive)
 * against every agency's `domains`. A match grants automatic, read-only
 * "agency employee" (VIEWER) access to that agency's clients.
 */
export interface Agency {
  // Document id — equal to `name` (a ClientAgency value).
  id: string;
  name: ClientAgency;
  // Email domains owned by the agency, stored lowercase, without the "@"
  // (e.g. "mekanism.com"). An agency may own several.
  domains: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Shape used by the admin agency editor.
export interface AgencyFormData {
  name: ClientAgency;
  domains: string[];
}
