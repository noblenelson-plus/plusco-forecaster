// lib/dashboard/filters/use-dashboard-filters.ts

/**
 * The dashboard filter engine.
 *
 * Given the accessible clients, it owns the multi-select state and derives, per
 * facet, the *cascaded* options (faceted search): a facet's dropdown lists only
 * the values present among the clients that pass every OTHER active facet. The
 * final `filteredClients` are those passing ALL facets.
 *
 * Everything is driven by the FACETS registry — the hook never names a facet.
 */

import { useCallback, useMemo, useState } from "react";
import type { Client } from "../../types/client.types";
import { FACETS } from "./facets";
import {
  EMPTY_FILTER_STATE,
  type DashboardFilterState,
  type Facet,
  type FacetCtx,
  type FacetKey,
  type Option,
} from "./filter.types";

/** A single facet's view model for the filter bar. */
export interface FacetView {
  key: FacetKey;
  label: string;
  searchable: boolean;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export interface UseDashboardFiltersResult {
  facetViews: FacetView[];
  filteredClients: Client[];
  filteredClientIds: string[];
  totalAccessible: number;
  hasActiveFilters: boolean;
  reset: () => void;
}

/** Does a client pass a single facet's selection? (empty selection = passes) */
function matchesFacet(client: Client, facet: Facet, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(facet.getValue(client));
}

/** Does a client pass every facet except the excluded one? */
function matchesAllExcept(
  client: Client,
  selection: DashboardFilterState,
  exclude: FacetKey | null
): boolean {
  return FACETS.every(
    (f) => f.key === exclude || matchesFacet(client, f, selection[f.key])
  );
}

/** Distinct options for a facet over a client set, mapped through getLabel, sorted. */
function deriveOptions(
  facet: Facet,
  clients: Client[],
  ctx: FacetCtx
): Option[] {
  const seen = new Set<string>();
  const options: Option[] = [];
  for (const c of clients) {
    const value = facet.getValue(c);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: facet.getLabel(value, ctx) });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function useDashboardFilters(
  clients: Client[],
  usersMap: Map<string, string>
): UseDashboardFiltersResult {
  const [selection, setSelection] = useState<DashboardFilterState>(EMPTY_FILTER_STATE);

  const ctx = useMemo<FacetCtx>(() => {
    const clientNames = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
    return { usersMap, clientNames };
  }, [clients, usersMap]);

  const setFacet = useCallback((key: FacetKey, values: string[]) => {
    setSelection((prev) => ({ ...prev, [key]: values }));
  }, []);

  const reset = useCallback(() => setSelection(EMPTY_FILTER_STATE), []);

  // Per facet: options derived from clients passing every OTHER facet. Selected
  // values are kept in the list even if narrowed out, so they stay removable.
  const facetViews = useMemo<FacetView[]>(() => {
    return FACETS.map((facet) => {
      const base = clients.filter((c) => matchesAllExcept(c, selection, facet.key));
      const options = deriveOptions(facet, base, ctx);

      const selected = selection[facet.key];
      const present = new Set(options.map((o) => o.value));
      for (const value of selected) {
        if (!present.has(value)) {
          options.push({ value, label: facet.getLabel(value, ctx) });
        }
      }

      return {
        key: facet.key,
        label: facet.label,
        searchable: facet.searchable ?? false,
        options,
        selected,
        onChange: (values: string[]) => setFacet(facet.key, values),
      };
    });
  }, [clients, selection, ctx, setFacet]);

  const filteredClients = useMemo(
    () => clients.filter((c) => matchesAllExcept(c, selection, null)),
    [clients, selection]
  );

  const filteredClientIds = useMemo(
    () => filteredClients.map((c) => c.cl_id),
    [filteredClients]
  );

  const hasActiveFilters = useMemo(
    () => FACETS.some((f) => selection[f.key].length > 0),
    [selection]
  );

  return {
    facetViews,
    filteredClients,
    filteredClientIds,
    totalAccessible: clients.length,
    hasActiveFilters,
    reset,
  };
}
