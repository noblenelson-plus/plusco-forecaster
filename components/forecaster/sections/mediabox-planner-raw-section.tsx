// components/forecaster/sections/mediabox-planner-raw-section.tsx
"use client";

/**
 * MEDIABOX PLANNER DATA page (Reports). Thin config over RawTablePage: the
 * per-agency Storage snapshots of PCC_Media_Investment.finance_master_mapping
 * published by scripts/sync-mediabox-planner.mjs — one row per MediaBox tactic ×
 * month, planned net budget and MediaBox fees (commission / taxes / other_fees,
 * MediaBox v2 only) in the campaign currency, plus their CAD conversion.
 * AGENCY_APP is the app agency the row is filed under (the client's agency,
 * else MediaBox's).
 *
 * Only the columns listed below are shown / exported (Adriana's review of the
 * download, 2026-11-02: internal ids, MediaBox-side duplicates of the client
 * attributes and the FX rate were removed). BUDGET_CAD is exported as
 * monthly_tactic_media_budget_CAD (it is that column converted to CAD). 2025
 * rows are hidden — the snapshot still carries them.
 */

import { ClipboardList } from "lucide-react";
import RawTablePage, { type RawFilterDef } from "./raw-table-page";

const FILTERS: RawFilterDef[] = [
  { field: "year", label: "Year" },
  { field: "month", label: "Month" },
  { field: "AGENCY_APP", label: "Agency" },
  { field: "GM_Pod", label: "GM Pod" },
  { field: "CL_Business_Unit_Region", label: "Region" },
  { field: "CL_Business_Lead", label: "Business Lead" },
  { field: "CL_Name", label: "Client" },
];

const COLUMN_ORDER = [
  "data_source",
  "AGENCY_APP",
  "client",
  "campaign",
  "cmp_start_date",
  "cmp_end_date",
  "tactic_label",
  "media_type",
  "publisher",
  "PLUSCO_2026_DEALS",
  "tactic_start_date",
  "tactic_end_date",
  "year",
  "month",
  "ref_currency",
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
  "commission_labels",
  "tax_labels",
  "other_fee_labels",
  "cmp_po",
  "tac_billing_id",
  "path_params",
  "lob",
  "key_po",
  "key_billing_id",
  "inventory",
  "programmatic_buying_method",
  "channel",
  "placement_location",
  "publisher_features",
  "language",
  "format",
  "CL_Agency",
  "CL_Business_Unit_Region",
  "CL_Office",
  "CL_Business_Lead",
  "CL_Digital_Lead",
  "GM_Pod",
  "Plusco_media_partner_split",
  "PLUSCO_DEALS_Type",
  "PLUSCO_LOCAL_MEDIA",
];

const COLUMN_LABELS: Record<string, string> = {
  BUDGET_CAD: "monthly_tactic_media_budget_CAD",
};

/** Years hidden from the download (the snapshot still carries them). */
const EXCLUDED_VALUES: Record<string, string[]> = { year: ["2025"] };

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
]);

export default function MediaboxPlannerRawSection() {
  return (
    <RawTablePage
      title="MediaBox Planner Data"
      icon={ClipboardList}
      tableKey="mediabox_planner"
      filters={FILTERS}
      columnOrder={COLUMN_ORDER}
      onlyListedColumns
      columnLabels={COLUMN_LABELS}
      excludeValues={EXCLUDED_VALUES}
      moneyFields={MONEY_FIELDS}
      exportTitle="MediaBox Planner Data"
    />
  );
}
