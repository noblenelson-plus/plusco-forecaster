// lib/dashboard/filters/filter.types.ts

import type { Client } from "../../types/client.types";

/** Dropdown option — same shape as MultiSelectDropdown expects. */
export interface Option {
  value: string;
  label: string;
}

/** The set of available facets. Add a key here + an entry in FACETS to add a filter. */
export type FacetKey =
  | "agencies"
  | "gmPods"
  | "regions"
  | "offices"
  | "tiers"
  | "businessLeads"
  | "clients";

/** Current multi-select state: a list of selected values per facet. */
export type DashboardFilterState = Record<FacetKey, string[]>;

/** Context passed to facets for resolving dynamic labels (e.g. UID → name). */
export interface FacetCtx {
  /** uid → display name (Business Lead facet). */
  usersMap: Map<string, string>;
  /** cl_id → client name (Client facet). */
  clientNames: Map<string, string>;
}

/**
 * A facet is a declarative filter dimension. Options are always derived from the
 * accessible clients (which gives cascading for free); `getLabel` resolves a raw
 * value to a display label.
 */
export interface Facet {
  key: FacetKey;
  label: string;
  searchable?: boolean;
  /** The facet value of a client — used both for matching and as the option value. */
  getValue: (client: Client) => string;
  /** Resolve a value to a human-readable label. */
  getLabel: (value: string, ctx: FacetCtx) => string;
}

export const EMPTY_FILTER_STATE: DashboardFilterState = {
  agencies: [],
  gmPods: [],
  regions: [],
  offices: [],
  tiers: [],
  businessLeads: [],
  clients: [],
};
