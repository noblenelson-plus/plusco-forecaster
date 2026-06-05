// lib/dashboard/filters/facets.ts

/**
 * Declarative registry of dashboard filter facets.
 *
 * To add a filter: add a key to `FacetKey` (filter.types.ts) and one entry
 * here. Everything downstream (cascading options, the filter bar UI, the
 * filtered client set) is driven by this list — no other file changes.
 */

import {
  CLIENT_AGENCIES,
  CLIENT_GM_PODS,
  CLIENT_REGIONS,
  CLIENT_OFFICES,
  CLIENT_TIERS,
} from "../../constants/client.constants";
import type { Facet } from "./filter.types";

/** Build a `value → label` resolver from a constant `{ value, label }[]` set. */
function labelMap(
  set: readonly { value: string; label: string }[]
): (value: string) => string {
  const map = new Map(set.map((o) => [o.value, o.label]));
  return (value) => map.get(value) ?? value;
}

const agencyLabel = labelMap(CLIENT_AGENCIES);
const gmPodLabel = labelMap(CLIENT_GM_PODS);
const regionLabel = labelMap(CLIENT_REGIONS);
const officeLabel = labelMap(CLIENT_OFFICES);
const tierLabel = labelMap(CLIENT_TIERS);

export const FACETS: Facet[] = [
  {
    key: "agencies",
    label: "Agency",
    getValue: (c) => c.CL_Agency,
    getLabel: (v) => agencyLabel(v),
  },
  {
    key: "gmPods",
    label: "GM Pod",
    getValue: (c) => c.GM_Pod,
    getLabel: (v) => gmPodLabel(v),
  },
  {
    key: "regions",
    label: "Region",
    getValue: (c) => c.CL_Business_Unit_Region,
    getLabel: (v) => regionLabel(v),
  },
  {
    key: "offices",
    label: "Office",
    getValue: (c) => c.CL_Office,
    getLabel: (v) => officeLabel(v),
  },
  {
    key: "tiers",
    label: "Tier",
    getValue: (c) => c.CL_Tier,
    getLabel: (v) => tierLabel(v),
  },
  {
    key: "businessLeads",
    label: "Business Lead",
    searchable: true,
    getValue: (c) => c.CL_Business_Lead,
    getLabel: (v, ctx) => ctx.usersMap.get(v) ?? v,
  },
  {
    key: "clients",
    label: "Client",
    searchable: true,
    getValue: (c) => c.cl_id,
    getLabel: (v, ctx) => ctx.clientNames.get(v) ?? v,
  },
];
