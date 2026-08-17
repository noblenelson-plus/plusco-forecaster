// filepath: components/forecaster/sections/billing-summary-section.tsx
"use client";

/**
 * BILLING SUMMARY page. Thin config over RawTablePage (BigQuery-backed). Column
 * order follows the Looker dimension order from the report screenshots; filters
 * match the route's billing allowlist. Live-only extras (forecaster_client_*,
 * mb_2_0_*, INVOICE_MONTH) append after the ordered columns.
 */

import { Receipt } from "lucide-react";
import RawTablePage, { type RawFilterDef } from "./raw-table-page";

// Filter bar fields — must match the route's billing allowlist.
const FILTERS: RawFilterDef[] = [
  { field: "PLUSCO_CLIENT_NAME", label: "Client" },
  { field: "AGENCY", label: "Agency" },
  { field: "PLUSCO_BU_REGION", label: "Region" },
  { field: "PLUSCO_BUSINESS_LEAD", label: "Business Lead" },
  { field: "INVOICE_MONTH", label: "Invoice Month" },
  { field: "MEDIA_NAME", label: "Media" },
];

// Column order from the Billing Summary report screenshots.
const COLUMN_ORDER = [
  "SOURCE",
  "AGENCY",
  "PLUSCO_AGENCY",
  "PLUSCO_BU_REGION",
  "PLUSCO_BUSINESS_LEAD",
  "PLUSCO_CLIENT_NAME",
  "LOB_BILL_TO",
  "OLGC",
  "MAIN_ACCOUNT",
  "DEPT",
  "COST_CENTER",
  "BRAND_NAME",
  "MEDIA_NAME",
  "MEDIA_CODE",
  "CLIENT_NAME",
  "CLIENT_CODE",
  "PRODUCT_CODE",
  "ESTIMATE_CODE",
  "ESTIMATE_NAME",
  "MPA",
  "PO",
  "INVOICENO",
  "INVOICE_DATE",
  "INVOICE_MONTH",
  "MOSERV",
  "DUEDATE",
  "BALANCE",
  "BILLEDNET",
  "COMMISSION",
  "BILNETANDCOM",
  "GST",
  "HST",
  "QST",
  "TOTALTAXES",
  "TOTALINVAMT",
  "CREDITS",
  "BILL_TOTAL",
  "MCPE",
];

const MONEY_FIELDS = new Set([
  "BALANCE",
  "BILLEDNET",
  "BILL_TOTAL",
  "BILNETANDCOM",
  "COMMISSION",
  "CREDITS",
  "GST",
  "HST",
  "QST",
  "TOTALINVAMT",
  "TOTALTAXES",
]);

export default function BillingSummarySection() {
  return (
    <RawTablePage
      title="Billing Summary"
      icon={Receipt}
      tableKey="billing"
      filters={FILTERS}
      columnOrder={COLUMN_ORDER}
      moneyFields={MONEY_FIELDS}
      exportTitle="Billing Summary"
    />
  );
}
