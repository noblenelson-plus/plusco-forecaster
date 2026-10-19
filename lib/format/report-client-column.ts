// lib/format/report-client-column.ts

/**
 * The Forecaster client id column of each Reports table (MIR Raw Data,
 * Billing Summary, MediaBox Planner Data). Rows are filtered on it when MediaBox allocations apply:
 * server-side by the report-file route (lib/server/report-filter.ts), and in
 * the browser when an admin views the dashboard as someone else.
 */
export const REPORT_CLIENT_COLUMN: Record<string, string> = {
  mir: "PLUSCO_CLIENT_ID",
  billing: "forecaster_client_id",
  mediabox_planner: "CL_ID",
};
