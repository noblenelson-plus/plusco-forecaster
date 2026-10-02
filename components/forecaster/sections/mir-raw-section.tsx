// filepath: components/forecaster/sections/mir-raw-section.tsx
"use client";

/**
 * MIR RAW DATA page. Thin config over RawTablePage (per-agency Storage
 * snapshots, split on AGENCY): the filter bar fields, the team's column list,
 * and the money fields. All data + export handled by the scaffold.
 *
 * Columns: only the 30 fields the media team asked for are shown and exported
 * (`onlyListedColumns`), in this order; the snapshot's other ~40 columns (codes,
 * billing/payment statuses, vendor geography, MediaBox/SPOT matching, …) stay
 * out. Uses the live NATIVE spelling "Labs_Partners".
 */

import { Database } from "lucide-react";
import RawTablePage, { type RawFilterDef } from "./raw-table-page";

// Filter bar fields (snapshot column names), in the team's order.
const FILTERS: RawFilterDef[] = [
  { field: "PLUSCO_YEAR", label: "Year" },
  { field: "MONTH", label: "Month" },
  { field: "AGENCY", label: "Agency" },
  { field: "GM_POD", label: "GM Pod" },
  { field: "BU_REGION", label: "Region" },
  { field: "BUSINESS_LEAD", label: "Business Lead" },
  { field: "PLUSCO_CLIENT_NAME", label: "Client" },
];

// The columns shown and exported, in the team's order (live spellings).
const COLUMN_ORDER = [
  "SOURCE",
  "AGENCY",
  "BU_REGION",
  "GM_POD",
  "OFFICE",
  "BUSINESS_LEAD",
  "PLUSCO_CLIENT_NAME",
  "CLIENT",
  "ESTIMATE",
  "PLUSCO_MEDIA_CHANNEL",
  "MEDIA",
  "PRODUCT",
  "BUYTYPE",
  "PAYREP_CODE",
  "PAYREP",
  "VENDOR_CODE",
  "VENDOR",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_2026_DEALS",
  "PLUSCO_DEALS_Type",
  "PLUSCO_LOCAL_MEDIA",
  "Labs_Partners",
  "PO",
  "MCPE",
  "MONTH",
  "PLUSCO_QUARTER",
  "PLUSCO_YEAR",
  "CLIENT_CURRENCY_MO",
  "NET_ORDERED",
  "NET_ORDERED_CAD",
];

const MONEY_FIELDS = new Set(["NET_ORDERED", "NET_ORDERED_CAD"]);

export default function MirRawSection() {
  return (
    <RawTablePage
      title="MIR Raw Data"
      icon={Database}
      tableKey="mir"
      filters={FILTERS}
      columnOrder={COLUMN_ORDER}
      onlyListedColumns
      moneyFields={MONEY_FIELDS}
      exportTitle="MIR Raw Data"
    />
  );
}
