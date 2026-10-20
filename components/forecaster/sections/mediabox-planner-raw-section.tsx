// components/forecaster/sections/mediabox-planner-raw-section.tsx
"use client";

/**
 * MEDIABOX PLANNER DATA page (Reports). Thin config over RawTablePage: the
 * per-agency Storage snapshots of PCC_Media_Investment.finance_master_mapping
 * published by scripts/sync-mediabox-planner.mjs — one row per MediaBox tactic ×
 * month, planned net budget and MediaBox fees (commission / taxes / other_fees,
 * MediaBox v2 only) in the campaign currency, plus their CAD conversion
 * (FX_RATE_TO_CAD, BUDGET_CAD, COMMISSION_CAD, TAXES_CAD, OTHER_FEES_CAD,
 * CLIENT_COST_EXCL_TAXES_CAD, CLIENT_COST_INCL_TAXES_CAD). AGENCY_APP is the app agency the row is filed
 * under (the client's agency, else MediaBox's). Columns not listed below are
 * appended after these.
 */

import { ClipboardList } from "lucide-react";
import RawTablePage, { type RawFilterDef } from "./raw-table-page";

const FILTERS: RawFilterDef[] = [
  { field: "CL_Name", label: "Client" },
  { field: "AGENCY_APP", label: "Agency" },
  { field: "CL_Business_Unit_Region", label: "Region" },
  { field: "CL_Business_Lead", label: "Business Lead" },
  { field: "year", label: "Year" },
  { field: "month", label: "Month" },
  { field: "cmp_status", label: "Campaign Status" },
  { field: "PLUSCO_MEDIA_CHANNEL", label: "Media Channel" },
];

const COLUMN_ORDER = [
  "data_source",
  "AGENCY_APP",
  "CL_Name",
  "client",
  "campaign",
  "cmp_status",
  "cmp_start_date",
  "cmp_end_date",
  "tactic_label",
  "media_type",
  "PLUSCO_MEDIA_CHANNEL",
  "PLUSCO_MEDIA_PARTNER",
  "publisher",
  "PLUSCO_2026_DEALS",
  "market",
  "tactic_start_date",
  "tactic_end_date",
  "year",
  "month",
  "ref_currency",
  "monthly_tactic_media_budget",
  "commission",
  "taxes",
  "other_fees",
  "FX_RATE_TO_CAD",
  "BUDGET_CAD",
  "COMMISSION_CAD",
  "TAXES_CAD",
  "OTHER_FEES_CAD",
  "CLIENT_COST_EXCL_TAXES_CAD",
  "CLIENT_COST_INCL_TAXES_CAD",
  "commission_labels",
  "tax_labels",
  "other_fee_labels",
  "total_tactic_media_budget_ref_currency",
  "cmp_po",
  "tac_po",
  "cmp_billing_id",
  "tac_billing_id",
  "CL_ID",
  "client_id",
  "campaign_id",
  "tactic_id",
];

const MONEY_FIELDS = new Set([
  "monthly_tactic_media_budget",
  "commission",
  "taxes",
  "other_fees",
  "BUDGET_CAD",
  "COMMISSION_CAD",
  "TAXES_CAD",
  "OTHER_FEES_CAD",
  "CLIENT_COST_EXCL_TAXES_CAD",
  "CLIENT_COST_INCL_TAXES_CAD",
  "total_tactic_media_budget_ref_currency",
]);

export default function MediaboxPlannerRawSection() {
  return (
    <RawTablePage
      title="MediaBox Planner Data"
      icon={ClipboardList}
      tableKey="mediabox_planner"
      filters={FILTERS}
      columnOrder={COLUMN_ORDER}
      moneyFields={MONEY_FIELDS}
      exportTitle="MediaBox Planner Data"
    />
  );
}
