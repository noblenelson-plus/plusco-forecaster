// filepath: components/forecaster/sections/mir-raw-section.tsx
"use client";

/**
 * MIR RAW DATA page. Thin config over RawTablePage (BigQuery-backed): the
 * filter bar fields, the team's exact column order (from the sample CSV), and
 * the money fields. All data + export handled by the scaffold via /api/raw-table.
 *
 * Column order note: uses the live NATIVE spelling "Labs_Partners" (the CSV's
 * "LABS_PARTNERS" casing) and "MCPE_Match" is in the CSV but not the live table,
 * so it simply won't render. Live-only extras (media_spend_target_distributed,
 * IS_LABS_PARTNER, mb_2_0_*) append after the ordered columns.
 */

import { Database } from "lucide-react";
import RawTablePage, { type RawFilterDef } from "./raw-table-page";

// Filter bar fields — must match the route's MIR allowlist.
const FILTERS: RawFilterDef[] = [
  { field: "PLUSCO_YEAR", label: "Year" },
  { field: "MONTH", label: "Month" },
  { field: "BU_REGION", label: "Region" },
  { field: "BUSINESS_LEAD", label: "Business Lead" },
  { field: "GM_POD", label: "GM Pod" },
  { field: "PLUSCO_CLIENT_NAME", label: "Client" },
  { field: "AGENCY", label: "Agency" },
  { field: "PLUSCO_MEDIA_CHANNEL", label: "Media Channel" },
  { field: "CLIENT_STATUS_IN_2026", label: "Client Status" },
];

// The team's required column order (sample CSV), live spellings.
const COLUMN_ORDER = [
  "SOURCE",
  "MEDIA_CODE",
  "MEDIA",
  "CLIENT_CODE",
  "CLIENT",
  "PRODUCT_CODE",
  "PRODUCT",
  "ESTIMATE_CODE",
  "ESTIMATE",
  "VENDOR_CODE",
  "VENDOR",
  "MONTH",
  "PO",
  "PAYREP_CODE",
  "PAYREP",
  "OFFICE_CODE",
  "OFFICE",
  "BUYTYPE",
  "SREP",
  "PBB",
  "PLUSCO_QUARTER",
  "PLUSCO_YEAR",
  "MCPE",
  "NET_ORDERED",
  "NET_ORDERED_CAD",
  "BILLABLE_NET",
  "BILLED_NET",
  "PAYABLE_NET",
  "PAID_NET",
  "PCT_BILLED",
  "PCT_PAID",
  "BILLING_FORMULA",
  "CLIENT_INTERCO",
  "PLUSCO_CLIENT_NAME",
  "PLUSCO_CLIENT_ID",
  "CLIENT_CURRENCY_MO",
  "CLIENT_STATUS_IN_2026",
  "MEDIABOX_FO_CURRENCY",
  "AGENCY",
  "BUSINESS_LEAD",
  "BU_REGION",
  "GM_POD",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_PROGRAMMATIC",
  "PLUSCO_PAY_REP",
  "PLUSCO_2026_DEALS",
  "PLUSCO_DEALS_Category",
  "PLUSCO_DEALS_Channel",
  "PLUSCO_DEALS_Type",
  "PLUSCO_MEDIA_PARTNER",
  "PLUSCO_PARTNER_RepHouseTag",
  "PLUSCO_MEDIA_OWNER",
  "PLUSCO_LOCAL_MEDIA",
  "PLUSCO_VENDOR_COUNTRY",
  "PLUSCO_VENDOR_PROVINCE",
  "PLUSCO_VENDOR_MARKET",
  "PLUSCO_VENDOR_LANGUAGE",
  "PLUSCO_VENDOR_LANGUAGE_Detail",
  "PLUSCO_VENDOR_AUDIENCE",
  "PLUSCO_CONVENTIONAL_SPECIALTY",
  "SPOT_Type",
  "SPOT_MARKET_CODE",
  "SPOT_MARKET_NAME",
  "present_in_Database_2_0",
  "Prog_and_SEM",
  "Mediabox_2_0_MCPE",
  "Mediabox_2_0_Campaign_Name",
  "MCPE_Match",
  "Labs_Partners",
];

const MONEY_FIELDS = new Set([
  "NET_ORDERED",
  "NET_ORDERED_CAD",
  "BILLABLE_NET",
  "BILLED_NET",
  "PAYABLE_NET",
  "PAID_NET",
  "media_spend_target_distributed",
]);

export default function MirRawSection() {
  return (
    <RawTablePage
      title="MIR Raw Data"
      icon={Database}
      tableKey="mir"
      filters={FILTERS}
      columnOrder={COLUMN_ORDER}
      moneyFields={MONEY_FIELDS}
      exportTitle="MIR Raw Data"
    />
  );
}
