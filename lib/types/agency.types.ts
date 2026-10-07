// lib/types/agency.types.ts

import type { ClientAgency } from "../constants/client.constants";

/**
 * An agency and the email domains that map to it.
 *
 * The document id and `name` mirror a `ClientAgency` value (the same string
 * stored on `clients.CL_Agency`), so agency scopes match clients directly.
 *
 * A person's email domain is matched (case-insensitive) against every agency's
 * `domains` to find their agency on dashboards in Agency mode. The match
 * grants no access by itself — dashboards are opened by grants.
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
